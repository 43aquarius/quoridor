/* AI 强度验证：不同档位对弈（快速对局 + 搜索规模统计）
 * 验证目标：社长 > 总编 > 排字师 > 学徒（胜率单调）。
 * 运行：bun run scripts/ai-duel.ts
 */

import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves, checkWall } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";

interface DuelResult {
  winsA: number;
  winsB: number;
  avgMoves: number;
  maxNodes: number;
  maxDepthMs: number;
}

/* 对局一局：levelA 执甲（红，先行），levelB 执乙 */
function playGame(levelA: AiLevel, levelB: AiLevel, budgetCap?: number): { winner: "A" | "B" | null; moves: number } {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 400) {
    guard++;
    const level = s.turn === "A" ? levelA : levelB;
    const d = computeAiMove(s, level, budgetCap ? { budgetMs: budgetCap } : undefined);
    if (!d) break;
    if (s.turn === "A" && d.payload.type === "pawn") {
      const legal = legalPawnMoves(s, "A");
      if (!legal.some((v) => v.x === d.payload.to.x && v.y === d.payload.to.y)) {
        console.error("  [异常] 甲着法非法，兜底最短路");
        const alt = legal[0];
        s = applyPayload(s, "A", { type: "pawn", from: s.posA, to: alt }).state!;
        continue;
      }
    }
    if (s.turn === "B" && d.payload.type === "wall") {
      const chk = checkWall(s, d.payload.wall.x, d.payload.wall.y, d.payload.wall.o, "B");
      if (!chk.ok) {
        console.error("  [异常] 乙放板非法，跳过改走子");
        const legal = legalPawnMoves(s, "B");
        if (legal.length > 0) {
          s = applyPayload(s, "B", { type: "pawn", from: s.posB, to: legal[0] }).state!;
          continue;
        }
      }
    }
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) {
      console.error("  [异常] 着法被拒：", d.payload.type);
      const legal = legalPawnMoves(s, s.turn);
      if (legal.length > 0) {
        s = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: legal[0] }).state!;
        continue;
      }
      break;
    }
    s = r.state;
  }
  return { winner: s.winner, moves: s.history.length };
}

function duel(name: string, levelA: AiLevel, levelB: AiLevel, games: number, budgetCap?: number): DuelResult {
  const res: DuelResult = { winsA: 0, winsB: 0, avgMoves: 0, maxNodes: 0, maxDepthMs: 0 };
  let totalMoves = 0;
  for (let i = 0; i < games; i++) {
    const g = playGame(levelA, levelB, budgetCap);
    if (g.winner === "A") res.winsA++;
    else if (g.winner === "B") res.winsB++;
    totalMoves += g.moves;
    const stats = lastSearchStats();
    res.maxNodes = Math.max(res.maxNodes, stats.nodes);
    res.maxDepthMs = Math.max(res.maxDepthMs, stats.elapsedMs);
  }
  res.avgMoves = Math.round(totalMoves / games);
  const pct = (w: number) => `${Math.round((w / games) * 100)}%`;
  console.log(
    `${name}: 甲(L${levelA}) ${res.winsA} 胜 ${pct(res.winsA)} vs 乙(L${levelB}) ${res.winsB} 胜 ${pct(res.winsB)} · 均局 ${res.avgMoves} 手 · 峰值节点 ${res.maxNodes} · 峰值搜索 ${res.maxDepthMs}ms`,
  );
  return res;
}

console.log("=== AI 强度验证（9×9 · 10 板 · 经典开本）===\n");

/* 交叉对弈：每一档都先后手各半，避免先手偏差 */
const N = Number(process.argv[2] ?? 6);
duel("学徒 vs 社长（甲=学徒）", 1, 4, N);
duel("社长 vs 学徒（甲=社长）", 4, 1, N);
duel("学徒 vs 总编（甲=学徒）", 1, 3, N);
duel("总编 vs 学徒（甲=总编）", 3, 1, N);
duel("排字师 vs 总编（甲=排字师）", 2, 3, N);
duel("总编 vs 排字师（甲=总编）", 3, 2, N);
duel("总编 vs 社长（甲=总编）", 3, 4, N);
duel("社长 vs 总编（甲=社长）", 4, 3, N);
duel("排字师 vs 学徒（甲=排字师）", 2, 1, N);
duel("学徒 vs 排字师（甲=学徒）", 1, 2, N);
