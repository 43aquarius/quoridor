/* 同引擎跨深度对照（env 在动态 import 前设置） */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";

process.env.QUORIDOR_AI_DEPTH = process.argv[2] ?? "";
process.env.QUORIDOR_AI_WALLS = process.argv[3] ?? "";
process.env.QUORIDOR_AI_ROOT = process.argv[4] ?? "";
const { computeAiMove } = await import("../src/lib/game/ai");

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

function series(name: string, a: AiLevel, b: AiLevel, n = 6) {
  let aw = 0, bw = 0, dr = 0;
  for (let i = 0; i < n; i++) {
    const w = play(a, b);
    if (w === "A") aw++; else if (w === "B") bw++; else dr++;
  }
  console.log(`${name}：甲(L${a}) ${aw} | 乙(L${b}) ${bw} | 平 ${dr} / ${n}`);
}

console.log(`深度=${process.env.QUORIDOR_AI_DEPTH || "默认"} 墙=${process.env.QUORIDOR_AI_WALLS || "默认"} 根=${process.env.QUORIDOR_AI_ROOT || "默认"}`);
series("L2 vs L4", 2, 4);
series("L4 vs L2", 4, 2);
