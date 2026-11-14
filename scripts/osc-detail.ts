/* 详细轨迹：打印每手（选手、着法、距离、余板、分），标记回步事件与其前后各3手 */
import { initialGame, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, bfsDistanceToGoal, buildWallGrids, pawnOf, wallsLeftOf } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

const args = process.argv.slice(2);
const a = (k: string, d: number) => {
  const f = args.find((x) => x.startsWith(k + "="));
  return f ? Number(f.split("=")[1]) : d;
};
const BUDGET = a("budget", 450);
const GAMES = a("games", 2);
const LEVEL = a("level", 3) as 1 | 2 | 3 | 4;

for (let g = 0; g < GAMES; g++) {
  let s = initialGame();
  const lastOwnFrom = new Map<Player, { x: number; y: number }>();
  const lines: string[] = [];
  let moves = 0;
  let eventMoves = new Set<number>();
  const recs: string[] = [];
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
    const desc =
      d.payload.type === "pawn"
        ? `(${d.payload.from.x},${d.payload.from.y})→(${d.payload.to.x},${d.payload.to.y})`
        : `WALL ${d.payload.wall.x},${d.payload.wall.y}${d.payload.wall.o}`;
    const sc = d.score != null ? d.score.toFixed(2) : "n/a";
    let mark = "";
    if (d.payload.type === "pawn") {
      const prev = lastOwnFrom.get(player);
      if (prev && prev.x === d.payload.to.x && prev.y === d.payload.to.y && !(d.payload.from.x === prev.x && d.payload.from.y === prev.y)) {
        mark = "  <<< 回步";
        eventMoves.add(moves);
      }
      lastOwnFrom.set(player, { x: d.payload.from.x, y: d.payload.from.y });
    } else {
      lastOwnFrom.delete(player);
    }
    recs.push(
      `#${String(moves).padStart(3)} ${player} ${desc.padEnd(14)} 我${dMe}/他${dOp} 板${wallsLeftOf(s, player)}/${wallsLeftOf(s, op)} sc=${sc}${mark}`,
    );
    s = r.state;
  }
  /* 打印事件前后各3手 */
  const printIdx = new Set<number>();
  for (const e of eventMoves) {
    for (let k = e - 3; k <= e + 3; k++) if (k >= 1 && k <= recs.length) printIdx.add(k);
  }
  console.log(`\n===== G${g}（${moves}手 胜者=${s.winner ?? "上限"}） 事件=${eventMoves.size} =====`);
  let lastPrinted = 0;
  for (let k = 1; k <= recs.length; k++) {
    if (printIdx.has(k)) {
      if (lastPrinted && k - lastPrinted > 1) console.log("   …");
      console.log(recs[k - 1]);
      lastPrinted = k;
    }
  }
}
