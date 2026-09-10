/* 捕获一局 L3(甲) 失败于 L1(乙) 的完整着法记录 */
import { initialGame, type GameState } from "../src/lib/game/types";
import { applyPayload, shortestPathLength } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";

for (let trial = 0; trial < 30; trial++) {
  let s: GameState = initialGame();
  const log: string[] = [];
  let guard = 0;
  while (!s.winner && guard < 300) {
    guard++;
    const level = s.turn === "A" ? 3 : 1;
    const t0 = Date.now();
    const d = computeAiMove(s, level as 3 | 1);
    if (!d) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) break;
    s = r.state;
    const desc =
      d.payload.type === "wall"
        ? `WALL ${d.payload.wall.x},${d.payload.wall.y}-${d.payload.wall.o}`
        : `PAWN ${d.payload.to.x},${d.payload.to.y}`;
    log.push(
      `第${String(guard).padStart(2)}手 ${s.turn === "A" ? "甲L3" : "乙L1"} ${desc.padEnd(16)} dA=${shortestPathLength(s, "A")} dB=${shortestPathLength(s, "B")} 板${s.wallsA}/${s.wallsB}${s.turn === "A" ? "" : ` · 甲搜索 ${Date.now() - t0}ms nodes=${lastSearchStats().nodes}`}`,
    );
  }
  if (s.winner === "B") {
    console.log(`=== 捕获失败对局（第 ${trial + 1} 次尝试）===`);
    for (const line of log) console.log(line);
    console.log(`结局：乙 L1 胜 · ${s.history.length} 手`);
    break;
  }
}
