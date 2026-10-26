/* 大样本对局：L3/L4 执甲 vs L1 执乙，逐局打印 */
import { initialGame, type GameState, type AiLevel } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

function play(levelA: AiLevel, levelB: AiLevel): { winner: string; moves: number } {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 300) {
    guard++;
    const level = s.turn === "A" ? levelA : levelB;
    const d = computeAiMove(s, level);
    if (!d) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) {
      console.log(`  [非法] 第${guard}手 ${s.turn} ${JSON.stringify(d.payload)}`);
      const fallback = computeAiMove({ ...s, turn: s.turn }, 1);
      if (fallback) {
        const r2 = applyPayload(s, s.turn, fallback.payload);
        if (r2.ok && r2.state) {
          s = r2.state;
          continue;
        }
      }
      break;
    }
    s = r.state;
  }
  return { winner: s.winner ?? "draw", moves: s.history.length };
}

const N = 10;
for (const lvl of [3, 4] as AiLevel[]) {
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  console.log(`\n=== L${lvl} 执甲 vs L1 执乙 · ${N} 局 ===`);
  for (let i = 0; i < N; i++) {
    const g = play(lvl, 1);
    if (g.winner === "A") aWins++;
    else if (g.winner === "B") bWins++;
    else draws++;
    console.log(`  局${i + 1}: ${g.winner} · ${g.moves} 手`);
  }
  console.log(`L${lvl} 汇总: ${aWins}胜 ${bWins}负 ${draws}平`);
}
