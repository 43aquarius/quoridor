/* 二人局聚焦对弈：先后手对消、大样本验证梯度
 * bun run scripts/ai-tune2.ts [每向局数] [预算上限ms]
 */
import { initialGame, type AiLevel, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

const N = Number(process.argv[2] ?? 10);
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

function play2(a: AiLevel, b: AiLevel): Player | null {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 500) {
    guard++;
    s = safeStep(s, s.turn === "A" ? a : b);
  }
  return s.winner;
}

function series(name: string, hi: AiLevel, lo: AiLevel) {
  let hiWins = 0;
  let loWins = 0;
  let moves = 0;
  for (let i = 0; i < N; i++) {
    const w = play2(hi, lo);
    if (w === "A") hiWins++;
    else if (w === "B") loWins++;
  }
  for (let i = 0; i < N; i++) {
    const w = play2(lo, hi);
    if (w === "A") loWins++;
    else if (w === "B") hiWins++;
    moves += 0;
  }
  const t = hiWins + loWins;
  console.log(`${name}: L${hi} ${hiWins}胜 vs L${lo} ${loWins}胜 · 合计 ${t} 局`);
}

console.log(`=== 二人局聚焦（每向 ${N} 局 · 预算上限 ${CAP}ms）===`);
series("社长×总编", 4, 3);
series("总编×排字师", 3, 2);
series("排字师×学徒", 2, 1);
series("总编×学徒", 3, 1);
series("社长×排字师", 4, 2);
series("社长×学徒", 4, 1);
