/* L2 候选窗加宽 A/B：ai-v10-l2wide（20/32） vs ai-v10（16/24），产品口径
 * （L2 深度封顶 7、预算 2000ms 有闲余——加宽只消耗闲时，不稀释深度）。
 * 结果（v11）：37 局 19:18（51%）——中性，不采纳；脚本留档复现。
 * 用法：bun scripts/ab-l2wide.ts games=8 */
import { initialGame, type GameState } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves, checkWall } from "../src/lib/game/engine";
import { computeAiMove as engBase } from "../src/lib/game/ai-v10";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* 自动生成宽窗副本（基于 v10.5 快照，仅改 L2 两行窗宽） */
const WIDE_PATH = join(process.cwd(), "src/lib/game/ai-v10-l2wide.ts");
if (!existsSync(WIDE_PATH)) {
  const src = readFileSync(join(process.cwd(), "src/lib/game/ai-v10.ts"), "utf8");
  const patched = src
    .replace("      wallLimit: ENV_WALLS ?? 16,", "      wallLimit: ENV_WALLS ?? 20,")
    .replace("      rootWallLimit: ENV_ROOT ?? 24,", "      rootWallLimit: ENV_ROOT ?? 32,");
  if (patched === src) {
    console.error("!! 生成 ai-v10-l2wide.ts 失败：L2 窗宽行未匹配");
    process.exit(1);
  }
  writeFileSync(WIDE_PATH, patched);
}
const wideMod: { computeAiMove: typeof engBase } = await import(WIDE_PATH);
const engWide = wideMod.computeAiMove;

const args = process.argv.slice(2);
const a = (k: string, d: number) => {
  const f = args.find((x) => x.startsWith(k + "="));
  return f ? Number(f.split("=")[1]) : d;
};
const GAMES = a("games", 8);

function playGame(wideIsA: boolean): { winner: "A" | "B" | null; moves: number } {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 400) {
    guard++;
    const eng = s.turn === "A" ? (wideIsA ? engWide : engBase) : wideIsA ? engBase : engWide;
    const d = eng(s, 2);
    if (!d) break;
    if (d.payload.type === "pawn") {
      const legal = legalPawnMoves(s, s.turn);
      if (!legal.some((v) => v.x === d.payload.to?.x && v.y === d.payload.to?.y)) {
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
        const legal = legalPawnMoves(s, s.turn);
        if (legal.length > 0) {
          s = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: legal[0] }).state!;
          continue;
        }
      }
    }
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) break;
    s = r.state;
  }
  return { winner: s.winner as "A" | "B" | null, moves: s.history.length };
}

let wideWins = 0;
let baseWins = 0;
let movesSum = 0;
const t0 = Date.now();
for (let i = 0; i < GAMES * 2; i++) {
  const wideIsA = i % 2 === 0;
  const r = playGame(wideIsA);
  let wideWin = false;
  if (r.winner === "A" && wideIsA) wideWin = true;
  if (r.winner === "B" && !wideIsA) wideWin = true;
  if (wideWin) wideWins++;
  else if (r.winner) baseWins++;
  movesSum += r.moves;
  console.log(
    `G${i + 1}: 宽窗执${wideIsA ? "甲" : "乙"} · ${r.moves} 手 · 胜者=${r.winner ?? "无"} · 累计 宽窗 ${wideWins} : ${baseWins} 原窗 · ${Math.round((Date.now() - t0) / 1000)}s`,
  );
}
console.log(
  `===== L2 宽窗(20/32) vs 原窗(16/24) · 产品口径 · ${GAMES * 2} 局：宽窗 ${wideWins} : ${baseWins} 原窗 · 均 ${Math.round(movesSum / (GAMES * 2))} 手 =====`,
);
