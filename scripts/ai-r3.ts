/* 第三轮强化（v6）验证：
 *  - ab <pairs>        ：等预算 500ms 的 L4×L3（消融开关经环境变量传入，本进程生效）
 *  - matrix <pairs>    ：依次派生子进程跑 baseline/OFF_QS/OFF_NMP/OFF_QS_NMP/OFF_WP/OFF_PTT
 *  - trace <pairs>     ：原生预算 L4×L3，记录双方每手板经济学 → scripts/r3-trace.json
 *  - 4p <n>            ：四人桌梯度表（高低档对位 ×3 组）
 *  - micro             ：微测试（改码后回归）
 * bun run scripts/ai-r3.ts <mode> ...
 */
import { spawnSync } from "node:child_process";
import { initialGame, type AiLevel, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves, shortestPathLength, wallsLeftOf } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";

const timeStat = new Map<AiLevel, { n: number; max: number; sum: number }>();
function stat(level: AiLevel, ms: number) {
  const s = timeStat.get(level) ?? { n: 0, max: 0, sum: 0 };
  s.n++;
  s.max = Math.max(s.max, ms);
  s.sum += ms;
  timeStat.set(level, s);
}

function safeStep(s: GameState, level: AiLevel, cap?: number): GameState {
  const t0 = Date.now();
  const d = computeAiMove(s, level, cap ? { budgetMs: cap } : undefined);
  stat(level, Date.now() - t0);
  if (!d) return s;
  const r = applyPayload(s, s.turn, d.payload);
  if (r.ok && r.state) return r.state;
  const legal = legalPawnMoves(s, s.turn);
  if (legal.length > 0) {
    const r2 = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: legal[0] });
    if (r2.ok && r2.state) return r2.state;
  }
  return s;
}

function play2(a: AiLevel, b: AiLevel, cap?: number): { winner: Player | null; moves: number } {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 500) {
    guard++;
    s = safeStep(s, s.turn === "A" ? a : b, cap);
  }
  return { winner: s.winner, moves: s.history.length };
}

function series(name: string, hi: AiLevel, lo: AiLevel, pairs: number, cap?: number) {
  let hiWins = 0;
  let loWins = 0;
  let moves = 0;
  const t0 = Date.now();
  for (let i = 0; i < pairs; i++) {
    const g = play2(hi, lo, cap);
    if (g.winner === "A") hiWins++;
    else if (g.winner === "B") loWins++;
    moves += g.moves;
  }
  for (let i = 0; i < pairs; i++) {
    const g = play2(lo, hi, cap);
    if (g.winner === "A") loWins++;
    else if (g.winner === "B") hiWins++;
    moves += g.moves;
  }
  console.log(
    `${name}: L${hi} ${hiWins}胜 vs L${lo} ${loWins}胜 · 均${Math.round(moves / (2 * pairs))}手 · ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
  return hiWins;
}

function dumpTiming() {
  for (const [lv, s] of [...timeStat.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  L${lv}: ${s.n}手 · 均${Math.round(s.sum / s.n)}ms · 最长${s.max}ms`);
  }
}

/* ============ trace：原生预算行迹 + 板经济学 ============ */

interface TraceMove {
  game: number;
  seat: Player;
  level: AiLevel;
  moveNo: number;
  type: "pawn" | "wall" | "other";
  detail: string;
  myD: number;
  opD: number;
  gain?: number; // wall: 对手路径增量
  harm?: number; // wall: 己方路径增量
  myWallsAfter?: number;
  depth?: number;
  elapsedMs?: number;
  score?: number;
}

function traceSeries(pairs: number) {
  const moves: TraceMove[] = [];
  const results: Array<{ game: number; l4Seat: Player; winner: Player | null }> = [];
  for (let g = 0; g < 2 * pairs; g++) {
    const l4Seat: Player = g % 2 === 0 ? "A" : "B";
    const l4: AiLevel = 4;
    const l3: AiLevel = 3;
    let s: GameState = initialGame();
    let guard = 0;
    let moveNo = 0;
    while (!s.winner && guard < 500) {
      guard++;
      moveNo++;
      const mover = s.turn;
      const level = mover === l4Seat ? l4 : l3;
      const myD = shortestPathLength(s, mover);
      const op = mover === "A" ? "B" : "A";
      const opD = shortestPathLength(s, op);
      const t0 = Date.now();
      const d = computeAiMove(s, level);
      const elapsed = Date.now() - t0;
      const st = lastSearchStats();
      const r = d ? applyPayload(s, mover, d.payload) : null;
      const ns = r && r.ok && r.state ? r.state : s;
      const rec: TraceMove = {
        game: g + 1,
        seat: mover,
        level,
        moveNo,
        type: d?.payload.type === "pawn" ? "pawn" : d?.payload.type === "wall" ? "wall" : "other",
        detail:
          d?.payload.type === "pawn"
            ? `(${d.payload.from.x},${d.payload.from.y})->(${d.payload.to.x},${d.payload.to.y})`
            : d?.payload.type === "wall"
              ? `wall ${d.payload.wall.x},${d.payload.wall.y}-${d.payload.wall.o}`
              : "none",
        myD,
        opD,
        depth: st.depth,
        elapsedMs: elapsed,
        score: d?.score,
      };
      if (rec.type === "wall" && d?.payload.type === "wall") {
        const newMyD = shortestPathLength(ns, mover);
        const newOpD = shortestPathLength(ns, op);
        rec.gain = newOpD - opD;
        rec.harm = newMyD - myD;
        rec.myWallsAfter = wallsLeftOf(ns, mover);
      }
      moves.push(rec);
      s = ns;
    }
    results.push({ game: g + 1, l4Seat, winner: s.winner });
    const l4Moves = moves.filter((m) => m.game === g + 1 && m.level === 4);
    const l3Moves = moves.filter((m) => m.game === g + 1 && m.level === 3);
    const wallsOf = (ms: TraceMove[]) => ms.filter((m) => m.type === "wall");
    const summarize = (ms: TraceMove[]) => {
      const w = wallsOf(ms);
      const gains = w.map((m) => m.gain ?? 0);
      const harms = w.map((m) => m.harm ?? 0);
      return `板${w.length} 增益[${gains.join(",") || "-"}] 自伤[${harms.join(",") || "-"}]`;
    };
    console.log(
      `#${g + 1} L4坐${l4Seat} 胜者${s.winner ?? "无"} ${s.winner === l4Seat ? "【L4胜】" : s.winner ? "【L4负】" : ""} | L4: ${summarize(l4Moves)} | L3: ${summarize(l3Moves)}`,
    );
  }
  /* 汇总 */
  const l4All = moves.filter((m) => m.level === 4);
  const l3All = moves.filter((m) => m.level === 3);
  const eco = (ms: TraceMove[]) => {
    const w = ms.filter((m) => m.type === "wall");
    const avgGain = w.length ? w.reduce((a, m) => a + (m.gain ?? 0), 0) / w.length : 0;
    const avgHarm = w.length ? w.reduce((a, m) => a + (m.harm ?? 0), 0) / w.length : 0;
    const tiny = w.filter((m) => (m.gain ?? 0) < 2).length;
    const aheadTiny = w.filter((m) => (m.gain ?? 0) < 2 && m.myD <= m.opD - 2).length;
    const selfHurt = w.filter((m) => (m.harm ?? 0) >= 2).length;
    return { walls: w.length, avgGain: +avgGain.toFixed(2), avgHarm: +avgHarm.toFixed(2), tiny, aheadTiny, selfHurt };
  };
  const summary = {
    results,
    l4: eco(l4All),
    l3: eco(l3All),
    l4Depth: l4All.length
      ? {
          avg: +(l4All.reduce((a, m) => a + (m.depth ?? 0), 0) / l4All.length).toFixed(1),
          min: Math.min(...l4All.map((m) => m.depth ?? 99)),
          max: Math.max(...l4All.map((m) => m.depth ?? 0)),
        }
      : null,
    l4Elapsed: l4All.length
      ? {
          avg: Math.round(l4All.reduce((a, m) => a + (m.elapsedMs ?? 0), 0) / l4All.length),
          max: Math.max(...l4All.map((m) => m.elapsedMs ?? 0)),
        }
      : null,
  };
  console.log("=== 汇总 ===");
  console.log(JSON.stringify(summary, null, 1));
  await_write(moves, summary);
}

function await_write(moves: TraceMove[], summary: unknown) {
  const fs = require("node:fs") as typeof import("node:fs");
  fs.writeFileSync(
    "/home/z/my-project/scripts/r3-trace.json",
    JSON.stringify({ summary, moves }, null, 1),
  );
}

/* ============ 4p：四人桌梯度 ============ */

function play4(levels: Record<Player, AiLevel>): Player | null {
  let s: GameState = initialGame({ playerCount: 4 });
  let guard = 0;
  while (!s.winner && guard < 800) {
    guard++;
    s = safeStep(s, levels[s.turn as Player]);
  }
  return s.winner;
}

function line4(name: string, levels: Record<Player, AiLevel>, n4: number) {
  const wins: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (let i = 0; i < n4; i++) {
    const w = play4(levels);
    if (w) wins[w]++;
  }
  console.log(`${name} · 甲L${levels.A}${wins.A} 乙L${levels.B}${wins.B} 丙L${levels.C}${wins.C} 丁L${levels.D}${wins.D}`);
}

/* ============ matrix：消融矩阵（派生子进程，环境变量隔离） ============ */

function matrix(pairs: number) {
  const configs: Array<{ name: string; env: Record<string, string> }> = [
    { name: "baseline", env: {} },
    { name: "OFF_QS", env: { QUORIDOR_AI_OFF_QS: "1" } },
    { name: "OFF_NMP", env: { QUORIDOR_AI_OFF_NMP: "1" } },
    { name: "OFF_QS+NMP", env: { QUORIDOR_AI_OFF_QS: "1", QUORIDOR_AI_OFF_NMP: "1" } },
    { name: "OFF_WP", env: { QUORIDOR_AI_OFF_WP: "1" } },
    { name: "OFF_PTT", env: { QUORIDOR_AI_OFF_PTT: "1" } },
  ];
  for (const cfg of configs) {
    console.log(`\n>>> [${cfg.name}] L4 × L3 等预算 800ms × ${pairs} 对`);
    const r = spawnSync("bun", ["run", "scripts/ai-r3.ts", "ab", String(pairs), "800"], {
      cwd: "/home/z/my-project",
      env: { ...process.env, ...cfg.env },
      stdio: "inherit",
    });
    if (r.status !== 0) console.log(`  [${cfg.name}] 子进程异常 status=${r.status}`);
  }
}

/* ============ micro：微测试 ============ */

function micro() {
  console.log("=== v6 微测试 ===");
  /* 1. 社长竞速纪律：对手无板且我不落后 → 板的增益必须 ≥2，否则走子 */
  {
    const s = initialGame();
    s.posA = { x: 4, y: 2 }; /* A 上行距 2 */
    s.posB = { x: 4, y: 5 }; /* B 下行距 3，A 领先 1 */
    s.wallsA = 10;
    s.wallsB = 0; /* 对手无板 → 纪律生效 */
    s.turn = "A";
    const d = computeAiMove(s, 4, { budgetMs: 1500 });
    let ok = false;
    let info = "";
    if (d?.payload.type === "pawn") {
      ok = true;
      info = "走子";
    } else if (d?.payload.type === "wall") {
      const r = applyPayload(s, "A", d.payload);
      const gain = r.state ? shortestPathLength(r.state, "B") - 3 : -99;
      ok = gain >= 2;
      info = `放板 增益${gain}`;
    }
    console.log(`1) 竞速纪律（对手无板我领先）: ${ok ? `✓（${info}）` : `✗（${info}）`}`);
  }
  /* 2. 同局面对手有板 → 正常博弈不受门控影响 */
  {
    const s = initialGame();
    s.posA = { x: 4, y: 2 };
    s.posB = { x: 4, y: 5 };
    s.wallsA = 10;
    s.wallsB = 10;
    s.turn = "A";
    const d = computeAiMove(s, 4, { budgetMs: 1500 });
    console.log(`2) 对手有板正常博弈: ${d ? `✓（${d.payload.type}）` : "✗ 无决策"}`);
  }
  /* 3. 原生预算计时：新外推早停应吃满预算（>3s）而非 55% 空转 */
  {
    const s = initialGame();
    s.posA = { x: 4, y: 6 };
    s.posB = { x: 4, y: 2 };
    s.turn = "A";
    const t0 = Date.now();
    computeAiMove(s, 4);
    const ms = Date.now() - t0;
    console.log(`3) 社长原生预算开局一手: ${ms}ms（>3000 为预算吃满 ✓）完成深度 ${lastSearchStats().depth}`);
  }
  /* 4-6. 学徒 v3 回归（r2 用例） */
  {
    const s = initialGame();
    s.posA = { x: 4, y: 8 };
    s.posB = { x: 4, y: 6 };
    s.wallsA = 5;
    s.wallsB = 0;
    s.turn = "A";
    const d = computeAiMove(s, 1);
    console.log(`4) 学徒终局封路: ${d?.payload.type === "wall" ? "放板 ✓" : `✗（${d?.payload.type}）`}`);
  }
  {
    const s = initialGame();
    s.posA = { x: 4, y: 2 };
    s.posB = { x: 4, y: 6 };
    s.wallsA = 5;
    s.wallsB = 0;
    s.turn = "A";
    const d = computeAiMove(s, 1);
    console.log(`5) 学徒纯竞速免动手: ${d?.payload.type === "pawn" ? "走子 ✓" : "放板了 ✗"}`);
  }
  {
    const s = initialGame();
    s.posA = { x: 4, y: 8 };
    s.posB = { x: 4, y: 7 };
    s.wallsA = 0;
    s.wallsB = 0;
    s.turn = "A";
    const d = computeAiMove(s, 1);
    const to = d?.payload.type === "pawn" ? d.payload.to : null;
    console.log(`6) 学徒贴身直跳: ${to && to.x === 4 && to.y === 6 ? "跳到(4,6) ✓" : `走到(${to?.x},${to?.y}) ✗`}`);
  }
}

/* ============ main ============ */

const mode = process.argv[2] ?? "ab";
if (mode === "ab") {
  const pairs = Number(process.argv[3] ?? 2);
  const budget = Number(process.argv[4] ?? 500);
  const flags = ["QS", "NMP", "WP", "PTT", "RF", "LMR", "ASP", "RW", "EXT"]
    .filter((k) => (process.env as Record<string, string | undefined>)[`QUORIDOR_AI_OFF_${k}`])
    .join("+");
  series(`L4×L3 ${flags ? `[消融:${flags}]` : "[baseline]"}`, 4, 3, pairs, budget);
  dumpTiming();
} else if (mode === "matrix") {
  matrix(Number(process.argv[3] ?? 2));
} else if (mode === "grad") {
  const pairs = Number(process.argv[3] ?? 3);
  const budget = Number(process.argv[4] ?? 800);
  console.log(`=== 等预算 ${budget}ms 梯度（v6） ===`);
  series("社长×总编", 4, 3, pairs, budget);
  series("总编×排字师", 3, 2, pairs, budget);
  series("排字师×学徒", 2, 1, pairs, budget);
  dumpTiming();
} else if (mode === "trace") {
  traceSeries(Number(process.argv[3] ?? 2));
} else if (mode === "4p") {
  const n4 = Number(process.argv[3] ?? 8);
  console.log("=== 四人桌梯度（高低档对位） ===");
  line4("学徒×排字师", { A: 1, B: 2, C: 1, D: 2 }, n4);
  line4("排字师×总编", { A: 2, B: 3, C: 2, D: 3 }, n4);
  line4("总编×社长", { A: 3, B: 4, C: 3, D: 4 }, n4);
  line4("学徒×社长", { A: 1, B: 4, C: 1, D: 4 }, n4);
  /* 镜像座位：排除甲/丙先手轮转偏差的对照组 */
  line4("社长×学徒", { A: 4, B: 1, C: 4, D: 1 }, n4);
  line4("社长×总编", { A: 4, B: 3, C: 4, D: 3 }, n4);
  line4("社长×排字师", { A: 4, B: 2, C: 4, D: 2 }, n4);
} else if (mode === "micro") {
  micro();
}
