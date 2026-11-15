/* v11 组件消融基建：
 * 1. 生成消融副本（src/lib/game/ 下，保证相对导入可用；实验后删除）：
 *    - ai-v11-ab-base.ts：四组件全关（≈ v10.5 行为基线）
 *    - ai-v11-ab-<cm|lmr2|ttd|pw>.ts：仅启用对应组件
 *    - ai-v11-ab-full.ts：四组件全开（= 当前 ai.ts）
 * 2. timing 子命令：固定局面集上对比各副本的完成深度/节点数（效率信号）
 * 3. duel 子命令：base vs 指定副本（或 full）的等预算对决，JSONL 断点续跑
 * 用法：
 *   bun scripts/ab-v11.ts gen
 *   bun scripts/ab-v11.ts timing budget=1200 level=4
 *   bun scripts/ab-v11.ts duel comp=cm budget=800 games=10 level=3
 *   bun scripts/ab-v11.ts duel comp=full budget=800 games=10 level=3 log=/tmp/ab-full.jsonl
 */
import { initialGame, type GameState, type Wall, type AiLevel } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves, checkWall } from "../src/lib/game/engine";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src/lib/game");
const COMPS = ["cm", "lmr2", "ttd", "pw"] as const;
type Comp = (typeof COMPS)[number];
/* 组合变体：core = cm+lmr2+ttd（无 pw）；l2t = lmr2+ttd（无 cm 无 pw） */
const COMBOS: Record<string, Comp[]> = { core: ["cm", "lmr2", "ttd"], l2t: ["lmr2", "ttd"] };

const SWITCH_LINES: Record<Comp, string> = {
  cm: /const OFF_CM = !!ENV\.QUORIDOR_AI_OFF_CM;.*/,
  lmr2: /const OFF_LMR2 = !!ENV\.QUORIDOR_AI_OFF_LMR2;.*/,
  ttd: /const OFF_TTD = !!ENV\.QUORIDOR_AI_OFF_TTD;.*/,
  pw: /const OFF_PW = !ON_PW;.*/,
};

type AiModule = {
  computeAiMove: typeof import("../src/lib/game/ai").computeAiMove;
  lastSearchStats: () => { nodes: number; depth: number; elapsedMs: number; qnodes: number };
};

function genAll() {
  const src = readFileSync(join(DIR, "ai.ts"), "utf8");
  const off = (c: Comp, s: string) => s.replace(SWITCH_LINES[c], `const OFF_${c.toUpperCase()} = true; /* ab-v11 副本 */`);
  const write = (name: string, content: string) => {
    if (content === src && name !== "ai-v11-ab-full.ts") {
      console.error(`!! 生成 ${name} 失败：开关行未匹配`);
      process.exit(1);
    }
    writeFileSync(join(DIR, name), content);
  };
  let base = src;
  for (const c of COMPS) base = off(c, base);
  write("ai-v11-ab-base.ts", base);
  for (const c of COMPS) {
    let v = base;
    /* 变体 = base + 恢复目标组件开（其余保持关） */
    v = v.replace(`const OFF_${c.toUpperCase()} = true; /* ab-v11 副本 */`, `const OFF_${c.toUpperCase()} = false; /* ab-v11 变体：仅此组件启用 */`);
    write(`ai-v11-ab-${c}.ts`, v);
  }
  for (const [name, comps] of Object.entries(COMBOS)) {
    let v = base;
    for (const c of comps) {
      v = v.replace(`const OFF_${c.toUpperCase()} = true; /* ab-v11 副本 */`, `const OFF_${c.toUpperCase()} = false; /* ab-v11 组合变体 */`);
    }
    if (v === base) {
      console.error(`!! 生成组合 ${name} 失败`);
      process.exit(1);
    }
    write(`ai-v11-ab-${name}.ts`, v);
  }
  write("ai-v11-ab-full.ts", src);
  console.log("已生成：base / cm / lmr2 / ttd / pw / full（src/lib/game/ai-v11-ab-*.ts）");
}

async function loadMods(): Promise<Record<string, AiModule>> {
  const names = ["base", ...COMPS, ...Object.keys(COMBOS), "full"];
  const mods: Record<string, AiModule> = {};
  for (const n of names) {
    mods[n] = (await import(join(DIR, `ai-v11-ab-${n}.ts`))) as AiModule;
  }
  return mods;
}

/* —— 固定局面集：确定性构造的中局（不同墙型/距离形态） —— */
function buildPositions(): GameState[] {
  const mk = (seq: Array<{ p: "A" | "B"; mv: { t: "pawn"; to: { x: number; y: number } } | { t: "wall"; w: Wall } }>): GameState => {
    let s: GameState = initialGame();
    for (let si = 0; si < seq.length; si++) {
      const step = seq[si];
      if (step.mv.t === "pawn") {
        const from = step.p === "A" ? s.posA : s.posB;
        const r = applyPayload(s, step.p, { type: "pawn", from: { ...from }, to: { ...step.mv.to } });
        if (!r.state) throw new Error(`bad seq #${si} (${step.p} pawn → ${JSON.stringify(step.mv.to)}): ${r.reason ?? ""}`);
        s = r.state;
      } else {
        const r = applyPayload(s, step.p, { type: "wall", wall: { ...step.mv.w, by: step.p } });
        if (!r.state) throw new Error(`bad seq #${si} (${step.p} wall ${JSON.stringify(step.mv.w)}): ${r.reason ?? ""}`);
        s = r.state;
      }
    }
    return s;
  };
  return [
    /* 中局竞速 + 两侧漏斗 */
    mk([
      { p: "A", mv: { t: "pawn", to: { x: 4, y: 7 } } },
      { p: "B", mv: { t: "pawn", to: { x: 4, y: 1 } } },
      { p: "A", mv: { t: "wall", w: { x: 3, y: 3, o: "h", by: "A" } } },
      { p: "B", mv: { t: "wall", w: { x: 5, y: 4, o: "v", by: "B" } } },
      { p: "A", mv: { t: "pawn", to: { x: 4, y: 6 } } },
      { p: "B", mv: { t: "pawn", to: { x: 4, y: 2 } } },
      { p: "A", mv: { t: "wall", w: { x: 5, y: 3, o: "h", by: "A" } } },
      { p: "B", mv: { t: "pawn", to: { x: 4, y: 3 } } },
    ]),
    /* 贴身缠斗 */
    mk([
      { p: "A", mv: { t: "pawn", to: { x: 4, y: 7 } } },
      { p: "B", mv: { t: "pawn", to: { x: 4, y: 1 } } },
      { p: "A", mv: { t: "pawn", to: { x: 4, y: 6 } } },
      { p: "B", mv: { t: "pawn", to: { x: 4, y: 2 } } },
      { p: "A", mv: { t: "pawn", to: { x: 4, y: 5 } } },
      { p: "B", mv: { t: "pawn", to: { x: 4, y: 3 } } },
      { p: "A", mv: { t: "pawn", to: { x: 4, y: 4 } } },
      { p: "B", mv: { t: "wall", w: { x: 3, y: 4, o: "h", by: "B" } } },
    ]),
    /* 开局换先（B 已放一板） */
    mk([
      { p: "A", mv: { t: "pawn", to: { x: 4, y: 7 } } },
      { p: "B", mv: { t: "wall", w: { x: 4, y: 6, o: "h", by: "B" } } },
      { p: "A", mv: { t: "pawn", to: { x: 3, y: 7 } } },
      { p: "B", mv: { t: "pawn", to: { x: 4, y: 1 } } },
      { p: "A", mv: { t: "pawn", to: { x: 3, y: 6 } } },
    ]),
    /* 深墙阵残局 */
    mk([
      { p: "A", mv: { t: "wall", w: { x: 2, y: 2, o: "v", by: "A" } } },
      { p: "B", mv: { t: "wall", w: { x: 6, y: 5, o: "v", by: "B" } } },
      { p: "A", mv: { t: "pawn", to: { x: 4, y: 7 } } },
      { p: "B", mv: { t: "wall", w: { x: 2, y: 4, o: "v", by: "B" } } },
      { p: "A", mv: { t: "pawn", to: { x: 4, y: 6 } } },
      { p: "B", mv: { t: "pawn", to: { x: 4, y: 1 } } },
      { p: "A", mv: { t: "wall", w: { x: 6, y: 2, o: "v", by: "A" } } },
      { p: "B", mv: { t: "pawn", to: { x: 4, y: 2 } } },
      { p: "A", mv: { t: "pawn", to: { x: 4, y: 5 } } },
      { p: "B", mv: { t: "pawn", to: { x: 4, y: 3 } } },
      { p: "A", mv: { t: "pawn", to: { x: 3, y: 5 } } },
    ]),
  ];
}

/* —— timing：固定局面、同预算、重复 R 轮取平均 —— */
async function timing(budget: number, level: AiLevel, rounds: number) {
  const mods = await loadMods();
  const positions = buildPositions();
  const names = Object.keys(mods);
  console.log(`== timing：${positions.length} 局面 × ${rounds} 轮 × 预算 ${budget}ms · L${level} ==`);
  for (const n of names) {
    let depthSum = 0;
    let nodeSum = 0;
    let msSum = 0;
    let cnt = 0;
    for (let r = 0; r < rounds; r++) {
      for (const pos of positions) {
        const s: GameState = JSON.parse(JSON.stringify(pos));
        if (s.winner) continue;
        mods[n].computeAiMove(s, level, { budgetMs: budget });
        const st = mods[n].lastSearchStats();
        depthSum += st.depth;
        nodeSum += st.nodes;
        msSum += st.elapsedMs;
        cnt++;
      }
    }
    console.log(
      `${n.padEnd(5)} 平均完成深度 ${(depthSum / cnt).toFixed(2)} · 平均节点 ${(nodeSum / cnt).toFixed(0)} · 平均用时 ${(msSum / cnt).toFixed(0)}ms`,
    );
  }
}

/* —— timing1：单模块独立进程计时（消除 JIT/加载顺序伪影） —— */
async function timing1(name: string, budget: number, level: AiLevel, rounds: number) {
  const mods = await loadMods();
  const mod = (mods as Record<string, AiModule>)[name];
  if (!mod) {
    console.error(`未知模块：${name}`);
    process.exit(1);
  }
  const positions = buildPositions();
  let depthSum = 0;
  let nodeSum = 0;
  let msSum = 0;
  let cnt = 0;
  for (let r = 0; r < rounds; r++) {
    for (const pos of positions) {
      const s: GameState = JSON.parse(JSON.stringify(pos));
      if (s.winner) continue;
      mod.computeAiMove(s, level, { budgetMs: budget });
      const st = mod.lastSearchStats();
      depthSum += st.depth;
      nodeSum += st.nodes;
      msSum += st.elapsedMs;
      cnt++;
    }
  }
  console.log(
    `timing1 ${name} L${level} B${budget} ×${rounds}：平均完成深度 ${(depthSum / cnt).toFixed(2)} · 平均节点 ${(nodeSum / cnt).toFixed(0)} · 平均用时 ${(msSum / cnt).toFixed(0)}ms`,
  );
}

/* —— duel：base vs variant，等预算（±15% 抖动），换色，断点续跑 —— */
function playGame(
  engA: AiModule["computeAiMove"],
  engB: AiModule["computeAiMove"],
  level: AiLevel,
  cap: number,
): { winner: "A" | "B" | null; moves: number; illegal: number } {
  let s: GameState = initialGame();
  let guard = 0;
  let illegal = 0;
  const jitter = () => ({ budgetMs: Math.round(cap * (0.85 + Math.random() * 0.3)) });
  while (!s.winner && guard < 400) {
    guard++;
    const d = s.turn === "A" ? engA(s, level, jitter()) : engB(s, level, jitter());
    if (!d) break;
    if (d.payload.type === "pawn") {
      const legal = legalPawnMoves(s, s.turn);
      if (!legal.some((v) => v.x === d.payload.to?.x && v.y === d.payload.to?.y)) {
        illegal++;
        const alt = legal[0];
        if (alt) {
          s = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: alt }).state!;
          continue;
        }
      }
    }
    if (d.payload.type === "wall" && d.payload.wall) {
      const chk = checkWall(s, d.payload.wall.x, d.payload.wall.y, d.payload.wall.o, s.turn);
      if (!chk.ok) {
        illegal++;
        const legal = legalPawnMoves(s, s.turn);
        if (legal.length > 0) {
          s = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: legal[0] }).state!;
          continue;
        }
      }
    }
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) {
      illegal++;
      const legal = legalPawnMoves(s, s.turn);
      if (legal.length > 0) {
        s = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: legal[0] }).state!;
        continue;
      }
      break;
    }
    s = r.state;
  }
  return { winner: s.winner as "A" | "B" | null, moves: s.history.length, illegal };
}

async function duel(comp: string, budget: number, games: number, level: AiLevel, logPath: string, vsComp = "base") {
  const mods = await loadMods();
  const variant = comp === "all" ? mods.full : (mods as Record<string, AiModule>)[comp];
  const opponent = (mods as Record<string, AiModule>)[vsComp] ?? mods.base;
  if (!variant) {
    console.error(`未知组件：${comp}`);
    process.exit(1);
  }
  const label = comp === "all" ? "full" : comp;
  const oppLabel = vsComp;
  /* 断点续跑：读日志，跳过已完成的局 */
  const done: number[] = [];
  if (existsSync(logPath)) {
    for (const line of readFileSync(logPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        done.push(JSON.parse(line).i);
      } catch {
        /* 忽略残行 */
      }
    }
  }
  let baseWins = 0;
  let varWins = 0;
  let movesSum = 0;
  let played = 0;
  const t0 = Date.now();
  for (let i = 0; i < games * 2; i++) {
    if (done.includes(i)) continue;
    const varIsA = i % 2 === 0;
    const r = playGame(varIsA ? variant.computeAiMove : opponent.computeAiMove, varIsA ? opponent.computeAiMove : variant.computeAiMove, level, budget);
    let varWin = false;
    if (r.winner === "A" && varIsA) varWin = true;
    if (r.winner === "B" && !varIsA) varWin = true;
    if (varWin) varWins++;
    else if (r.winner) baseWins++;
    movesSum += r.moves;
    played++;
    appendFileSync(logPath, `${JSON.stringify({ i, varIsA, winner: r.winner, moves: r.moves, illegal: r.illegal })}\n`);
    console.log(
      `  [${label} 第${i + 1}局] ${label}执${varIsA ? "甲" : "乙"} · 胜者=${r.winner ?? "无"} · ${r.moves} 手 · 累计 ${label} ${varWins} : ${baseWins} ${oppLabel} · ${Math.round((Date.now() - t0) / 1000)}s`,
    );
  }
  const tot = played + done.length;
  console.log(
    `===== ${label} vs ${oppLabel}（L${level} · 等预算 ${budget}ms · ${tot} 局）: ${label} ${varWins} : ${baseWins} ${oppLabel} =====`,
  );
}

const args = process.argv.slice(2);
const cmd = args[0] ?? "gen";
const a = (k: string, d: number) => {
  const f = args.find((x) => x.startsWith(k + "="));
  return f ? Number(f.split("=")[1]) : d;
};
const s = (k: string, d: string) => {
  const f = args.find((x) => x.startsWith(k + "="));
  return f ? f.split("=")[1] : d;
};

if (cmd === "gen") {
  genAll();
} else if (cmd === "timing") {
  await timing(a("budget", 1200), a("level", 4) as AiLevel, a("rounds", 2));
} else if (cmd === "timing1") {
  await timing1(s("name", "base"), a("budget", 1200), a("level", 4) as AiLevel, a("rounds", 3));
} else if (cmd === "duel") {
  await duel(
    s("comp", "full"),
    a("budget", 800),
    a("games", 5),
    a("level", 3) as AiLevel,
    s("log", `/tmp/ab-v11-${s("comp", "full")}-L${a("level", 3)}-B${a("budget", 800)}${s("vs", "base") !== "base" ? "-vs" + s("vs", "base") : ""}.jsonl`),
    s("vs", "base"),
  );
} else {
  console.error("未知子命令：gen | timing | duel");
  process.exit(1);
}
