/* v9 vs v8 四人局围桌对决：两席对两席，双排列轮转，开局 8 手随机抖动。
 * 运行：bun scripts/ai4-duel-v9.ts [预算ms] [每排列局数]
 */
import { initialGame, SEAT_ORDER_4, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, isEliminated, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove4 as moveV9 } from "../src/lib/game/ai4";
import { computeAiMove4 as moveV8 } from "../src/lib/game/ai4-v8";

type Engine = typeof moveV9;

/* pattern 0：甲丙=v9、乙丁=v8；pattern 1：乙丁=v9、甲丙=v8（席位轮转平衡） */
function seatEngine(pattern: number, seatIdx: number): Engine {
  const isV9 = (seatIdx + pattern) % 2 === 0;
  return isV9 ? moveV9 : moveV8;
}

function playGame(pattern: number, level: number, cap: number | undefined): Player | null {
  let s: GameState = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  let guard = 0;
  while (!s.winner && guard < 320) {
    guard++;
    const p = s.turn as Player;
    if (isEliminated(s, p)) continue;
    const eng = seatEngine(pattern, SEAT_ORDER_4.indexOf(p));
    let d: ReturnType<Engine> = null;
    if (s.history.length < 8) {
      const legal = legalPawnMoves(s, p);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        const from = { ...(p === "A" ? s.posA : p === "B" ? s.posB : p === "C" ? s.posC! : s.posD!) };
        d = { payload: { type: "pawn", from, to: pick }, label: "开局随机" };
      }
    }
    if (!d) d = eng(s, level as 1 | 2 | 3 | 4, cap != null ? { budgetMs: cap } : undefined);
    if (!d) break;
    const r = applyPayload(s, p, d.payload);
    if (!r.ok || !r.state) {
      console.error(`  [异常] ${p} 着法被拒：`, JSON.stringify(d.payload), r.reason);
      break;
    }
    s = r.state;
  }
  return s.winner;
}

const args = process.argv.slice(2);
const cap = args[0] ? Number(args[0]) : undefined;
const perPattern = args[1] ? Number(args[1]) : 2;
const levels = (args[2] ? args[2].split(",") : ["2", "3", "4"]).map(Number);

for (const level of levels) {
  let v9Wins = 0;
  let v8Wins = 0;
  let other = 0;
  const t0 = Date.now();
  const games = perPattern * 2;
  for (let pattern = 0; pattern < 2; pattern++) {
    for (let g = 0; g < perPattern; g++) {
      const t1 = Date.now();
      const w = playGame(pattern, level, cap);
      if (!w) {
        other++;
        console.log(`  [4P-L${level} p${pattern}g${g}] 无胜 · ${Math.round((Date.now() - t1) / 1000)}s`);
        continue;
      }
      const idx = SEAT_ORDER_4.indexOf(w);
      const isV9 = (idx + pattern) % 2 === 0;
      if (isV9) v9Wins++;
      else v8Wins++;
      console.log(
        `  [4P-L${level} p${pattern}g${g}] 胜者=${w}（${isV9 ? "v9" : "v8"}）· 累计 v9 ${v9Wins} : ${v8Wins} v8 · ${Math.round((Date.now() - t1) / 1000)}s`,
      );
    }
  }
  console.log(
    `[4P-L${level}] ${cap != null ? `等预算 ${cap}ms` : "产品口径"}: v9 ${v9Wins} 胜 vs v8 ${v8Wins} 胜 ` +
      `(${games} 局 · 无胜 ${other} · ${Math.round((Date.now() - t0) / 1000)}s)`,
  );
}
