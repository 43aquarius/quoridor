/* L1 vs L2 直接对抗（v9 代码，四人桌 [L2,L1,L2,L1] 轮转）：
 * 定位阶梯中 L1>L2 是 L2 变弱还是 L3/L4 变强挤压所致。 */
import { initialGame, SEAT_ORDER_4, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, isEliminated, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove4 } from "../src/lib/game/ai4";
import { computeAiMove4 as computeAiMove4V8 } from "../src/lib/game/ai4-v8";

const USE_V8 = process.env.L12_ENGINE === "v8";
const engine = USE_V8 ? computeAiMove4V8 : computeAiMove4;

function play(levels: number[], capMs: number): Player | null {
  let s: GameState = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  let guard = 0;
  while (!s.winner && guard < 320) {
    guard++;
    const p = s.turn as Player;
    if (isEliminated(s, p)) continue;
    const lv = levels[SEAT_ORDER_4.indexOf(p)] as 1 | 2 | 3;
    let d: ReturnType<typeof computeAiMove4> = null;
    if (s.history.length < 8) {
      const legal = legalPawnMoves(s, p);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        const from = { ...(p === "A" ? s.posA : p === "B" ? s.posB : p === "C" ? s.posC! : s.posD!) };
        d = { payload: { type: "pawn", from, to: pick }, label: "开局随机" };
      }
    }
    if (!d) d = engine(s, lv, { budgetMs: capMs });
    if (!d) break;
    const r = applyPayload(s, p, d.payload);
    if (!r.ok || !r.state) break;
    s = r.state;
  }
  return s.winner;
}

const cap = Number(process.env.LADDER_CAP ?? 1200);
const rounds = Number(process.env.L12_ROUNDS ?? 3);
const HI0 = Number(process.env.L12_HI ?? 2);
const wins: Record<number, number> = { 1: 0, [HI0]: 0 };
let draws = 0;
const t0 = Date.now();
for (let r = 0; r < rounds; r++) {
  for (let rot = 0; rot < 4; rot++) {
    /* [2,1,2,1] 轮转：L2 与 L1 各占两席，轮转平衡席位效应 */
    const HI = Number(process.env.L12_HI ?? 2);
    const levels = [0, 1, 2, 3].map((i) => (((i + rot) % 4 < 2 ? 1 : HI) + 0));
    const w = play(levels, cap);
    if (!w) draws++;
    else wins[levels[SEAT_ORDER_4.indexOf(w)]] = (wins[levels[SEAT_ORDER_4.indexOf(w)]] ?? 0) + 1;
  }
}
const total = rounds * 4;
console.log(`[L1vL${HI0}-${USE_V8 ? "v8" : "v9"}] L1 ${wins[1] ?? 0} 胜 vs L${HI0} ${wins[HI0] ?? 0} 胜（${total} 局 · 平 ${draws} · ${Math.round((Date.now() - t0) / 1000)}s）`);
