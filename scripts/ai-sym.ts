/* 对称性测试：同档自博弈，统计甲乙胜负 */
import { initialGame, type GameState, type AiLevel } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

function play(level: AiLevel): string {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 300) {
    guard++;
    const d = computeAiMove(s, level);
    if (!d) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) break;
    s = r.state;
  }
  return s.winner ?? "draw";
}

for (const lvl of [2, 3, 4] as AiLevel[]) {
  let a = 0, b = 0, d = 0;
  const N = 8;
  for (let i = 0; i < N; i++) {
    const w = play(lvl);
    if (w === "A") a++; else if (w === "B") b++; else d++;
  }
  console.log(`L${lvl} 自博弈 ${N} 局：甲 ${a} · 乙 ${b} · 平 ${d}`);
}
