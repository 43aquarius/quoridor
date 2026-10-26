/* v3 并行根分裂 vs v2 对决（模拟：顺序执行 K 个切片，计算量与真实
 * 浏览器并行一致——每个切片跑满单 worker 预算，聚合取最高分）。
 * 运行：bun run scripts/ai-duel-v3par.ts
 * 环境变量：PAR_K（并行度，默认 4）、DUEL_N、DUEL_CAP（单切片预算）、DUEL_LEVEL
 */
import { initialGame, type AiLevel, type GameState, type MovePayload } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove, type AiDecision } from "../src/lib/game/ai";
import { computeAiMoveV2 } from "../src/lib/game/ai-v2";

const PAR_K = process.env.PAR_K ? Number(process.env.PAR_K) : 4;

function computeParallel(s: GameState, level: AiLevel, capMs?: number): AiDecision | null {
  /* 模拟浏览器根分裂并行：每切片跑满预算并逐层汇报，
   * 聚合按「全席公共深度 D*」同层比分（与 ai-client 完全一致）。 */
  const iters: Array<Map<number, { payload: MovePayload; score: number }>> = [];
  const finals: Array<AiDecision | null> = [];
  for (let rem = 0; rem < PAR_K; rem++) {
    const table = new Map<number, { payload: MovePayload; score: number }>();
    const d = computeAiMove(s, level, {
      ...(capMs ? { budgetMs: capMs } : {}),
      rootPick: { mod: PAR_K, rem },
      report: (depth, payload, score) => table.set(depth, { payload, score }),
    });
    iters.push(table);
    finals.push(d);
  }
  /* 即胜着优先 */
  for (const d of finals) {
    if (d && (d.score ?? 0) > 90000) return d;
  }
  const liveSlots: number[] = [];
  iters.forEach((t, i) => {
    if (t.size > 0) liveSlots.push(i);
  });
  if (liveSlots.length === 0) {
    for (const d of finals) if (d) return d;
    return computeAiMove(s, level, capMs ? { budgetMs: capMs } : undefined);
  }
  let dStar = 0;
  for (let d = 1; d <= 32; d++) {
    if (liveSlots.every((s) => iters[s]!.has(d))) dStar = d;
  }
  if (dStar === 0) {
    for (const d of finals) if (d) return d;
    return computeAiMove(s, level, capMs ? { budgetMs: capMs } : undefined);
  }
  let best: { payload: MovePayload; score: number } | null = null;
  for (const s of liveSlots) {
    const r = iters[s]!.get(dStar)!;
    if (!best || r.score > best.score) best = r;
  }
  let label = "编辑部审定了着法";
  for (const d of finals) {
    if (d && best && d.payload === best.payload) label = d.label;
  }
  return best ? { payload: best.payload, label, score: best.score } : null;
}

function play(levelA: AiLevel, levelB: AiLevel, aIsNew: boolean, capMs?: number, jitterPlies = 6): string {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 240) {
    guard++;
    const isNewTurn = (s.turn === "A") === aIsNew;
    const level = s.turn === "A" ? levelA : levelB;
    let d: AiDecision | null;
    if (s.history.length < jitterPlies) {
      const legal = legalPawnMoves(s, s.turn);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        d = { payload: { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: pick }, label: "开局随机" };
      } else {
        d = isNewTurn ? computeParallel(s, level, capMs) : computeAiMoveV2(s, level, capMs ? { budgetMs: capMs } : undefined);
      }
    } else {
      d = isNewTurn ? computeParallel(s, level, capMs) : computeAiMoveV2(s, level, capMs ? { budgetMs: capMs } : undefined);
    }
    if (!d) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) {
      console.error("  [异常] 着法被拒：", JSON.stringify(d.payload));
      break;
    }
    s = r.state;
  }
  return s.winner ?? "draw";
}

function duel(level: AiLevel, n: number, capMs?: number) {
  let newWins = 0;
  let oldWins = 0;
  let draws = 0;
  let newA = 0;
  let oldA = 0;
  let newB = 0;
  let oldB = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const w1 = play(level, level, true, capMs);
    if (w1 === "A") { newWins++; newA++; }
    else if (w1 === "B") { oldWins++; oldB++; }
    else draws++;
    const w2 = play(level, level, false, capMs);
    if (w2 === "B") { newWins++; newB++; }
    else if (w2 === "A") { oldWins++; oldA++; }
    else draws++;
  }
  const total = newWins + oldWins + draws;
  console.log(
    `L${level}：v3并行(K=${PAR_K}) ${newWins}/${total} (${Math.round((newWins / total) * 100)}%) | v2 ${oldWins} | 平 ${draws}  [并行执甲 ${newA}胜/v2 ${oldA} · 并行执乙 ${newB}胜/v2 ${oldB}]  用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
}

const cap = process.env.DUEL_CAP ? Number(process.env.DUEL_CAP) : 500;
const n = process.env.DUEL_N ? Number(process.env.DUEL_N) : 4;
console.log(`=== v3 并行根分裂(K=${PAR_K}, 切片预算 ${cap}ms) vs v2（预算 ${cap}ms） ===`);
const which = process.env.DUEL_LEVEL ? Number(process.env.DUEL_LEVEL) : 4;
if (which === 0 || which === 3) duel(3, n, cap);
if (which === 0 || which === 4) duel(4, n, cap);
