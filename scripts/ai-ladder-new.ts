/* 新 AI 阶梯单调性验证：L1 < L2 < L3 < L4（含开局随机化） */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

function play(levelA: AiLevel, levelB: AiLevel, jitterPlies = 6, capMs?: number): string {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 240) {
    guard++;
    const level = s.turn === "A" ? levelA : levelB;
    let d = computeAiMove(s, level, capMs ? { budgetMs: capMs } : undefined);
    if (s.history.length < jitterPlies) {
      const legal = legalPawnMoves(s, s.turn);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        d = { payload: { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: pick }, label: "开局随机" };
      }
    }
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
    const w = play(a, b, 6, capMs);
    if (w === "A") aw++;
    else if (w === "B") bw++;
    else dr++;
  }
  const pct = (x: number) => `${Math.round((x / n) * 100)}%`.padStart(4);
  console.log(`${name}：甲 ${aw}胜${pct(aw)} | 乙 ${bw}胜${pct(bw)} | 平 ${dr}`);
}

const n = Number(process.env.LADDER_N ?? 4);
const capEnv = Number(process.env.LADDER_CAP ?? 800);
const cap = capEnv > 0 ? capEnv : undefined;
console.log(`=== 新 AI 阶梯（开局随机化 6 手，同级对弈异档，预算 ${cap ? cap + "ms 封顶" : "全档默认"}） ===`);
series("新L1 vs 新L2", 1, 2, n);
series("新L2 vs 新L3", 2, 3, n, cap);
series("新L3 vs 新L4", 3, 4, n, cap);
series("新L2 vs 新L4", 2, 4, n, cap);
