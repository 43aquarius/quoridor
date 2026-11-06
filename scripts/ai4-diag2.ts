/* 四人局多局诊断：v2 新引擎坐各席位 vs 3× legacy L2，逐局统计 */
import { initialGame, SEAT_ORDER_4, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, bfsDistanceToGoal, buildWallGrids, isEliminated, legalPawnMoves, pawnOf, wallsLeftOf } from "../src/lib/game/engine";
import { computeAiMove4, lastSearchStats4 } from "../src/lib/game/ai4";
const ENGINE = process.env.ENGINE ?? "new";
// REVERSE=1: 特殊席跑 legacy L1，其余三席跑新引擎 L4（板海对照）
import { computeAiMove4Legacy } from "../src/lib/game/ai4-legacy";

const CAP = process.env.CAP ? Number(process.env.CAP) : 1200;
const LEVEL = (process.env.LV ? Number(process.env.LV) : 4) as 2 | 3 | 4;
const GAMES = process.env.GAMES ? Number(process.env.GAMES) : 8;
const JITTER = process.env.JITTER ? Number(process.env.JITTER) : 8;

let newWins = 0;
let fillerWins = 0;
let wallsUsedByNew = 0;
let newMovesCount = 0;
let distSum = 0;
let distN = 0;
const losses: string[] = [];

for (let g = 0; g < GAMES; g++) {
  const newSeat = SEAT_ORDER_4[g % 4];
  let s: GameState = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  let guard = 0;
  const trace: string[] = [];
  while (!s.winner && guard < 320) {
    guard++;
    const p = s.turn as Player;
    if (isEliminated(s, p)) continue;
    const isNew = p === newSeat;
    let d: ReturnType<typeof computeAiMove4> = null;
    if (s.history.length < JITTER) {
      const legal = legalPawnMoves(s, p);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        const from = { ...(pawnOf(s, p)) };
        d = { payload: { type: "pawn", from, to: pick }, label: "开局随机" };
      }
    }
    if (!d) {
      if (isNew) {
        if (ENGINE === "legacy") d = computeAiMove4Legacy(s, LEVEL);
        else d = computeAiMove4(s, LEVEL, { budgetMs: CAP });
        newMovesCount++;
        wallsUsedByNew += d?.payload.type === "wall" ? 1 : 0;
        const grids = buildWallGrids(s.walls, 9);
        distSum += bfsDistanceToGoal(grids, pawnOf(s, p), p, 9);
        distN++;
        trace.push(
          `${s.history.length + 1} ${p} ${d?.payload.type === "wall" ? `W${d.payload.wall.x},${d.payload.wall.y}${d.payload.wall.o}` : `→${d?.payload.type === "pawn" ? d.payload.to.x + "," + d.payload.to.y : "?"}`} (${lastSearchStats4().depth}层 s=${d?.score?.toFixed(1)}) 板余${wallsLeftOf(s, p)}`,
        );
      } else if (process.env.REVERSE) {
        d = computeAiMove4(s, 4, { budgetMs: CAP });
      } else {
        d = computeAiMove4Legacy(s, 2);
      }
    }
    if (!d) break;
    const r = applyPayload(s, p, d.payload);
    if (!r.ok || !r.state) {
      console.error(`局${g} ${p}${isNew ? "(NEW)" : ""} 非法!`, JSON.stringify(d.payload), r.reason);
      break;
    }
    s = r.state;
  }
  if (s.winner === newSeat) newWins++;
  else {
    fillerWins++;
    losses.push(`局${g} 新席位=${newSeat} 胜者=${s.winner} 手数=${s.history.length}`);
    if (losses.length === 1) console.log(`--- 败局 ${g} 轨迹（新=${newSeat}）---\n` + trace.join("\n"));
  }
  console.log(`局${g}：新=${newSeat} 胜者=${s.winner} 手数=${s.history.length} 新引擎板用=${wallsLeftOf(s, newSeat) === undefined ? "?" : 5 - wallsLeftOf(s, newSeat)}`);
}
console.log(`\n汇总：新引擎 ${newWins}/${GAMES} 胜 | 填充 ${fillerWins}`);
console.log(`新引擎平均距离 ${distN ? (distSum / distN).toFixed(2) : "-"} | 放板率 ${(wallsUsedByNew / Math.max(1, newMovesCount) * 100).toFixed(0)}% (${wallsUsedByNew}/${newMovesCount})`);
if (losses.length) console.log(`败局：\n${losses.join("\n")}`);
