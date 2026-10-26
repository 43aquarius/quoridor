/* AI 搜索调试：定位强档着法质量问题 */
import { initialGame, type GameState, type AiLevel } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves, shortestPathLength } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";

/* 局面 1：初始 9×9 */
console.log("=== 局面 1：初始 9×9（乙走）===");
{
  const s = initialGame();
  for (const level of [2, 3, 4] as AiLevel[]) {
    const t0 = Date.now();
    const d = computeAiMove(s, level);
    console.log(
      `L${level}: ${d?.payload.type === "wall" ? "WALL" : "PAWN"} ${d?.payload.type === "wall" ? JSON.stringify(d.payload.wall) : JSON.stringify(d.payload.to)} · ${Date.now() - t0}ms · stats=${JSON.stringify(lastSearchStats())}`,
    );
  }
}

/* 局面 2：甲（红）距顶行 2 步，乙应封路或抢终点 —— 明显的战术测试 */
console.log("\n=== 局面 2：甲两步致胜，乙（AI）怎么应对 ===");
{
  const s: GameState = {
    ...initialGame(),
    posA: { x: 4, y: 2 }, // 甲 e7，两步到顶
    posB: { x: 4, y: 6 }, // 乙 e3
    turn: "B",
  };
  console.log("甲最短:", shortestPathLength(s, "A"), "乙最短:", shortestPathLength(s, "B"));
  for (const level of [1, 2, 3, 4] as AiLevel[]) {
    const d = computeAiMove(s, level);
    const desc = d?.payload.type === "wall" ? `WALL ${d.payload.wall.x},${d.payload.wall.y}-${d.payload.wall.o}` : `PAWN → ${JSON.stringify(d.payload.to)}`;
    const after = d ? applyPayload(s, "B", d.payload).state : null;
    console.log(
      `L${level}: ${desc} · 之后甲最短=${after ? shortestPathLength(after, "A") : "?"} 乙最短=${after ? shortestPathLength(after, "B") : "?"} · stats=${JSON.stringify(lastSearchStats())}`,
    );
  }
}

/* 局面 3：跑 30 手 L3 自对弈，观察是否原地打转 */
console.log("\n=== 局面 3：L3 自对弈 30 手观察 ===");
{
  let s: GameState = initialGame();
  for (let i = 0; i < 30 && !s.winner; i++) {
    const d = computeAiMove(s, 3);
    if (!d) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) {
      console.log(`  第${i + 1}手 非法!`, d.payload.type);
      break;
    }
    s = r.state;
    const desc = d.payload.type === "wall" ? `W${d.payload.wall.x},${d.payload.wall.y}-${d.payload.wall.o}` : `P${d.payload.to.x},${d.payload.to.y}`;
    if (i % 5 === 0 || i > 24) {
      console.log(
        `  第${String(i + 1).padStart(2)}手 ${s.turn === "A" ? "(乙刚走)" : "(甲刚走)"} ${desc} · A@${s.posA.x},${s.posA.y} B@${s.posB.x},${s.posB.y} · dA=${shortestPathLength(s, "A")} dB=${shortestPathLength(s, "B")} · 板剩 ${s.wallsA}/${s.wallsB}`,
      );
    }
  }
}
