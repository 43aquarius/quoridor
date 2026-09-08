/* 棋谱海报：把一局对弈排成可收藏的印刷版画（Canvas → PNG）
 * 构图：题头「棋谱」+ 中央棋盘版画（路径叠印 + 步数墨迹 + 铅条挡板）
 * + 下方着法长诗（双色分栏）+ 版记（版次 / 套印色 / 字体 / 纸色）。
 */

"use client";

import type { ArchiveEntry } from "@/lib/game/archive";
import type { Skin, Vec, Wall } from "./types";
import { cellName } from "./types";

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
  const colorOf = (p: "A" | "B") => (p === "A" ? skin.a : skin.b);

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
    entry.mode === "ai" ? `单人对弈 · ${entry.labelB}` : entry.mode === "local" ? "双人同屏" : "在线对战";
  ctx.textAlign = "right";
  ctx.font = `400 30px ${mono}`;
  const metaLines = [
    `NO. ${entry.id}`,
    `DATE ${dateStr}`,
    modeStr,
    `${entry.labelA} ✕ ${entry.labelB}`,
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
  const BS = 1000; // 9 格 × ~111
  const cell = BS / 9;

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
  for (let i = 1; i < 9; i++) {
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
  ctx.font = `400 24px ${mono}`;
  for (let i = 0; i < 9; i++) {
    ctx.fillText("abcdefghi"[i], BX + i * cell + cell / 2 - 8, BY + BS + 34);
    ctx.fillText(String(9 - i), BX - 30, BY + i * cell + cell / 2 + 8);
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
  const TH = 15;
  for (const m of entry.moves) {
    if (m.payload.type !== "wall") continue;
    const w = m.payload.wall as Wall;
    const color = colorOf(w.by);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    // 错位阴影
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.4;
    if (w.o === "h") roundRect(ctx, BX + w.x * cell + 7 + 3, BY + (w.y + 1) * cell - TH / 2 + 3, 2 * cell - 14, TH, TH / 2);
    else roundRect(ctx, BX + (w.x + 1) * cell - TH / 2 + 3, BY + w.y * cell + 7 + 3, TH, 2 * cell - 14, TH / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = color;
    if (w.o === "h") roundRect(ctx, BX + w.x * cell + 7, BY + (w.y + 1) * cell - TH / 2, 2 * cell - 14, TH, TH / 2);
    else roundRect(ctx, BX + (w.x + 1) * cell - TH / 2, BY + w.y * cell + 7, TH, 2 * cell - 14, TH / 2);
    ctx.fill();
  }

  // 终局棋子（若记录到最终位置，则画在最后一步的 to 上）
  const lastA = [...entry.moves].reverse().find((m) => m.player === "A" && m.payload.type === "pawn");
  const lastB = [...entry.moves].reverse().find((m) => m.player === "B" && m.payload.type === "pawn");
  const drawPawn = (pos: Vec | undefined, player: "A" | "B") => {
    if (!pos) return;
    const cx = BX + pos.x * cell + cell / 2;
    const cy = BY + pos.y * cell + cell / 2;
    const color = colorOf(player);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + 4, cy + 4, 33, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 33, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = `900 38px ${serif}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(player === "A" ? "甲" : "乙", cx, cy + 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  };
  drawPawn(lastA?.payload.type === "pawn" ? lastA.payload.to : undefined, "A");
  drawPawn(lastB?.payload.type === "pawn" ? lastB.payload.to : undefined, "B");

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
  const winnerStr =
    entry.winner === "A" ? `${entry.labelA} 胜` : entry.winner === "B" ? `${entry.labelB} 胜` : "未分胜负";
  const reasonStr = entry.winReason === "resign" ? "（认输）" : entry.winReason === "goal" ? "（抵达底线）" : "";
  ctx.fillText(`${winnerStr}${reasonStr} · ${entry.moveCount} 手 · 挡板 ${entry.wallsUsedA}✕${entry.wallsUsedB}`, 156, footerY - 14);
  ctx.font = `400 22px ${mono}`;
  ctx.fillText(
    `步步为营 QUORIDOR · 双色 RISOGRAPH 套印 ${skin.label} · 纸色 草浆纸白 № F5F2EA`,
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

export function cellLabel(v: Vec): string {
  return cellName(v);
}
