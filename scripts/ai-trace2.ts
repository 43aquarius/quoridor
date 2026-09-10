/* L2(甲) vs L3(乙) 逐手观察：L3 何以输给贪心 */
import { initialGame, type GameState } from "../src/lib/game/types";
import { applyPayload, shortestPathLength } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";

let s: GameState = initialGame();
for (let i = 0; i < 90 && !s.winner; i++) {
  const who = s.turn;
  const level = who === "A" ? 2 : 3;
  const t0 = Date.now();
  const d = computeAiMove(s, level as 2 | 3);
  if (!d) break;
  const r = applyPayload(s, who, d.payload);
  if (!r.ok || !r.state) {
    console.log(`第${i + 1}手 非法!`);
    break;
  }
  s = r.state;
  const desc =
    d.payload.type === "wall"
      ? `WALL ${d.payload.wall.x},${d.payload.wall.y}-${d.payload.wall.o}`
      : `PAWN ${d.payload.to.x},${d.payload.to.y}`;
  console.log(
    `第${String(i + 1).padStart(2)}手 ${who === "A" ? "甲L2" : "乙L3"} ${desc.padEnd(16)} dA=${shortestPathLength(s, "A")} dB=${shortestPathLength(s, "B")} 板${s.wallsA}/${s.wallsB}${who === "B" ? ` · L3搜索 ${Date.now() - t0}ms nodes=${lastSearchStats().nodes}` : ""}`,
  );
}
console.log(s.winner ? `结局：${s.winner} 胜 · ${s.history.length} 手` : "未分胜负");
