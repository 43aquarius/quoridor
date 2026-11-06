/* 四人局诊断：一局 v2 L4 vs 3× legacy L2，逐手打印着法与局势 */
import { initialGame, SEAT_ORDER_4, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, activePlayers, bfsDistanceToGoal, buildWallGrids, isEliminated, pawnOf, wallsLeftOf } from "../src/lib/game/engine";
import { computeAiMove4 } from "../src/lib/game/ai4";
import { computeAiMove4Legacy } from "../src/lib/game/ai4-legacy";

const newSeat = (process.argv[2] as Player) ?? "A";
let s: GameState = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
let guard = 0;
const t0 = Date.now();
while (!s.winner && guard < 320) {
  guard++;
  const p = s.turn as Player;
  if (isEliminated(s, p)) continue;
  const grids = buildWallGrids(s.walls, 9);
  const dists = activePlayers(s)
    .map((q) => `${q}${bfsDistanceToGoal(grids, pawnOf(s, q), q, 9)}`)
    .join(" ");
  const wallsLeft = activePlayers(s).map((q) => `${q}:${wallsLeftOf(s, q)}`).join(" ");
  const isNew = p === newSeat;
  const ts = Date.now();
  const d = isNew ? computeAiMove4(s, 4, { budgetMs: 1200 }) : computeAiMove4Legacy(s, 2);
  const dt = Date.now() - ts;
  if (!d) break;
  const r = applyPayload(s, p, d.payload);
  if (!r.ok || !r.state) {
    console.error(`${guard} ${p}(${isNew ? "NEW" : "leg"}) 非法!`, JSON.stringify(d.payload), r.reason);
    break;
  }
  const mv =
    d.payload.type === "wall"
      ? `WALL ${d.payload.wall.x},${d.payload.wall.y}${d.payload.wall.o}`
      : `pawn ${d.payload.from.x},${d.payload.from.y}->${d.payload.to.x},${d.payload.to.y}`;
  console.log(
    `${String(guard).padStart(3)} ${p}(${isNew ? "NEW" : "leg"}) ${mv.padEnd(24)} score=${d.score?.toFixed(1) ?? "-"} ${dt}ms | 距离 ${dists} | 板 ${wallsLeft}`,
  );
  s = r.state;
}
console.log(`胜者：${s.winner} 总手数 ${s.history.length} 用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
