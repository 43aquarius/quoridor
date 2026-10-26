/* 捕获 L1(甲) 击败 L4(乙) 的对局 */
import { initialGame, type GameState } from "../src/lib/game/types";
import { applyPayload, shortestPathLength } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";

for (let trial = 0; trial < 20; trial++) {
  let s: GameState = initialGame();
  const log: string[] = [];
  let guard = 0;
  while (!s.winner && guard < 300) {
    guard++;
    const who = s.turn;
    const level = who === "A" ? 1 : 4;
    const t0 = Date.now();
    const d = computeAiMove(s, level as 1 | 4);
    if (!d) break;
    const r = applyPayload(s, who, d.payload);
    if (!r.ok || !r.state) break;
    s = r.state;
    const desc =
      d.payload.type === "wall"
        ? `WALL ${d.payload.wall.x},${d.payload.wall.y}-${d.payload.wall.o}`
        : `PAWN ${d.payload.to.x},${d.payload.to.y}`;
    log.push(
      `第${String(guard).padStart(2)}手 ${who === "A" ? "甲L1" : "乙L4"} ${desc.padEnd(16)} dA=${shortestPathLength(s, "A")} dB=${shortestPathLength(s, "B")} 板${s.wallsA}/${s.wallsB}${who === "B" ? ` · ${Date.now() - t0}ms nodes=${lastSearchStats().nodes}` : ""}`,
    );
  }
  if (s.winner === "A") {
    console.log(`=== 捕获 L4 失败对局（第 ${trial + 1} 次尝试）· ${s.history.length} 手 ===`);
    for (const line of log) console.log(line);
    break;
  }
}
