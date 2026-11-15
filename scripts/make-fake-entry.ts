/* 生成一局 120 手的仿真对局 ArchiveEntry，并产出浏览器注入脚本
 * （用于端到端验证棋谱海报长卷排版）。运行：bun scripts/make-fake-entry.ts
 */
import { writeFileSync } from "node:fs";

const N = 9;
const COL = "abcdefghijklm";
const cellName = (x: number, y: number) => COL[x] + String(N - y);
const wallName = (x: number, y: number, o: "h" | "v") => COL[x] + String(N - 1 - y) + "-" + (o === "h" ? "H" : "V");

type Move = {
  n: number;
  player: "A" | "B";
  notation: string;
  elapsedMs: number;
  t: number;
  payload: { type: "pawn"; from: { x: number; y: number }; to: { x: number; y: number } } | { type: "wall"; wall: { x: number; y: number; o: "h" | "v"; by: "A" | "B" } };
};

/* 甲从 e1 向上、乙从 e9 向下，蛇形前进并周期性放板（棋盘几何不校验，海报只管画） */
let ax = 4, ay = 8, bx = 4, by = 0;
const moves: Move[] = [];
const walls: Array<{ x: number; y: number; o: "h" | "v" }> = [];
let wallN = 0;
for (let n = 1; n <= 120; n++) {
  const player: "A" | "B" = n % 2 === 1 ? "A" : "B";
  const isWall = n % 11 === 5 && wallN < 20; // 每隔几手放一根板
  if (isWall) {
    const w = { x: (wallN * 3) % 7, y: 3 + (wallN % 4), o: (wallN % 2 === 0 ? "h" : "v") as "h" | "v" };
    walls.push(w);
    moves.push({
      n, player, notation: `WALL ${wallName(w.x, w.y, w.o)}`, elapsedMs: 2400 + (n * 137) % 5000, t: Date.now() - (120 - n) * 8000,
      payload: { type: "wall", wall: { ...w, by: player } },
    });
    wallN++;
  } else if (player === "A") {
    const dy = ay > 0 ? -1 : 0; // 甲一路向上
    const dx = dy === 0 ? (ax >= 8 ? -1 : 1) : (n % 6 === 1 ? (ax > 0 ? -1 : 1) : 0);
    const from = { x: ax, y: ay }, to = { x: ax + dx, y: ay + dy };
    moves.push({ n, player, notation: `${cellName(from.x, from.y)}→${cellName(to.x, to.y)}`, elapsedMs: 1200 + (n * 211) % 6000, t: Date.now() - (120 - n) * 8000, payload: { type: "pawn", from, to } });
    ax = to.x; ay = to.y;
  } else {
    const dy = by < 8 ? 1 : 0; // 乙一路向下
    const dx = dy === 0 ? (bx <= 0 ? 1 : -1) : (n % 5 === 2 ? (bx < 8 ? 1 : -1) : 0);
    const from = { x: bx, y: by }, to = { x: bx + dx, y: by + dy };
    moves.push({ n, player, notation: `${cellName(from.x, from.y)}→${cellName(to.x, to.y)}`, elapsedMs: 900 + (n * 173) % 5000, t: Date.now() - (120 - n) * 8000, payload: { type: "pawn", from, to } });
    bx = to.x; by = to.y;
  }
}
const wallsA = moves.filter((m) => m.payload.type === "wall" && m.player === "A").length;
const wallsB = moves.filter((m) => m.payload.type === "wall" && m.player === "B").length;

const entry = {
  id: "QTEST120",
  date: Date.now(),
  mode: "ai" as const,
  aiLevel: 4 as const,
  playerCount: 2 as const,
  labelA: "你",
  labelB: "大师 · 九段",
  winner: "A" as const,
  winReason: "goal" as const,
  moveCount: moves.length,
  durationMs: moves.reduce((s, m) => s + m.elapsedMs, 0),
  size: N,
  wallsPerPlayer: 10,
  wallsUsedA: wallsA,
  wallsUsedB: wallsB,
  maxPathA: 15,
  maxPathB: 18,
  maxPathAtA: 47,
  maxPathAtB: 66,
  moves,
};

writeFileSync("/tmp/poster-entry.json", JSON.stringify(entry));
writeFileSync(
  "/tmp/poster-inject.js",
  `localStorage.setItem("quoridor-archive-v1", JSON.stringify([${JSON.stringify(entry)}])); "injected:" + ${moves.length};`,
);
console.log(`生成 ${moves.length} 手对局（甲放板 ${wallsA}、乙放板 ${wallsB}），已写 /tmp/poster-inject.js`);
