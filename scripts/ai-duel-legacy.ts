/* 新旧 AI 对决：强化版（src/lib/game/ai.ts）vs 旧版（ai-legacy.ts）
 * 双向对弈（各执先手），统计总胜率。
 * 运行：bun run scripts/ai-duel-legacy.ts
 */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";
import { computeAiMoveLegacy } from "../src/lib/game/ai-legacy";
import { lastSearchStats } from "../src/lib/game/ai";

type Side = "new" | "old";

function play(levelA: AiLevel, levelB: AiLevel, aIsNew: boolean, capMs?: number, jitterPlies = 6): string {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 240) {
    guard++;
    const isNewTurn = (s.turn === "A") === aIsNew;
    const level = s.turn === "A" ? levelA : levelB;
    const fn = isNewTurn ? computeAiMove : computeAiMoveLegacy;
    let d: ReturnType<typeof computeAiMove>;
    /* 开局随机化：前 jitterPlies 手走随机合法棋子步（双方同待遇，省去 AI 计算） */
    if (s.history.length < jitterPlies) {
      const legal = legalPawnMoves(s, s.turn);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        d = { payload: { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: pick }, label: "开局随机" };
      } else {
        d = fn(s, level, capMs ? { budgetMs: capMs } : undefined);
      }
    } else {
      d = fn(s, level, capMs ? { budgetMs: capMs } : undefined);
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

function duel(level: AiLevel, n: number, capMs?: number) {
  let newWins = 0;
  let oldWins = 0;
  let draws = 0;
  let newA = 0;
  let oldA = 0;
  let newB = 0;
  let oldB = 0;
  for (let i = 0; i < n; i++) {
    /* 新执甲（先手） */
    const w1 = play(level, level, true, capMs);
    if (w1 === "A") { newWins++; newA++; }
    else if (w1 === "B") { oldWins++; oldB++; }
    else draws++;
    /* 新执乙（后手，产品单人模式的真实座位） */
    const w2 = play(level, level, false, capMs);
    if (w2 === "B") { newWins++; newB++; }
    else if (w2 === "A") { oldWins++; oldA++; }
    else draws++;
  }
  const total = newWins + oldWins + draws;
  console.log(
    `L${level}：新 ${newWins}/${total} (${Math.round((newWins / total) * 100)}%) | 旧 ${oldWins} | 平 ${draws}  [新执甲 ${newA}胜/旧 ${oldA} · 新执乙 ${newB}胜/旧 ${oldB}]`,
  );
}

const cap = process.env.DUEL_CAP ? Number(process.env.DUEL_CAP) : undefined;
const n = process.env.DUEL_N ? Number(process.env.DUEL_N) : 3;
console.log(`=== 新旧 AI 对决（每向 ${n} 局，预算封顶 ${cap ?? "全档默认"}） ===`);
const which = process.env.DUEL_LEVEL ? Number(process.env.DUEL_LEVEL) : 0;
if (which === 0 || which === 2) duel(2, n, cap);
if (which === 0 || which === 3) duel(3, n, cap);
if (which === 0 || which === 4) duel(4, n, cap);
if (process.env.DUEL_STATS) {
  const st = lastSearchStats();
  console.log("最后搜索统计:", JSON.stringify(st));
}
