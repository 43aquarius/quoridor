/* 诊断：v2/v3 在同预算下的完成深度、节点数对比（定位 L3 回退根因）
 * 运行：bun run scripts/ai-diag-v3.ts
 */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";
import { computeAiMoveV2, lastSearchStatsV2 } from "../src/lib/game/ai-v2";

/* 用 v2 L3 自对弈生成中局快照（双方同引擎，局面不偏向任一新版） */
function genSnapshots(plies: number, count: number): GameState[] {
  const snaps: GameState[] = [];
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let g = 0; g < count; g++) {
    let s: GameState = initialGame();
    for (let i = 0; i < plies && !s.winner; i++) {
      if (s.history.length < 6) {
        const legal = legalPawnMoves(s, s.turn);
        const pick = legal[Math.floor(rnd() * legal.length)];
        const r = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: pick });
        if (r.ok && r.state) s = r.state;
        continue;
      }
      const d = computeAiMoveV2(s, 3, { budgetMs: 500 });
      if (!d) break;
      const r = applyPayload(s, s.turn, d.payload);
      if (!r.ok || !r.state) break;
      s = r.state;
    }
    if (!s.winner) snaps.push(s);
  }
  return snaps;
}

function measure(label: string, fn: typeof computeAiMove, stats: () => unknown, level: AiLevel, snaps: GameState[], budget: number) {
  let sumDepth = 0;
  let sumNodes = 0;
  let sumMs = 0;
  const depths: number[] = [];
  for (const s of snaps) {
    fn(s, level, { budgetMs: budget });
    const st = stats() as { nodes: number; depth: number; elapsedMs: number };
    sumDepth += st.depth;
    sumNodes += st.nodes;
    sumMs += st.elapsedMs;
    depths.push(st.depth);
  }
  console.log(
    `${label} L${level} @${budget}ms：平均完成深度 ${sumDepth / snaps.length}，平均节点 ${(sumNodes / snaps.length).toFixed(0)}，平均用时 ${(sumMs / snaps.length).toFixed(0)}ms，深度序列 [${depths.join(",")}]`,
  );
}

const snaps = genSnapshots(30, 10);
console.log(`快照数：${snaps.length}（30 手中局）`);
measure("v3", computeAiMove, lastSearchStats, 3, snaps, 1600);
measure("v2", computeAiMoveV2, lastSearchStatsV2, 3, snaps, 1600);
measure("v3", computeAiMove, lastSearchStats, 4, snaps, 2900);
measure("v2", computeAiMoveV2, lastSearchStatsV2, 4, snaps, 2900);
