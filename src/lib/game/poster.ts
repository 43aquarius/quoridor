/* 棋谱海报：把一局对弈排成可收藏的印刷版画（Canvas → PNG）
 * 构图：题头「棋谱」+ 中央棋盘版画（路径叠印 + 步数墨迹 + 铅条挡板）
 * + 下方着法长诗（双色分栏）+ 版记（版次 / 套印色 / 字体 / 纸色）。
 */

"use client";

import type { ArchiveEntry } from "@/lib/game/archive";
import type { Player, Skin, Vec, Wall } from "./types";
import { PLAYER4_COLORS, PLAYER_CN, colLetter } from "./types";

const W = 1440;
const H = 2040;

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

async function ensureFonts(families: string[]) {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all(
      families.map((f) =>
        document.fonts.load(`700 40px ${f}`, "棋谱步步为营甲乙胜0123456789"),
      ),
    );
    await document.fonts.ready;
  } catch {
    /* 字体加载失败则回退系统字 */
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function speckle(ctx: CanvasRenderingContext2D, count: number) {
  ctx.save();
  ctx.fillStyle = "#1A1A1A";
  ctx.globalAlpha = 0.045;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 1.6 + 0.4;
    ctx.fillRect(x, y, r, r);
  }
  ctx.restore();
}

export async function generatePosterPng(entry: ArchiveEntry, skin: Skin): Promise<Blob | null> {
  const serif = cssVar("--font-noto-serif-sc", "'Noto Serif SC', serif");
  const mono = cssVar("--font-plex-mono", "'IBM Plex Mono', monospace");
  await ensureFonts([serif, mono]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const INK = "#1A1A1A";
  const PAPER = "#F5F2EA";
  const four = entry.playerCount === 4;
  const colorOf = (p: Player) =>
    four ? (PLAYER4_COLORS[p] as string) : p === "A" ? skin.a : skin.b;
  const N = Math.max(5, Math.min(13, entry.size ?? 9)); // 开本路数

  /* 纸底 + 颗粒 */
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, 2600);

  /* 版框：双线 */
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(84, 84, W - 168, H - 168);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(100, 100, W - 200, H - 200);

  /* —— 题头 —— */
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 190px ${serif}`;
  ctx.fillText("棋　谱", 150, 330);
  ctx.font = `400 34px ${mono}`;
  ctx.fillStyle = INK;
  ctx.fillText("A GAME OF QUORIOR · RECORD OF PLAY", 156, 384);

  const date = new Date(entry.date);
  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  const modeStr =
    entry.mode === "ai" ? `单人对弈 · ${entry.labelB}` : entry.mode === "local" ? (four ? "四人围坐" : "双人同屏") : four ? "在线四人围桌" : "在线对战";
  ctx.textAlign = "right";
  ctx.font = `400 30px ${mono}`;
  const seatLine = four
    ? `${entry.labelA} ✕ ${entry.labelB} ✕ ${entry.labelC ?? "丙"} ✕ ${entry.labelD ?? "丁"}`
    : `${entry.labelA} ✕ ${entry.labelB}`;
  const metaLines = [
    `NO. ${entry.id}`,
    `DATE ${dateStr}`,
    modeStr,
    seatLine,
    `BOARD ${N}×${N} · ${entry.wallsPerPlayer ?? (four ? 5 : 10)} WALLS${four ? " ×4" : ""}`,
    `${entry.moveCount} MOVES`,
  ];
  metaLines.forEach((t, i) => {
    ctx.fillText(t, W - 150, 190 + i * 46);
  });
  ctx.textAlign = "left";

  /* 题头与棋盘之间的界线 */
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(150, 440);
  ctx.lineTo(W - 150, 440);
  ctx.stroke();

  /* —— 棋盘版画 —— */
  const BX = 220;
  const BY = 520;
  const BS = 1000; // 版面固定边长，格距随开本缩放
  const cell = BS / N;
  const wallInset = Math.max(5, cell * 0.07);
  const wallLen = 2 * cell - 2 * wallInset;

  // 套印错位阴影棋盘框
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = colorOf("A");
  ctx.lineWidth = 2.5;
  ctx.strokeRect(BX + 4, BY + 4, BS, BS);
  ctx.restore();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(BX, BY, BS, BS);
  ctx.lineWidth = 1.1;
  for (let i = 1; i < N; i++) {
    ctx.beginPath();
    ctx.moveTo(BX + i * cell, BY);
    ctx.lineTo(BX + i * cell, BY + BS);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(BX, BY + i * cell);
    ctx.lineTo(BX + BS, BY + i * cell);
    ctx.stroke();
  }

  // 坐标
  ctx.fillStyle = INK;
  ctx.font = `400 ${N > 11 ? 20 : 24}px ${mono}`;
  for (let i = 0; i < N; i++) {
    ctx.fillText(colLetter(i, N), BX + i * cell + cell / 2 - 8, BY + BS + 34);
    ctx.fillText(String(N - i), BX - 30, BY + i * cell + cell / 2 + 8);
  }

  // 行走路径叠印
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.lineCap = "round";
  const numberAt = new Map<string, number>();
  for (const m of entry.moves) {
    if (m.payload.type !== "pawn") continue;
    const { from, to } = m.payload;
    ctx.strokeStyle = colorOf(m.player);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(BX + from.x * cell + cell / 2, BY + from.y * cell + cell / 2);
    ctx.lineTo(BX + to.x * cell + cell / 2, BY + to.y * cell + cell / 2);
    ctx.stroke();
    numberAt.set(`${to.x},${to.y}`, m.n);
  }
  ctx.restore();

  // 步数墨迹
  ctx.fillStyle = INK;
  ctx.font = `400 22px ${mono}`;
  ctx.globalAlpha = 0.4;
  for (const [k, n] of numberAt) {
    const [x, y] = k.split(",").map(Number);
    ctx.fillText(String(n), BX + x * cell + 10, BY + y * cell + 30);
  }
  ctx.globalAlpha = 1;

  // 挡板铅条
  const TH = Math.max(10, Math.min(15, cell * 0.14));
  for (const m of entry.moves) {
    if (m.payload.type !== "wall") continue;
    const w = m.payload.wall as Wall;
    const color = colorOf(w.by);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    // 错位阴影
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.4;
    if (w.o === "h") roundRect(ctx, BX + w.x * cell + wallInset + 3, BY + (w.y + 1) * cell - TH / 2 + 3, wallLen, TH, TH / 2);
    else roundRect(ctx, BX + (w.x + 1) * cell - TH / 2 + 3, BY + w.y * cell + wallInset + 3, TH, wallLen, TH / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = color;
    if (w.o === "h") roundRect(ctx, BX + w.x * cell + wallInset, BY + (w.y + 1) * cell - TH / 2, wallLen, TH, TH / 2);
    else roundRect(ctx, BX + (w.x + 1) * cell - TH / 2, BY + w.y * cell + wallInset, TH, wallLen, TH / 2);
    ctx.fill();
  }

  // 终局棋子（若记录到最终位置，则画在最后一步的 to 上；四人局四席）
  const lastOf = (p: Player) => [...entry.moves].reverse().find((m) => m.player === p && m.payload.type === "pawn");
  const lastA = lastOf("A");
  const lastB = lastOf("B");
  const lastC = four ? lastOf("C") : undefined;
  const lastD = four ? lastOf("D") : undefined;
  const pawnR = Math.max(22, Math.min(33, cell * 0.3));
  const pawnFont = Math.max(24, Math.min(38, cell * 0.34));
  const drawPawn = (pos: Vec | undefined, player: Player) => {
    if (!pos) return;
    const cx = BX + pos.x * cell + cell / 2;
    const cy = BY + pos.y * cell + cell / 2;
    const color = colorOf(player);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + 4, cy + 4, pawnR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, pawnR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = `900 ${pawnFont}px ${serif}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(PLAYER_CN[player], cx, cy + 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  };
  drawPawn(lastA?.payload.type === "pawn" ? lastA.payload.to : undefined, "A");
  drawPawn(lastB?.payload.type === "pawn" ? lastB.payload.to : undefined, "B");
  if (four) {
    drawPawn(lastC?.payload.type === "pawn" ? lastC.payload.to : undefined, "C");
    drawPawn(lastD?.payload.type === "pawn" ? lastD.payload.to : undefined, "D");
  }

  /* —— 着法长诗 —— */
  const poemTop = BY + BS + 120;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(150, poemTop - 60);
  ctx.lineTo(W - 150, poemTop - 60);
  ctx.stroke();

  const entries = entry.moves.map((m) => ({
    n: m.n,
    player: m.player,
    text: m.notation,
  }));
  const colW = (W - 300) / 2;
  const rowsPerCol = 13;
  const totalRows = Math.ceil(entries.length / 2);
  const rowH = totalRows > rowsPerCol ? Math.min(52, 760 / Math.max(1, totalRows)) : 52;
  const fontSize = rowH < 40 ? 22 : 26;

  ctx.font = `700 ${fontSize + 6}px ${serif}`;
  entries.forEach((e, i) => {
    const col = Math.floor(i / Math.max(1, Math.ceil(entries.length / 2)));
    const row = i % Math.max(1, Math.ceil(entries.length / 2));
    const x = 156 + col * (colW + 20);
    const y = poemTop + 40 + row * rowH;
    // 序号
    ctx.fillStyle = INK;
    ctx.font = `700 ${fontSize + 4}px ${serif}`;
    ctx.fillText(String(e.n).padStart(2, "0"), x, y);
    // 记谱
    ctx.fillStyle = colorOf(e.player);
    ctx.font = `500 ${fontSize}px ${mono}`;
    ctx.fillText(e.text, x + 56, y);
  });

  /* —— 版记 —— */
  const footerY = H - 150;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(150, footerY - 56);
  ctx.lineTo(W - 150, footerY - 56);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = `400 26px ${serif}`;
  const labelOfWinner =
    entry.winner === "A" ? entry.labelA : entry.winner === "B" ? entry.labelB : entry.winner === "C" ? (entry.labelC ?? "丙") : entry.winner === "D" ? (entry.labelD ?? "丁") : "";
  const winnerStr = entry.winner ? `${labelOfWinner} 胜` : "未分胜负";
  const reasonStr =
    entry.winReason === "resign"
      ? four
        ? "（众席认输 · 末位）"
        : "（认输）"
      : entry.winReason === "timeout"
        ? four
          ? "（众席超时出局 · 末位）"
          : "（超时判负）"
        : entry.winReason === "last"
          ? "（众席出局 · 末位）"
          : entry.winReason === "goal"
            ? "（抵达底线）"
            : "";
  const wallLine = four
    ? `甲 ${entry.wallsUsedA} / 乙 ${entry.wallsUsedB} / 丙 ${entry.wallsUsedC ?? 0} / 丁 ${entry.wallsUsedD ?? 0}`
    : `甲 ${entry.wallsUsedA} / 乙 ${entry.wallsUsedB}`;
  ctx.fillText(
    `${winnerStr}${reasonStr} · ${entry.moveCount} 手 · 开本 ${N}×${N} · 挡板 ${wallLine}`,
    156,
    footerY - 14,
  );
  ctx.font = `400 22px ${mono}`;
  ctx.fillText(
    `步步为营 QUORIDOR · ${four ? "四色" : "双色"} RISOGRAPH 套印 ${four ? "红·蓝·苔绿·墨黑" : skin.label} · 纸色 草浆纸白 № F5F2EA`,
    156,
    footerY + 22,
  );
  ctx.textAlign = "right";
  ctx.fillText(`限量印刷 · 棋谱档案馆 第 ${entry.id} 号`, W - 156, footerY + 22);
  ctx.textAlign = "left";

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 0.96);
  });
}

export function posterFileName(entry: ArchiveEntry): string {
  const d = new Date(entry.date);
  return `quoridor-poster-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${entry.id}.png`;
}
