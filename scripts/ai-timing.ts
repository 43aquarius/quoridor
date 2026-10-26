/* L4 全预算耗时抽测：单局前 12 手的搜索耗时分布 */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";
let s: GameState = initialGame();
const t0 = Date.now();
const times: number[] = [];
for (let i = 0; i < 12 && !s.winner; i++) {
  const level: AiLevel = s.turn === "A" ? 4 : 1;
  const m0 = Date.now();
  const d = computeAiMove(s, level); /* 无上限 = 全预算 */
  const dt = Date.now() - m0;
  if (level === 4) times.push(dt);
  if (!d) break;
  const r = applyPayload(s, s.turn, d.payload);
  if (!r.ok || !r.state) {
    const legal = legalPawnMoves(s, s.turn);
    s = applyPayload(s, s.turn, { type: "pawn", from: s.posA, to: legal[0] }).state!;
    continue;
  }
  s = r.state;
}
const st = lastSearchStats();
console.log(`L4 六手耗时: [${times.join(", ")}] ms · 深度 ${st.depth} · 节点 ${st.nodes} · 总 ${Date.now() - t0}ms`);
