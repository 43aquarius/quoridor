/* v11 vs v10.5 二人局产品口径对决（各自默认预算与档位参数，无等预算约束）。
 * 开局前 4 手随机合法棋子步打破确定性，双向换色，JSONL 断点续跑。
 * 用法：bun scripts/ai-duel-v11.ts level=3 games=2
 *      （games = 每方局数；总局数 = games×2） */
import { initialGame, type GameState, type AiLevel } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves, checkWall } from "../src/lib/game/engine";
import { computeAiMove as moveV11 } from "../src/lib/game/ai";
import { computeAiMove as moveV10 } from "../src/lib/game/ai-v10";
import { existsSync, readFileSync, appendFileSync } from "node:fs";

type Engine = typeof moveV11;

function playGame(engA: Engine, engB: Engine, level: AiLevel, rndOpen: number): { winner: "A" | "B" | null; moves: number; illegal: number } {
  let s: GameState = initialGame();
  let guard = 0;
  let illegal = 0;
  while (!s.winner && guard < 400) {
    guard++;
    if (rndOpen > 0 && s.history.length < rndOpen) {
      const legal = legalPawnMoves(s, s.turn);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        const from = s.turn === "A" ? s.posA : s.posB;
        s = applyPayload(s, s.turn, { type: "pawn", from: { ...from }, to: pick }).state!;
        continue;
      }
    }
    const eng = s.turn === "A" ? engA : engB;
    const d = eng(s, level);
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
const a = (k: string, d: number) => {
  const f = args.find((x) => x.startsWith(k + "="));
  return f ? Number(f.split("=")[1]) : d;
};
const LEVELS = (args.find((x) => x.startsWith("levels="))?.split("=")[1] ?? "3,4").split(",").map(Number) as AiLevel[];
const GAMES = a("games", 2);
const RND = a("rnd", 4);

for (const level of LEVELS) {
  const logPath = `/tmp/duel-v11-prod-L${level}.jsonl`;
  const done: number[] = [];
  if (existsSync(logPath)) {
    for (const line of readFileSync(logPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        done.push(JSON.parse(line).i);
      } catch {
        /* 残行 */
      }
    }
  }
  let v11Wins = 0;
  let v10Wins = 0;
  let movesSum = 0;
  let played = 0;
  const t0 = Date.now();
  for (let i = 0; i < GAMES * 2; i++) {
    if (done.includes(i)) continue;
    const v11IsA = i % 2 === 0;
    const r = playGame(v11IsA ? moveV11 : moveV10, v11IsA ? moveV10 : moveV11, level, RND);
    let v11Win = false;
    if (r.winner === "A" && v11IsA) v11Win = true;
    if (r.winner === "B" && !v11IsA) v11Win = true;
    if (v11Win) v11Wins++;
    else if (r.winner) v10Wins++;
    movesSum += r.moves;
    played++;
    appendFileSync(logPath, `${JSON.stringify({ i, v11IsA, winner: r.winner, moves: r.moves, illegal: r.illegal })}\n`);
    console.log(
      `  [L${level} 第${i + 1}局] v11执${v11IsA ? "甲" : "乙"} · ${r.moves} 手 · 胜者=${r.winner ?? "无"} · 累计 v11 ${v11Wins} : ${v10Wins} v10 · ${Math.round((Date.now() - t0) / 1000)}s`,
    );
  }
  console.log(
    `===== L${level} 产品口径：v11 ${v11Wins} : ${v10Wins} v10.5（本次 ${played} 局 · 断点累计 ${played + done.length} 局）=====`,
  );
}
