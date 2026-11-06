/* 产品口径对决：v8（默认预算 + 开局库）vs v7（默认预算，无开局库）
 * 标准开局、无随机化——用户真实体验口径的强度验证。
 * 运行：bun scripts/ai-duel-default.ts [档位] [每向局数]
 */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";
import { computeAiMoveV6 } from "../src/lib/game/ai-v6";

const LEVEL = Number(process.argv[2] ?? 3) as AiLevel;
const N = Number(process.argv[3] ?? 2);
const SIDE = process.argv[4] ?? "both"; /* a=仅v8执甲 · b=仅v8执乙 */

function play(v8IsA: boolean): string {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 240) {
    guard++;
    const v8Turn = (s.turn === "A") === v8IsA;
    const d = v8Turn
      ? computeAiMove(s, LEVEL) /* v8 默认预算（不传 cap） */
      : computeAiMoveV6(s, LEVEL); /* v7 默认预算 */
    if (!d) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) { console.error("着法被拒", JSON.stringify(d.payload)); break; }
    s = r.state;
  }
  if (guard >= 240) return "draw";
  return s.winner ?? "draw";
}

let v8w = 0, v7w = 0, dr = 0, v8a = 0;
const t0 = Date.now();
if (SIDE !== "b") for (let i = 0; i < N; i++) {
  const r = play(true); /* v8 执甲 */
  if (r === "A") { v8w++; v8a++; } else if (r === "B") v7w++; else dr++;
  console.log(`  局${i + 1}a（v8执甲）: ${r}`);
}
if (SIDE !== "a") for (let i = 0; i < N; i++) {
  const r = play(false); /* v8 执乙 */
  if (r === "B") { v8w++; } else if (r === "A") v7w++; else dr++;
  console.log(`  局${i + 1}b（v8执乙）: ${r}`);
}
console.log(`\nL${LEVEL} 产品口径：v8 ${v8w} 胜 vs v7 ${v7w} 胜（平 ${dr}）· v8执甲 ${v8a} 胜 · 用时 ${Math.round((Date.now() - t0) / 1000)}s`);
