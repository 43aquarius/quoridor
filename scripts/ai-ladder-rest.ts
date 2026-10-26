/* 阶梯基准（补充）：仅跑 ai-ladder 中被超时截断的社长执甲两组，n=4。 */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

function play(levelA: AiLevel, levelB: AiLevel): string {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 240) {
    guard++;
    const level = s.turn === "A" ? levelA : levelB;
    const d = computeAiMove(s, level);
    if (!d) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) break;
    s = r.state;
  }
  return s.winner ?? "draw";
}

function series(name: string, a: AiLevel, b: AiLevel, n = 4) {
  let aw = 0;
  let bw = 0;
  let dr = 0;
  for (let i = 0; i < n; i++) {
    const w = play(a, b);
    if (w === "A") aw++;
    else if (w === "B") bw++;
    else dr++;
  }
  console.log(`${name}：甲(L${a}) ${aw}胜 | 乙(L${b}) ${bw}胜 | 平 ${dr}`);
}

series("社长L4-A vs 学徒L1-B ", 4, 1);
series("社长L4-A vs 排字L2-B ", 4, 2);
