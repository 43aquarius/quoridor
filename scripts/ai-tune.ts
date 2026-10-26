/* AI 调参对弈：支持预算上限 + 二人/四人局，多档交叉对弈。
 * 用途：加强档位前后的基线对比（bun run scripts/ai-tune.ts [每场局数] [预算上限ms]）。
 * 与 ai-duel.ts 独立，不改动作者脚本。
 */

import { initialGame, type AiLevel, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

const N = Number(process.argv[2] ?? 4);
const CAP = Number(process.argv[3] ?? 700);

/* 安全落子：非法着法兜底走子，保证对局不中断 */
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

function play2p(levelA: AiLevel, levelB: AiLevel): { winner: Player | null; moves: number } {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 500) {
    guard++;
    s = safeStep(s, s.turn === "A" ? levelA : levelB);
  }
  return { winner: s.winner, moves: s.history.length };
}

/* 四人局：四席分别按 levels[p] 档位行棋，返回胜者席位 */
function play4pSimple(levels: Record<Player, AiLevel>): { winner: Player | null; moves: number } {
  let s: GameState = initialGame({ playerCount: 4 });
  let guard = 0;
  while (!s.winner && guard < 800) {
    guard++;
    s = safeStep(s, levels[s.turn as Player]);
  }
  return { winner: s.winner, moves: s.history.length };
}

function line2(name: string, a: AiLevel, b: AiLevel) {
  let wa = 0;
  let wb = 0;
  let moves = 0;
  for (let i = 0; i < N; i++) {
    const g = play2p(a, b);
    if (g.winner === "A") wa++;
    else if (g.winner === "B") wb++;
    moves += g.moves;
  }
  console.log(
    `${name} L${a} 执甲 ${wa}胜 vs L${b} 执乙 ${wb}胜 · 均 ${Math.round(moves / N)} 手`,
  );
}

function line4(name: string, levels: Record<Player, AiLevel>) {
  const wins: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  let moves = 0;
  for (let i = 0; i < N; i++) {
    const g = play4pSimple(levels);
    if (g.winner) wins[g.winner]++;
    moves += g.moves;
  }
  console.log(
    `${name} · 甲L${levels.A} ${wins.A} / 丙L${levels.C} ${wins.C} / 乙L${levels.B} ${wins.B} / 丁L${levels.D} ${wins.D} · 均 ${Math.round(moves / N)} 手`,
  );
}

const mode = process.argv[4] ?? "2p";
console.log(`=== AI 调参对弈 · ${mode} · 每场 ${N} 局 · 预算上限 ${CAP}ms ===\n`);

if (mode === "2p" || mode === "all") {
  line2("学徒×排字师", 1, 2);
  line2("排字师×学徒", 2, 1);
  line2("排字师×总编", 2, 3);
  line2("总编×排字师", 3, 2);
  line2("学徒×总编", 1, 3);
  line2("总编×学徒", 3, 1);
  line2("总编×社长", 3, 4);
  line2("社长×总编", 4, 3);
  line2("排字师×社长", 2, 4);
  line2("社长×排字师", 4, 2);
}

if (mode === "4p" || mode === "all") {
  line4("四人桌 学徒全员", { A: 1, B: 1, C: 1, D: 1 });
  line4("四人桌 学徒对社长", { A: 1, B: 4, C: 1, D: 4 });
  line4("四人桌 排字师对社长", { A: 2, B: 4, C: 2, D: 4 });
  line4("四人桌 排字师对总编", { A: 2, B: 3, C: 2, D: 3 });
  line4("四人桌 学徒对排字师", { A: 1, B: 2, C: 1, D: 2 });
}
