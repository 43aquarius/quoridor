/* 四人局：偏执联盟搜索 v2 vs 贪心策略族 v1（ai4-legacy）对决
 * 两战斗席位 + 两填充席位（legacy L2），四人轮转保证每个席位都被双方坐过。
 * 运行：bun scripts/ai4-duel.ts
 * 环境变量：DUEL_N（轮数，默认 4，每轮 4 局）、DUEL_CAP（v2 预算封顶 ms）、DUEL_LEVEL（2/3/4，0=全部）
 */
import { initialGame, SEAT_ORDER_4, type AiLevel, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, isEliminated, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove4 } from "../src/lib/game/ai4";
import { computeAiMove4Legacy } from "../src/lib/game/ai4-legacy";

type Engine = "new" | "old" | "filler";

/* seats: 按行棋顺位 [A,C,B,D] 的引擎指派 */
function play(level: AiLevel, seats: Engine[], capMs?: number, jitterPlies = 8): { winner: Player | null; moves: number } {
  let s: GameState = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  let guard = 0;
  while (!s.winner && guard < 320) {
    guard++;
    const p = s.turn as Player;
    if (isEliminated(s, p)) continue;
    const kind = seats[SEAT_ORDER_4.indexOf(p)];
    let d: ReturnType<typeof computeAiMove4> = null;
    /* 开局随机化：前 jitterPlies 手随机合法棋子步（各席同待遇） */
    if (s.history.length < jitterPlies) {
      const legal = legalPawnMoves(s, p);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        const from = { ...(p === "A" ? s.posA : p === "B" ? s.posB : p === "C" ? s.posC! : s.posD!) };
        d = { payload: { type: "pawn", from, to: pick }, label: "开局随机" };
      }
    }
    if (!d) {
      const lv: AiLevel = kind === "filler" ? 2 : level;
      if (kind === "new") {
        d = computeAiMove4(s, lv, capMs ? { budgetMs: capMs } : undefined);
      } else {
        d = computeAiMove4Legacy(s, lv);
      }
    }
    if (!d) break;
    const r = applyPayload(s, p, d.payload);
    if (!r.ok || !r.state) {
      console.error(`  [异常] ${p}(${kind}) 着法被拒：`, JSON.stringify(d.payload), r.reason);
      break;
    }
    s = r.state;
  }
  return { winner: s.winner, moves: s.history.length };
}

function duel(level: AiLevel, rounds: number, capMs?: number) {
  let newWins = 0;
  let oldWins = 0;
  let fillerWins = 0;
  let draws = 0;
  const t0 = Date.now();
  let totalMoves = 0;
  for (let i = 0; i < rounds; i++) {
    /* 战斗席轮转：v2 与 v1 相隔两位（行棋顺位意义上的对面），填充满余两席 */
    for (let newIdx = 0; newIdx < 4; newIdx++) {
      const oldIdx = (newIdx + 2) % 4;
      const seats: Engine[] = ["filler", "filler", "filler", "filler"];
      seats[newIdx] = "new";
      seats[oldIdx] = "old";
      const r = play(level, seats, capMs);
      totalMoves += r.moves;
      if (!r.winner) draws++;
      else {
        const w = seats[SEAT_ORDER_4.indexOf(r.winner)];
        if (w === "new") newWins++;
        else if (w === "old") oldWins++;
        else fillerWins++;
      }
    }
  }
  const total = newWins + oldWins + fillerWins + draws;
  console.log(
    `L${level}：v2偏执 ${newWins}/${total} (${Math.round((newWins / total) * 100)}%) | v1贪心 ${oldWins} | 填充 ${fillerWins} | 平 ${draws}  均局 ${Math.round(totalMoves / total)} 手  用时 ${((Date.now() - t0) / 60000).toFixed(1)}min`,
  );
}

const cap = process.env.DUEL_CAP ? Number(process.env.DUEL_CAP) : undefined;
const n = process.env.DUEL_N ? Number(process.env.DUEL_N) : 3;
console.log(`=== 四人局 v2(偏执搜索) vs v1(贪心族) 对决（${n} 轮 × 4 席位 = ${n * 4} 局，v2 预算 ${cap ?? "全档默认"}，填充=legacy L2） ===`);
const which = process.env.DUEL_LEVEL ? Number(process.env.DUEL_LEVEL) : 0;
if (which === 0 || which === 2) duel(2, n, cap);
if (which === 0 || which === 3) duel(3, n, cap);
if (which === 0 || which === 4) duel(4, n, cap);
