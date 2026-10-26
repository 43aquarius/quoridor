/* 同档位先后手偏差测试 */
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

function series(name: string, a: AiLevel, b: AiLevel, n: number, capMs?: number) {
  let aw = 0;
  let bw = 0;
  let dr = 0;
  for (let i = 0; i < n; i++) {
    const w = play(a, b, capMs);
    if (w === "A") aw++;
    else if (w === "B") bw++;
    else dr++;
  }
  console.log(`${name}：甲 ${aw} | 乙 ${bw} | 平 ${dr}`);
}

series("旧L3-A vs 旧L3-B (同档异侧)", 3, 3, 6, 600);
series("旧L1-A vs 旧L1-B (同档异侧)", 1, 1, 6);
