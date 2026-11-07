/* v9 vs v8 二人局对决：等预算消融（验证算法增益）+ 产品口径（验证提档增益）。
 * 运行：bun scripts/ai-duel-v9.ts [预算ms] [每方局数] [级别列表(逗号)]
 * 例：bun scripts/ai-duel-v9.ts 800 3 2,3,4
 * 不带预算参数 = 产品口径（各自默认预算）。
 */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves, checkWall } from "../src/lib/game/engine";
import { computeAiMove as moveV9 } from "../src/lib/game/ai";
import { computeAiMove as moveV8 } from "../src/lib/game/ai-v8";

type Engine = typeof moveV9;

function playGame(
  engA: Engine,
  engB: Engine,
  level: AiLevel,
  cap: number | undefined,
): { winner: "A" | "B" | null; moves: number; illegal: number } {
  let s: GameState = initialGame();
  let guard = 0;
  let illegal = 0;
  /* 预算抖动 ±15%：消解引擎确定性（同配置重复同局），模拟真实时钟噪声 */
  const jitter = () => (cap != null ? { budgetMs: Math.round(cap * (0.85 + Math.random() * 0.3)) } : undefined);
  while (!s.winner && guard < 400) {
    guard++;
    const eng = s.turn === "A" ? engA : engB;
    const d = eng(s, level, jitter());
    if (!d) break;
    if (d.payload.type === "pawn") {
      const legal = legalPawnMoves(s, s.turn);
      if (!legal.some((v) => v.x === d.payload.to?.x && v.y === d.payload.to?.y)) {
        illegal++;
        const alt = legal[0];
        if (alt) {
          s = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: alt }).state!;
          continue;
        }
      }
    }
    if (d.payload.type === "wall" && d.payload.wall) {
      const chk = checkWall(s, d.payload.wall.x, d.payload.wall.y, d.payload.wall.o, s.turn);
      if (!chk.ok) {
        illegal++;
        const legal = legalPawnMoves(s, s.turn);
        if (legal.length > 0) {
          s = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: legal[0] }).state!;
          continue;
        }
      }
    }
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) {
      illegal++;
      const legal = legalPawnMoves(s, s.turn);
      if (legal.length > 0) {
        s = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: legal[0] }).state!;
        continue;
      }
      break;
    }
    s = r.state;
  }
  return { winner: s.winner as "A" | "B" | null, moves: s.history.length, illegal };
}

const args = process.argv.slice(2);
const cap = args[0] ? Number(args[0]) : undefined;
const perSide = args[1] ? Number(args[1]) : 3;
const levels = (args[2] ? args[2].split(",") : ["4"]).map(Number) as AiLevel[];

for (const level of levels) {
  let v9Wins = 0;
  let v8Wins = 0;
  let moves = 0;
  let illegal = 0;
  const t0 = Date.now();
  for (let i = 0; i < perSide * 2; i++) {
    const v9IsA = i % 2 === 0;
    const r = playGame(v9IsA ? moveV9 : moveV8, v9IsA ? moveV8 : moveV9, level, cap);
    if (r.winner === "A") {
      if (v9IsA) v9Wins++;
      else v8Wins++;
    } else if (r.winner === "B") {
      if (v9IsA) v8Wins++;
      else v9Wins++;
    }
    moves += r.moves;
    illegal += r.illegal;
    console.log(
      `  [L${level} 第${i + 1}局] v9执${v9IsA ? "甲" : "乙"} · ${r.winner ? `胜者=${r.winner === "A" ? "甲" : "乙"}` : "无胜"} · ${r.moves} 手 · v9 ${v9Wins}: ${v8Wins} v8 · mem=${(process.memoryUsage.rss() / 1e6).toFixed(0)}MB`,
    );
  }
  const games = perSide * 2;
  console.log(
    `[L${level}] ${cap != null ? `等预算 ${cap}ms` : "产品口径"}: v9 ${v9Wins} 胜 vs v8 ${v8Wins} 胜 ` +
      `(${games} 局 · 均 ${Math.round(moves / games)} 手 · 非法兜底 ${illegal} 次 · ${Math.round((Date.now() - t0) / 1000)}s)`,
  );
}
