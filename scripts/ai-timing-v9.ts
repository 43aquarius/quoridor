/* v9 vs v8 单步规模对比：同局面同预算，比完成深度/节点率（NPS）。 */
import { initialGame, type GameState } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMove as moveV9, lastSearchStats as statsV9 } from "../src/lib/game/ai";
import { computeAiMove as moveV8, lastSearchStats as statsV8 } from "../src/lib/game/ai-v8";

/* 造一个中局局面：走 20 手固定序列（甲上/乙下交替 + 各一块板） */
function midGame(): GameState {
  let s: GameState = initialGame();
  const seq: Array<{ type: "pawn"; dx: number; dy: number } | { type: "wall"; x: number; y: number; o: "h" | "v" }> = [
    { type: "pawn", dx: 0, dy: -1 },
    { type: "wall", x: 4, y: 3, o: "h" },
    { type: "pawn", dx: 0, dy: -1 },
    { type: "pawn", dx: 0, dy: 1 },
    { type: "pawn", dx: 0, dy: -1 },
    { type: "wall", x: 3, y: 5, o: "h" },
    { type: "pawn", dx: 0, dy: -1 },
    { type: "pawn", dx: 0, dy: 1 },
    { type: "pawn", dx: 1, dy: -1 },
    { type: "wall", x: 5, y: 2, o: "v" },
    { type: "pawn", dx: 0, dy: -1 },
    { type: "pawn", dx: -1, dy: 1 },
    { type: "pawn", dx: 0, dy: -1 },
    { type: "pawn", dx: 0, dy: 1 },
    { type: "wall", x: 2, y: 6, o: "v" },
    { type: "pawn", dx: 0, dy: 1 },
    { type: "pawn", dx: 0, dy: -1 },
    { type: "pawn", dx: 0, dy: -1 },
    { type: "pawn", dx: 0, dy: -1 },
    { type: "wall", x: 6, y: 4, o: "h" },
  ];
  for (const m of seq) {
    if (m.type === "pawn") {
      const from = s.turn === "A" ? { ...s.posA } : { ...s.posB };
      const to = { x: from.x + m.dx, y: from.y + m.dy };
      const r = applyPayload(s, s.turn, { type: "pawn", from, to });
      if (!r.state) return s;
      s = r.state;
    } else {
      const r = applyPayload(s, s.turn, { type: "wall", wall: { x: m.x, y: m.y, o: m.o, by: s.turn } });
      if (!r.state) return s;
      s = r.state;
    }
  }
  return s;
}

const budget = Number(process.argv[2] ?? 1500);
const state = midGame();
console.log(`局面：${state.history.length} 手，轮到 ${state.turn}，甲板 ${state.wallsA} 乙板 ${state.wallsB}`);

for (const [name, fn, stats] of [
  ["v9", moveV9, statsV9],
  ["v8", moveV8, statsV8],
] as const) {
  const t0 = Date.now();
  const d = fn(state, 4, { budgetMs: budget });
  const st = stats();
  const nps = Math.round(st.nodes / Math.max(st.elapsedMs, 1)) * 1000;
  console.log(
    `${name}: depth=${st.depth} nodes=${st.nodes} qnodes=${st.qnodes} elapsed=${st.elapsedMs}ms nps≈${(nps / 1000).toFixed(0)}k move=${JSON.stringify(d?.payload).slice(0, 80)}`,
  );
}
