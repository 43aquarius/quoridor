/* 在线对战 socket 客户端（单例）：
 * 路径恒为 /，经网关 XTransformPort=3004 转发到 relay。
 * 会话凭证双层存储：sessionStorage（同标签页刷新）为主，
 * localStorage 兜底（误关标签页 / 手机锁屏后重开仍可回座，10 分钟内有效）。
 * 重连策略：无限次自动重连（指数退避封顶 6s），网络恢复 / 页面回前台即主动补连。
 */

"use client";

import { io, type Socket } from "socket.io-client";
import type { MovePayload, Player, TimeControl } from "@/lib/game/types";
import { normalizeTimeControl } from "@/lib/game/types";

export const RELAY_PORT = 3004;

const SESSION_KEY = "quoridor-online-session";
const BACKUP_KEY = "quoridor-online-session-backup";
const BACKUP_TTL_MS = 10 * 60_000; // 兜底身份有效期

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`/?XTransformPort=${RELAY_PORT}`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity, // 断网多久都持续尝试，网络恢复即自动回座
      reconnectionDelay: 800,
      reconnectionDelayMax: 6000,
      randomizationFactor: 0.35,
      timeout: 15000,
    });
  }
  return socket;
}

export function destroySocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export interface OnlineIdentity {
  roomCode: string;
  token: string;
  myPlayer: Player;
}

interface BackupIdentity extends OnlineIdentity {
  savedAt: number;
}

export function saveIdentity(id: OnlineIdentity) {
  const backup: BackupIdentity = { ...id, savedAt: Date.now() };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(id));
  } catch {
    /* noop */
  }
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  } catch {
    /* noop */
  }
}

export function loadIdentity(): OnlineIdentity | null {
  // 主：sessionStorage（同标签页刷新）
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const id = JSON.parse(raw) as OnlineIdentity;
      if (id?.roomCode && id?.token) return id;
    }
  } catch {
    /* noop */
  }
  // 备：localStorage（误关标签页 / 新开标签页重进），限 10 分钟内
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as BackupIdentity;
    if (!b?.roomCode || !b?.token) return null;
    if (Date.now() - (b.savedAt ?? 0) > BACKUP_TTL_MS) {
      localStorage.removeItem(BACKUP_KEY);
      return null;
    }
    return { roomCode: b.roomCode, token: b.token, myPlayer: b.myPlayer };
  } catch {
    return null;
  }
}

export function clearIdentity() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* noop */
  }
}

export interface RoomSettingsPayload {
  size: number;
  wallsPerPlayer: number;
  playerCount: 2 | 4;
  timeControl: TimeControl;
}

/* 服务器棋钟记账（重连校准用） */
export interface RoomClockPayload {
  totalMsA: number;
  totalMsB: number;
  totalMsC?: number;
  totalMsD?: number;
  turnStartAt: number;
  serverNow: number;
}

/* 席位实况（四人房）：谁在座、谁掉线、谁是编辑部 AI、谁已出局 */
export interface SeatStatus {
  player: Player;
  present: boolean;
  connected: boolean;
  isAi: boolean;
  aiLevel?: number;
  eliminated: boolean;
  gcAt: number | null;
}

export interface SeatUpdatePayload {
  roomCode: string;
  seats: SeatStatus[];
}

/* AI 代打派发：轮到 AI 席位时私发给执行者（第一位在线真人） */
export interface AiTurnPayload {
  roomCode: string;
  player: Player;
  token: string; // 该 AI 席位的行棋凭证（仅本事件携带）
  moveCount: number;
  aiLevel?: number;
  seatCount?: number;
}

/* 大厅空房条目 */
export interface LobbyRoomEntry {
  code: string;
  size: number;
  wallsPerPlayer: number;
  playerCount: 2 | 4;
  seatsTotal: number;
  seatsTaken: number;
  timeControl: TimeControl;
  createdAt: number;
  hostConnected: boolean;
}

export interface LobbyUpdatePayload {
  rooms: LobbyRoomEntry[];
  serverNow: number;
}

export interface GameTimeoutPayload {
  loser: Player;
  winner: Player | null;
  reason: "total" | "permove" | "disconnect";
  ended?: boolean;
  playerCount?: 2 | 4;
  clock?: RoomClockPayload;
}

export function normalizeSettingsPayload(raw: unknown): RoomSettingsPayload {
  const r = (raw ?? {}) as { size?: number; wallsPerPlayer?: number; playerCount?: number; timeControl?: Partial<TimeControl> };
  let size = Math.round(Number(r.size));
  if (!Number.isFinite(size)) size = 9;
  if (size % 2 === 0) size += 1;
  size = Math.min(13, Math.max(5, size));
  const playerCount: 2 | 4 = Number(r.playerCount) === 4 ? 4 : 2;
  let walls = Math.round(Number(r.wallsPerPlayer));
  if (!Number.isFinite(walls)) walls = playerCount === 4 ? 5 : 10;
  walls = Math.min(20, Math.max(0, walls));
  return { size, wallsPerPlayer: walls, playerCount, timeControl: normalizeTimeControl(r.timeControl) };
}

export interface CreateRoomRes {
  ok: boolean;
  roomCode?: string;
  player?: Player;
  token?: string;
  settings?: RoomSettingsPayload;
  seats?: SeatStatus[];
  clock?: RoomClockPayload;
  error?: string;
}

export function createRoom(
  settings: RoomSettingsPayload,
  isPublic: boolean,
  cb: (res: CreateRoomRes) => void,
) {
  getSocket().emit("create-room", { settings, isPublic }, cb);
}

export interface JoinRoomRes {
  ok: boolean;
  roomCode?: string;
  player?: Player;
  token?: string;
  moves?: Array<{ player: Player; move: MovePayload; elapsedMs?: number }>;
  settings?: RoomSettingsPayload;
  seats?: SeatStatus[];
  clock?: RoomClockPayload;
  error?: string;
}

export function joinRoom(roomCode: string, cb: (res: JoinRoomRes) => void) {
  getSocket().emit("join-room", { roomCode }, cb);
}

export interface ResumeRes {
  ok: boolean;
  roomCode?: string;
  player?: Player;
  moves?: Array<{ player: Player; move: MovePayload; elapsedMs?: number }>;
  settings?: RoomSettingsPayload;
  status?: "waiting" | "playing" | "ended";
  seats?: SeatStatus[];
  clock?: RoomClockPayload;
  peer?: {
    aConnected: boolean;
    bConnected: boolean;
    cConnected?: boolean;
    dConnected?: boolean;
    seats?: SeatStatus[];
  };
  error?: string;
}

export function resumeSession(roomCode: string, token: string, cb: (res: ResumeRes) => void) {
  getSocket().emit("resume", { roomCode, token }, cb);
}

/* 四人房等待期：房主把某座设为编辑部 AI 代打（aiLevel 0 = 恢复等棋友） */
export function setSeatAi(
  roomCode: string,
  token: string,
  seat: Player,
  aiLevel: number,
  cb: (res: { ok: boolean; seats?: SeatStatus[]; error?: string }) => void,
) {
  getSocket().emit("set-seat-ai", { roomCode, token, seat, aiLevel }, cb);
}

/* 四人房开局（房主）：四座齐备（真人或 AI）后广播开局 */
export function startFourGame(
  roomCode: string,
  token: string,
  cb: (res: { ok: boolean; aiTokens?: Record<string, string>; error?: string }) => void,
) {
  getSocket().emit("start-game", { roomCode, token }, cb);
}

export function sendMove(
  roomCode: string,
  token: string,
  payload: MovePayload,
  elapsedMs: number,
  totalMs: number,
) {
  getSocket().emit("game-move", { roomCode, token, move: payload, elapsedMs, totalMs });
}

export function sendResign(roomCode: string, token: string) {
  getSocket().emit("game-resign", { roomCode, token });
}

export function sendHeartbeat(roomCode: string, token: string) {
  getSocket().emit("heartbeat", { roomCode, token });
}

export function leaveRoom(roomCode: string, token: string) {
  getSocket().emit("leave-room", { roomCode, token });
}

/* —— 大厅：订阅 / 退订空房列表（返回退订函数） —— */

export function watchLobby(onUpdate: (payload: LobbyUpdatePayload) => void, onSnapshot?: (payload: LobbyUpdatePayload) => void) {
  const socket = getSocket();
  const handler = (payload: LobbyUpdatePayload) => onUpdate(payload);
  socket.on("lobby-update", handler);
  const cb = (res: { ok?: boolean; rooms?: LobbyRoomEntry[]; serverNow?: number }) => {
    onSnapshot?.({ rooms: res.rooms ?? [], serverNow: res.serverNow ?? Date.now() });
  };
  socket.emit("lobby-watch", cb);
  return () => {
    socket.off("lobby-update", handler);
    socket.emit("lobby-unwatch");
  };
}

export function unwatchLobby() {
  getSocket().emit("lobby-unwatch");
}

export interface PeerStatus {
  roomCode: string;
  status: "waiting" | "playing" | "ended";
  moveCount: number;
  aConnected: boolean;
  bConnected: boolean;
  cConnected?: boolean;
  dConnected?: boolean;
  seats?: SeatStatus[];
  disconnectGcAt: number | null;
}

export interface RoomExpiredPayload {
  loser: Player;
  winner: Player;
}

export interface OpponentResignPayload {
  player: Player;
  ended?: boolean;
  playerCount?: 2 | 4;
}

export interface GameStartPayload {
  moves?: Array<{ player: Player; move: MovePayload; elapsedMs?: number }>;
  settings?: RoomSettingsPayload;
  clock?: RoomClockPayload;
  seats?: SeatStatus[];
  playerCount?: 2 | 4;
}
