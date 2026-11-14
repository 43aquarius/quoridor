/* v10 反折返修复 A/B 强度对照：v10(修复) vs v10-off(原版)，同档同预算，
 * 双向换色（A/B 席互换），统计胜场与平均手数。
 * 用法：bun run scripts/ab-v10.ts budget=600 games=6 level=3
 * 消融副本 src/lib/game/ai-nov10.ts 由本脚本自动生成（OFF_SHUTTLE=true）。 */
import { initialGame, type GameState } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMove as aiFixed } from "../src/lib/game/ai";

/* 自动生成消融副本（读取 ai.ts，把 OFF_SHUTTLE 开关硬编码为 true） */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const NOV10 = join(process.cwd(), "src/lib/game/ai-nov10.ts");
if (!existsSync(NOV10)) {
  const src = readFileSync(join(process.cwd(), "src/lib/game/ai.ts"), "utf8");
  const patched = src.replace(
    /const OFF_SHUTTLE = !!ENV\.QUORIDOR_AI_OFF_SHUTTLE;.*/,
    "const OFF_SHUTTLE = true; /* v10 off (A/B 对照，由 ab-v10.ts 生成) */",
  );
  if (patched === src) {
    console.error("!! 生成消融副本失败：OFF_SHUTTLE 开关行未匹配");
    process.exit(1);
  }
  writeFileSync(NOV10, patched);
}
/* 动态指定符：文件由上方运行时生成，静态检查跳过 */
const aiOffMod: { computeAiMove: typeof aiFixed } = await import(NOV10);
const aiOff = aiOffMod.computeAiMove;

const args = process.argv.slice(2);
const a = (k: string, d: number) => {
  const f = args.find((x) => x.startsWith(k + "="));
  return f ? Number(f.split("=")[1]) : d;
};
const BUDGET = a("budget", 600);
const GAMES = a("games", 6);
const LEVEL = a("level", 3) as 1 | 2 | 3 | 4;

let fixedWins = 0;
let offWins = 0;
let movesSum = 0;
let games = 0;
for (let g = 0; g < GAMES * 2; g++) {
  const fixedSeat: "A" | "B" = g % 2 === 0 ? "A" : "B"; /* 换色 */
  let s: GameState = initialGame();
  let moves = 0;
  while (!s.winner && moves < 220) {
    const isFixed = s.turn === fixedSeat;
    const d = isFixed ? aiFixed(s, LEVEL, { budgetMs: BUDGET }) : aiOff(s, LEVEL, { budgetMs: BUDGET });
    if (!d || (d.payload.type !== "pawn" && d.payload.type !== "wall")) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) break;
    s = r.state;
    moves++;
  }
  games++;
  movesSum += moves;
  if (s.winner === fixedSeat) fixedWins++;
  else if (s.winner) offWins++;
  console.log(
    `G${g}: 修复执${fixedSeat} ${moves}手 胜者=${s.winner ?? "上限"} ${s.winner === fixedSeat ? "→ 修复胜" : s.winner ? "→ 原版胜" : "→ 平/上限"}`,
  );
}
console.log(`\n===== v10修复 vs 原版 (L${LEVEL}, ${BUDGET}ms, ${games}局) =====`);
console.log(`修复 ${fixedWins} : ${offWins} 原版 · 平均 ${Math.round(movesSum / games)} 手/局`);
