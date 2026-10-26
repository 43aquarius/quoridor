/* 四人桌聚焦对弈：席位对调消除座次偏差，大样本验证档位梯度
 * bun run scripts/ai-tune-focus.ts [每场局数]
 */
import { initialGame, type AiLevel, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

const N = Number(process.argv[2] ?? 8);
const CAP = Number(process.argv[3] ?? 700);

function safeStep(s: GameState, level: AiLevel): GameState {
  const d = computeAiMove(s, level, { budgetMs: CAP });
  if (!d) return s;
  const r = applyPayload(s, s.turn, d.payload);
  if (r.ok && r.state) return r.state;
  const legal = legalPawnMoves(s, s.turn);
  if (legal.length > 0) {
    const r2 = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: legal[0] });
    if (r2.ok && r2.state) return r2.state;
  }
  return s;
}

function play4(levels: Record<Player, AiLevel>): Player | null {
  let s: GameState = initialGame({ playerCount: 4 });
  let guard = 0;
  while (!s.winner && guard < 800) {
    guard++;
    s = safeStep(s, levels[s.turn as Player]);
  }
  return s.winner;
}

function series(name: string, hi: AiLevel, lo: AiLevel) {
  /* hi 坐 A/C、lo 坐 B/D 跑 N 局；再对调坐 B/D、A/C 跑 N 局 */
  let hiWins = 0;
  let loWins = 0;
  for (let i = 0; i < N; i++) {
    const w = play4({ A: hi, C: hi, B: lo, D: lo });
    if (w === "A" || w === "C") hiWins++;
    else if (w === "B" || w === "D") loWins++;
  }
  for (let i = 0; i < N; i++) {
    const w = play4({ A: lo, C: lo, B: hi, D: hi });
    if (w === "A" || w === "C") loWins++;
    else if (w === "B" || w === "D") hiWins++;
  }
  const t = hiWins + loWins;
  console.log(`${name}: L${hi} ${hiWins}胜 vs L${lo} ${loWins}胜 · 合计 ${t} 局`);
}

console.log(`=== 四人桌聚焦（每向 ${N} 局 × 2 席位向 · 预算上限 ${CAP}ms）===`);
series("社长×排字师", 4, 2);
series("社长×学徒", 4, 1);
series("总编×排字师", 3, 2);
series("排字师×学徒", 2, 1);
series("社长×总编", 4, 3);
