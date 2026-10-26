/* 阶梯基准：模拟产品真实场景——人类（甲，先后手先行）对战 AI（乙）。
 * 人类代理：L1（弱：随机学徒）/ L2（中：贪心排字师风格）。
 * 目标：乙侧 AI 难度随档位单调递增：L1-B < L2-B < L3-B < L4-B。
 * 附：AI 执甲的通用强度对照。
 */

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

function series(name: string, a: AiLevel, b: AiLevel, n = 8) {
  let aw = 0;
  let bw = 0;
  let dr = 0;
  for (let i = 0; i < n; i++) {
    const w = play(a, b);
    if (w === "A") aw++;
    else if (w === "B") bw++;
    else dr++;
  }
  const pct = (x: number) => `${Math.round((x / n) * 100)}%`.padStart(4);
  console.log(`${name}：甲(L${a}) ${aw}胜${pct(aw)} | 乙(L${b}) ${bw}胜${pct(bw)} | 平 ${dr}`);
}

console.log("=== 人类代理（甲）vs AI（乙）阶梯 ===");
series("弱代理 L1-A vs 学徒L1-B ", 1, 1);
series("弱代理 L1-A vs 排字L2-B ", 1, 2);
series("弱代理 L1-A vs 总编L3-B ", 1, 3);
series("弱代理 L1-A vs 社长L4-B ", 1, 4);
console.log("---");
series("中代理 L2-A vs 学徒L1-B ", 2, 1);
series("中代理 L2-A vs 排字L2-B ", 2, 2);
series("中代理 L2-A vs 总编L3-B ", 2, 3);
series("中代理 L2-A vs 社长L4-B ", 2, 4);
console.log("\n=== AI 执甲强度对照 ===");
series("总编L3-A vs 学徒L1-B ", 3, 1);
series("社长L4-A vs 学徒L1-B ", 4, 1);
series("社长L4-A vs 排字L2-B ", 4, 2);
