/* 棋谱档案馆：localStorage 持久化的历史对局全宗 */

import type { AiLevel, GameMode, Move, Player } from "./types";

export interface ArchiveEntry {
  id: string;
  date: number;
  mode: GameMode;
  aiLevel?: AiLevel;
  playerCount?: 2 | 4; // 席位数（旧卷宗缺省 2）
  labelA: string;
  labelB: string;
  labelC?: string; // 四人局：丙
  labelD?: string; // 四人局：丁
  winner: Player | null;
  winReason: "goal" | "resign" | "timeout" | "last" | null;
  moveCount: number;
  durationMs: number;
  size?: number; // 棋盘路数（旧卷宗缺省 9）
  wallsPerPlayer?: number; // 每方挡板数（旧卷宗缺省 10）
  wallsUsedA: number;
  wallsUsedB: number;
  wallsUsedC?: number; // 四人局：丙用板
  wallsUsedD?: number; // 四人局：丁用板
  maxPathA: number; // 甲在局中被逼出的最远归途（最短路径长度的峰值）
  maxPathB: number;
  maxPathC?: number;
  maxPathD?: number;
  maxPathAtA?: number; // 出现峰值时的手数
  maxPathAtB?: number;
  maxPathAtC?: number;
  maxPathAtD?: number;
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
  const size = e.size ?? 9;
  const wallsPer = e.wallsPerPlayer ?? 10;
  const seats = e.playerCount === 4 ? 4 : 2;
  const straight = size - 1; // 起点到对岸的直线步数
  const pathPairs: Array<[string, number, number | undefined]> = [
    ["甲", e.maxPathA, e.maxPathAtA],
    ["乙", e.maxPathB, e.maxPathAtB],
  ];
  if (seats === 4) {
    pathPairs.push(["丙", e.maxPathC ?? 0, e.maxPathAtC]);
    pathPairs.push(["丁", e.maxPathD ?? 0, e.maxPathAtD]);
  }
  const worst = pathPairs.reduce((a, b) => (b[1] > a[1] ? b : a), pathPairs[0]);
  if (worst[1] > straight + 3) {
    notes.push(
      `最长的一次绕路：${worst[0]}方归途一度被拉长到 ${worst[1]} 步（直线仅 ${straight} 步${worst[2] ? `，第 ${worst[2]} 手时为甚` : ""}）。`,
    );
  }
  if (e.earliestWallOut) {
    const who = e.earliestWallOut.player === "A" ? "甲" : e.earliestWallOut.player === "B" ? "乙" : e.earliestWallOut.player === "C" ? "丙" : "丁";
    notes.push(`最早耗尽挡板：${who}方于第 ${e.earliestWallOut.moveN} 手打完最后一根铅条。`);
  }
  const wallMoves = e.moves.filter((m) => m.payload.type === "wall").length;
  notes.push(
    `开本 ${size}×${size}、每方 ${wallsPer} 板${seats === 4 ? "、四人围坐" : ""}；全局 ${e.moveCount} 手：行棋 ${e.moveCount - wallMoves} 手，放板 ${wallMoves} 手，挡板存量合计 ${Math.max(0, wallsPer * seats - wallMoves)} 根未用。`,
  );
  const avg = e.moveCount > 0 ? Math.round(e.durationMs / e.moveCount / 100) / 10 : 0;
  notes.push(`平均每手 ${avg} 秒，全局用时 ${Math.round(e.durationMs / 1000)} 秒。`);
  return notes;
}
