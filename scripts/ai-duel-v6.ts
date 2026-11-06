/* v7（本轮强化）vs v6（上一版快照）AI 对决 —— 二人局
 * 双向对弈（各执先手），统计总胜率。验证本轮净增益。
 * 运行：bun scripts/ai-duel-v6.ts
 * 环境变量：DUEL_N（每向局数，默认 4）、DUEL_CAP（v7 预算封顶 ms）、DUEL_CAP_OLD（v6 预算）、DUEL_LEVEL（2/3/4，0=全部）
 */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";
import { computeAiMoveV6 } from "../src/lib/game/ai-v6";

function play(levelA: AiLevel, levelB: AiLevel, aIsNew: boolean, capMs?: number, capOldMs?: number, jitterPlies = 6): string {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 240) {
    guard++;
    const isNewTurn = (s.turn === "A") === aIsNew;
    const level = s.turn === "A" ? levelA : levelB;
    const fn = isNewTurn ? computeAiMove : computeAiMoveV6;
    const cap = isNewTurn ? capMs : (capOldMs ?? capMs);
    let d: ReturnType<typeof computeAiMove>;
    /* 开局随机化：前 jitterPlies 手走随机合法棋子步（双方同待遇） */
    if (s.history.length < jitterPlies) {
      const legal = legalPawnMoves(s, s.turn);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        d = { payload: { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: pick }, label: "开局随机" };
      } else {
        d = fn(s, level, cap ? { budgetMs: cap } : undefined);
      }
    } else {
      d = fn(s, level, cap ? { budgetMs: cap } : undefined);
    }
    if (!d) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) {
      console.error("  [异常] 着法被拒：", JSON.stringify(d.payload));
      break;
    }
    s = r.state;
  }
  return s.winner ?? "draw";
}

function duel(level: AiLevel, n: number, capMs?: number, capOldMs?: number) {
  let newWins = 0;
  let oldWins = 0;
  let draws = 0;
  let newA = 0;
  let newB = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const w1 = play(level, level, true, capMs, capOldMs);
    if (w1 === "A") { newWins++; newA++; }
    else if (w1 === "B") oldWins++;
    else draws++;
    const w2 = play(level, level, false, capMs, capOldMs);
    if (w2 === "B") { newWins++; newB++; }
    else if (w2 === "A") oldWins++;
    else draws++;
  }
  const total = newWins + oldWins + draws;
  console.log(
    `L${level}：v7 ${newWins}/${total} (${Math.round((newWins / total) * 100)}%) | v6 ${oldWins} | 平 ${draws}  [v7执甲 ${newA}胜 · v7执乙 ${newB}胜]  用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
}

const cap = process.env.DUEL_CAP ? Number(process.env.DUEL_CAP) : undefined;
const capOld = process.env.DUEL_CAP_OLD ? Number(process.env.DUEL_CAP_OLD) : undefined;
const n = process.env.DUEL_N ? Number(process.env.DUEL_N) : 4;
console.log(`=== v7 vs v6 对决（每向 ${n} 局，v7 预算 ${cap ?? "全档默认"} / v6 预算 ${capOld ?? cap ?? "同 v7"}） ===`);
const which = process.env.DUEL_LEVEL ? Number(process.env.DUEL_LEVEL) : 0;
if (which === 0 || which === 2) duel(2, n, cap, capOld);
if (which === 0 || which === 3) duel(3, n, cap, capOld);
if (which === 0 || which === 4) duel(4, n, cap, capOld);
