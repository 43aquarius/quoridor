/* 在线对战 socket 客户端（单例）：
 * 路径恒为 /，经网关 XTransformPort=3004 转发到 relay。
 * 会话凭证存 sessionStorage（同标签页刷新可 5 分钟内重连，跨标签页互不干扰）。
 */

"use client";

import { io, type Socket } from "socket.io-client";
import type { MovePayload, Player } from "@/lib/game/types";

export const RELAY_PORT = 3004;

const SESSION_KEY = "quoridor-online-session";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`/?XTransformPort=${RELAY_PORT}`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 900,
      reconnectionDelayMax: 4000,
      timeout: 12000,
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

export function saveIdentity(id: OnlineIdentity) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(id));
  } catch {
    /* noop */
  }
}

export function loadIdentity(): OnlineIdentity | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OnlineIdentity;
  } catch {
    return null;
  }
}

export function clearIdentity() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

export interface CreateRoomRes {
  ok: boolean;
  roomCode?: string;
  player?: Player;
  token?: string;
  error?: string;
}

export function createRoom(cb: (res: CreateRoomRes) => void) {
  getSocket().emit("create-room", cb);
}

export interface JoinRoomRes {
  ok: boolean;
  roomCode?: string;
  player?: Player;
  token?: string;
  moves?: Array<{ player: Player; move: MovePayload; elapsedMs?: number }>;
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
  status?: "waiting" | "playing" | "ended";
  error?: string;
}

export function resumeSession(roomCode: string, token: string, cb: (res: ResumeRes) => void) {
  getSocket().emit("resume", { roomCode, token }, cb);
}

export function sendMove(roomCode: string, token: string, payload: MovePayload, elapsedMs: number) {
  getSocket().emit("game-move", { roomCode, token, move: payload, elapsedMs });
}

export function sendResign(roomCode: string, token: string) {
  getSocket().emit("game-resign", { roomCode, token });
}

export function leaveRoom(roomCode: string, token: string) {
  getSocket().emit("leave-room", { roomCode, token });
}

export interface PeerStatus {
  roomCode: string;
  status: "waiting" | "playing" | "ended";
  moveCount: number;
  aConnected: boolean;
  bConnected: boolean;
  disconnectGcAt: number | null;
}
