/* 棋谱档案馆：localStorage 持久化的历史对局全宗 */

import type { AiLevel, GameMode, Move, Player } from "./types";
import { WALLS_PER_PLAYER } from "./types";

export interface ArchiveEntry {
  id: string;
  date: number;
  mode: GameMode;
  aiLevel?: AiLevel;
  labelA: string;
  labelB: string;
  winner: Player | null;
  winReason: "goal" | "resign" | null;
  moveCount: number;
  durationMs: number;
  wallsUsedA: number;
  wallsUsedB: number;
  maxPathA: number; // 甲在局中被逼出的最远归途（最短路径长度的峰值）
  maxPathB: number;
  maxPathAtA?: number; // 出现峰值时的手数
  maxPathAtB?: number;
  earliestWallOut?: { player: Player; moveN: number };
  moves: Move[];
}

const KEY = "quoridor-archive-v1";

export function loadArchive(): ArchiveEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ArchiveEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveArchive(entries: ArchiveEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 60)));
  } catch {
    /* 存储满：忽略 */
  }
}

export function newEntryId(): string {
  return `Q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

/* 数据小注：为档案馆的 spread 生成一条条冷知识 */
export function entryFootnotes(e: ArchiveEntry): string[] {
  const notes: string[] = [];
  const straight = 8; // 起点到对岸的直线步数
  if (e.maxPathA > straight + 3 || e.maxPathB > straight + 3) {
    const worst = e.maxPathA >= e.maxPathB ? "甲" : "乙";
    const worstPath = Math.max(e.maxPathA, e.maxPathB);
    const at = worst === "甲" ? e.maxPathAtA : e.maxPathAtB;
    notes.push(
      `最长的一次绕路：${worst}方归途一度被拉长到 ${worstPath} 步（直线仅 ${straight} 步${at ? `，第 ${at} 手时为甚` : ""}）。`,
    );
  }
  if (e.earliestWallOut) {
    const who = e.earliestWallOut.player === "A" ? "甲" : "乙";
    notes.push(`最早耗尽挡板：${who}方于第 ${e.earliestWallOut.moveN} 手打完最后一根铅条。`);
  }
  const wallMoves = e.moves.filter((m) => m.payload.type === "wall").length;
  notes.push(
    `全局 ${e.moveCount} 手：行棋 ${e.moveCount - wallMoves} 手，放板 ${wallMoves} 手；挡板存量合计 ${WALLS_PER_PLAYER * 2 - wallMoves} 根未用。`,
  );
  const avg = e.moveCount > 0 ? Math.round(e.durationMs / e.moveCount / 100) / 10 : 0;
  notes.push(`平均每手 ${avg} 秒，全局用时 ${Math.round(e.durationMs / 1000)} 秒。`);
  return notes;
}
