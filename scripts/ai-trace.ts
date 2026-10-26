/* 逐手观察：L3 执甲 vs L1 执乙 —— 找出甲方的失误模式 */
import { initialGame, type GameState } from "../src/lib/game/types";
import { applyPayload, shortestPathLength } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";

let s: GameState = initialGame();
for (let i = 0; i < 80 && !s.winner; i++) {
  const level = s.turn === "A" ? 3 : 1;
  const t0 = Date.now();
  const d = computeAiMove(s, level as 3 | 1);
  if (!d) break;
  const r = applyPayload(s, s.turn, d.payload);
  if (!r.ok || !r.state) {
    console.log(`第${i + 1}手 非法!`, JSON.stringify(d.payload));
    break;
  }
  s = r.state;
  const desc =
    d.payload.type === "wall"
      ? `WALL ${d.payload.wall.x},${d.payload.wall.y}-${d.payload.wall.o}`
      : `PAWN ${d.payload.to.x},${d.payload.to.y}`;
  const who = s.history[s.history.length - 1].player;
  console.log(
    `第${String(i + 1).padStart(2)}手 ${who === "A" ? "甲L3" : "乙L1"} ${desc.padEnd(16)} · A@(${s.posA.x},${s.posA.y}) dA=${shortestPathLength(s, "A")} · B@(${s.posB.x},${s.posB.y}) dB=${shortestPathLength(s, "B")} · 板 ${s.wallsA}/${s.wallsB} · ${Date.now() - t0}ms nodes=${lastSearchStats().nodes}`,
  );
}
console.log(s.winner ? `结局：${s.winner} 胜（${s.winReason}）· ${s.history.length} 手` : "未分胜负（guard 截断）");
