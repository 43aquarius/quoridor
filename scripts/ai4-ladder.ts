/* 四人局四档阶梯单调性：[L1,L2,L3,L4] 围桌对弈，席位轮转。
 * 校验高档位胜场 ≥ 低档位（L1<L2<L3<L4 的胜场递增）。
 * 运行：bun scripts/ai4-ladder.ts
 * 环境变量：LADDER_ROUNDS（轮数，默认 2，每轮 4 局）、LADDER_CAP（预算封顶 ms，默认 1200）
 */
import { initialGame, SEAT_ORDER_4, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, isEliminated, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove4 } from "../src/lib/game/ai4";

function play(levels: number[], capMs?: number, jitterPlies = 8): Player | null {
  let s: GameState = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  let guard = 0;
  while (!s.winner && guard < 320) {
    guard++;
    const p = s.turn as Player;
    if (isEliminated(s, p)) continue;
    const lv = levels[SEAT_ORDER_4.indexOf(p)] as 1 | 2 | 3 | 4;
    let d: ReturnType<typeof computeAiMove4> = null;
    if (s.history.length < jitterPlies) {
      const legal = legalPawnMoves(s, p);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        const from = { ...(p === "A" ? s.posA : p === "B" ? s.posB : p === "C" ? s.posC! : s.posD!) };
        d = { payload: { type: "pawn", from, to: pick }, label: "开局随机" };
      }
    }
    if (!d) d = computeAiMove4(s, lv, capMs ? { budgetMs: capMs } : undefined);
    if (!d) break;
    const r = applyPayload(s, p, d.payload);
    if (!r.ok || !r.state) {
      console.error(`  [异常] ${p}(L${lv}) 着法被拒：`, JSON.stringify(d.payload), r.reason);
      break;
    }
    s = r.state;
  }
  return s.winner;
}

const rounds = process.env.LADDER_ROUNDS ? Number(process.env.LADDER_ROUNDS) : 2;
const cap = process.env.LADDER_CAP ? Number(process.env.LADDER_CAP) : 1200;
const wins: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
let draws = 0;
const t0 = Date.now();
for (let r = 0; r < rounds; r++) {
  for (let rot = 0; rot < 4; rot++) {
    /* 每轮把 [L1,L2,L3,L4] 轮转一个席位，各档都坐过每个席位 */
    const levels = [0, 1, 2, 3].map((i) => ((i + rot) % 4) + 1);
    const w = play(levels, cap);
    if (!w) draws++;
    else wins[levels[SEAT_ORDER_4.indexOf(w)]]++;
  }
}
const total = rounds * 4;
console.log(`=== 四人局阶梯（${total} 局，预算 ${cap}ms，开局随机 8 手） ===`);
for (const lv of [1, 2, 3, 4]) {
  console.log(`L${lv}：${wins[lv]} 胜 (${Math.round((wins[lv] / total) * 100)}%)`);
}
console.log(`平局：${draws}  用时 ${((Date.now() - t0) / 60000).toFixed(1)}min`);
const ok = wins[2] >= wins[1] && wins[3] >= wins[2] && wins[4] >= wins[3];
console.log(ok ? "单调性：通过（L1≤L2≤L3≤L4）" : "单调性：不通过，需调参！");
if (!ok) process.exit(1);
