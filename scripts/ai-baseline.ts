/* 基线基准：旧 AI（当前 main 版本）棋力测量
 * 运行：bun run scripts/ai-baseline.ts
 */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMoveLegacy } from "../src/lib/game/ai-legacy";

function play(levelA: AiLevel, levelB: AiLevel, capMs?: number): string {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 240) {
    guard++;
    const level = s.turn === "A" ? levelA : levelB;
    const d = computeAiMoveLegacy(s, level, capMs ? { budgetMs: capMs } : undefined);
    if (!d) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) break;
    s = r.state;
  }
  return s.winner ?? "draw";
}

function series(name: string, a: AiLevel, b: AiLevel, n = 8, capMs?: number) {
  let aw = 0;
  let bw = 0;
  let dr = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const w = play(a, b, capMs);
    if (w === "A") aw++;
    else if (w === "B") bw++;
    else dr++;
  }
  const pct = (x: number) => `${Math.round((x / n) * 100)}%`.padStart(4);
  console.log(
    `${name}：甲 ${aw}胜${pct(aw)} | 乙 ${bw}胜${pct(bw)} | 平 ${dr}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`,
  );
}

console.log("=== 旧 AI 基线（800ms 预算封顶，8 局/组） ===");
series("旧L2 vs 旧L1", 2, 1, 8, 800);
series("旧L3 vs 旧L2", 3, 2, 8, 800);
series("旧L4 vs 旧L3", 4, 3, 8, 800);
series("旧L4 vs 旧L2", 4, 2, 8, 800);
console.log("=== 旧 AI 基线（完整预算，4 局/组） ===");
series("旧L4 vs 旧L3", 4, 3, 4);
series("旧L3 vs 旧L2", 3, 2, 4);
