/* 自博弈开局库生成器（二人局 9×9×10）—— v8 第六轮强化
 * 思路对标 claustrophobia.dev 的 "opening theory via engine self-play"：
 * 用 L4 引擎自博弈，统计前 OPEN_PLIES 手每局面的着法分布与最终胜率，
 * 编译为嵌入式开局库。生成端多样性三保证：
 *   1. 每手预算抖动 550~950ms（迭代深度差异 → 着法分歧）
 *   2. 每手 25% 概率根切片随机（rootPick {mod:3, rem:rand}，搜部分候选）
 *   3. 双向座位（甲先/乙先同一引擎，但行棋方对称性差异自然产生局面谱）
 * 输出：scripts/opening-book-raw.json（局面→着法→{n, avgSig}，由 embed 脚本编译为 TS）
 * 分批模式（沙盒 10 分钟限制）：argv[5]=起始局号，样本增量合并进已有输出
 * 运行：bun scripts/gen-opening-book.ts [局数] [输出文件] [种子] [起始局号]
 */
process.env.QUORIDOR_AI_NO_BOOK = "1"; /* 绕过开局库（防自引用闭环） */
import { initialGame, type GameState, type MovePayload, type Player } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

const GAMES = Number(process.argv[2] ?? 200);
const OUT = process.argv[3] ?? "scripts/opening-book-raw.json";
const SEED = Number(process.argv[4] ?? 1);
const START = Number(process.argv[5] ?? 0);

const OPEN_PLIES = 10; // 只记录前 10 手（每方 5 手）
const LEVEL: 1 | 2 | 3 | 4 = 4;

/* xorshift 随机（可复现；分批时以 种子+起始局号 派生，避免跨批重复序列） */
let rs = (SEED * 2654435761 + START * 97) >>> 0;
function rnd(): number {
  rs ^= rs << 13; rs >>>= 0;
  rs ^= rs >>> 17;
  rs ^= rs << 5; rs >>>= 0;
  return rs / 0x100000000;
}

/* —— 局面键：h/v 墙格锚点索引列表（与 opening-book.ts 的 bookKey 一致，无 BigInt）—— */
export function bookKeyRaw(s: GameState): string {
  const N = 9;
  const h: number[] = [];
  const v: number[] = [];
  for (const w of s.walls) {
    const idx = w.y * (N - 1) + w.x;
    if (w.o === "h") h.push(idx);
    else v.push(idx);
  }
  return (
    (h.length ? h.join(",") : "0") + "." + (v.length ? v.join(",") : "0") +
    "." + s.posA.x + s.posA.y + "." + s.posB.x + s.posB.y +
    "." + (s.turn === "A" ? "0" : "1")
  );
}

function encodeMove(m: MovePayload): string {
  if (m.type === "pawn") return `P${m.from.x},${m.from.y},${m.to.x},${m.to.y}`;
  if (m.type === "wall") return `W${m.wall.x},${m.wall.y},${m.wall.o}`;
  return "R"; /* 认输/超时不入库 */
}

interface Sample { key: string; mv: string; side: Player; sig: number }
const samples: Sample[] = [];

let gameNo = START;
const t0 = Date.now();
while (gameNo < START + GAMES) {
  gameNo++;
  let s: GameState = initialGame();
  const traj: Array<{ key: string; mv: string; side: Player }> = [];
  let guard = 0;
  let plies = 0;
  let evalSig: number | null = null;
  let evalTurn: Player = "A";
  while (guard < 40) {
    guard++;
    if (plies >= OPEN_PLIES) {
      /* 开局库区结束：一次 L4 深度评估收信号（当前行棋方视角分数）——
       * 比低质量续局的真实胜负更可靠且快 3 倍 */
      const d = computeAiMove(s, LEVEL, { budgetMs: 1200 });
      if (d && typeof d.score === "number") { evalSig = d.score; evalTurn = s.turn; }
      break;
    }
    const side = s.turn;
    const jitter = 550 + Math.floor(rnd() * 400); /* 550~950ms */
    const slice = rnd() < 0.25 ? { mod: 3, rem: Math.floor(rnd() * 3) } : undefined;
    const d = computeAiMove(s, LEVEL, { budgetMs: jitter, rootPick: slice });
    if (!d) break;
    const r = applyPayload(s, side, d.payload);
    if (!r.ok || !r.state) { console.error(`局${gameNo} 着法被拒`, JSON.stringify(d.payload)); break; }
    traj.push({ key: bookKeyRaw(s), mv: encodeMove(d.payload), side });
    s = r.state;
    plies++;
  }
  if (evalSig != null && traj.length > 0) {
    for (const t of traj) {
      const sig = t.side === evalTurn ? evalSig : -evalSig;
      samples.push({ key: t.key, mv: t.mv, side: t.side, sig });
    }
  }
  if ((gameNo - START) % 20 === 0) {
    const el = Math.round((Date.now() - t0) / 1000);
    console.log(`[gen] ${gameNo - START}/${GAMES} 局 · 样本 ${samples.length} · ${el}s`);
  }
}

/* —— 聚合：局面 → 着法 → {n, sigSum}（增量：先读入已有输出）—— */
const agg = new Map<string, Map<string, { n: number; sigSum: number }>>();
let priorGames = 0;
try {
  const prior = JSON.parse(await Bun.file(OUT).text()) as {
    meta: { games: number };
    positions: Array<{ key: string; moves: Array<{ mv: string; n: number; avgSig: number }> }>;
  };
  priorGames = prior.meta?.games ?? 0;
  for (const p of prior.positions) {
    let m = agg.get(p.key);
    if (!m) { m = new Map(); agg.set(p.key, m); }
    for (const mv of p.moves) {
      const e = m.get(mv.mv) ?? { n: 0, sigSum: 0 };
      e.n += mv.n;
      e.sigSum += mv.n * mv.avgSig;
      m.set(mv.mv, e);
    }
  }
} catch {
  /* 首批：无已有输出 */
}
for (const smp of samples) {
  let m = agg.get(smp.key);
  if (!m) { m = new Map(); agg.set(smp.key, m); }
  const e = m.get(smp.mv) ?? { n: 0, sigSum: 0 };
  e.n++; e.sigSum += smp.sig;
  m.set(smp.mv, e);
}

const out = {
  meta: { games: priorGames + GAMES, seed: SEED, openPlies: OPEN_PLIES, generatedAt: new Date().toISOString() },
  positions: Array.from(agg.entries()).map(([key, moves]) => ({
    key,
    samples: Array.from(moves.values()).reduce((a, e) => a + e.n, 0),
    moves: Array.from(moves.entries()).map(([mv, e]) => ({ mv, n: e.n, avgSig: +(e.sigSum / e.n).toFixed(2) })),
  })).sort((a, b) => b.samples - a.samples),
};
await Bun.write(OUT, JSON.stringify(out));
console.log(`[done] 本批 ${GAMES} 局（累计 ${priorGames + GAMES}）· 唯一局面 ${agg.size} · 本批样本 ${samples.length} → ${OUT} · 本批耗时 ${Math.round((Date.now() - t0) / 1000)}s`);
