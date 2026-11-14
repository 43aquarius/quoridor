/* 振荡定位：记录每手上下文（双方距离/余板），回步事件发生时打印细节 */
import { initialGame, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, bfsDistanceToGoal, buildWallGrids, pawnOf, wallsLeftOf } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";


const args = process.argv.slice(2);
const a = (k: string, d: number) => {
  const f = args.find((x) => x.startsWith(k + "="));
  return f ? Number(f.split("=")[1]) : d;
};
const BUDGET = a("budget", 450);
const GAMES = a("games", 3);
const LEVEL = a("level", 4) as 1 | 2 | 3 | 4;

for (let g = 0; g < GAMES; g++) {
  let s = initialGame();
  const lastOwnFrom = new Map<Player, { x: number; y: number }>();
  let moves = 0;
  while (!s.winner && moves < 240) {
    const player = s.turn;
    const grids = buildWallGrids(s.walls, s.size);
    const dMe = bfsDistanceToGoal(grids, pawnOf(s, player), player, s.size);
    const op: Player = player === "A" ? "B" : "A";
    const dOp = bfsDistanceToGoal(grids, pawnOf(s, op), op, s.size);
    const d = computeAiMove(s, LEVEL, { budgetMs: BUDGET });
    if (!d || (d.payload.type !== "pawn" && d.payload.type !== "wall")) break;
    const r = applyPayload(s, player, d.payload);
    if (!r.ok || !r.state) break;
    moves++;
    const from = d.payload.type === "pawn" ? d.payload.from : null;
    const to = d.payload.type === "pawn" ? d.payload.to : null;
    if (from && to) {
      const prev = lastOwnFrom.get(player);
      if (prev && prev.x === to.x && prev.y === to.y && !(from.x === prev.x && from.y === prev.y)) {
        /* 回步：打印上下文 */
        const scoreStr = d.score != null ? d.score.toFixed(2) : "n/a";
        const state =
          dMe < dOp ? "领先" : dMe === dOp ? "平先" : "落后";
        const wallsCtx = `我板${wallsLeftOf(s, player)}/他板${wallsLeftOf(s, op)}`;
        const endgame = wallsLeftOf(s, player) === 0 && wallsLeftOf(s, op) === 0 ? "【板尽竞速】" : "";
        console.log(
          `G${g} #${moves} ${player} 回步(${from.x},${from.y})→(${to.x},${to.y})  [${state} 我${dMe}步/他${dOp}步 ${wallsCtx}] ${endgame} score=${scoreStr} 胜者=${s.winner ?? "?"}`,
        );
      }
      lastOwnFrom.set(player, { x: from.x, y: from.y });
    } else {
      lastOwnFrom.delete(player);
    }
    s = r.state;
  }
  console.log(`G${g} 结束: ${moves}手 胜者=${s.winner ?? "上限"}`);
}
