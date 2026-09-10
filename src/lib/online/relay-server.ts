/* 在线对战 relay —— 嵌入 Next.js 服务端（经 instrumentation 钩子启动）。
 * 职责极轻：房间管理（4 位房间码）+ 版式/棋钟规格存转 + 消息转发 + 断线 5 分钟状态保留。
 * 规则校验由双端各自完成；服务端仅做粗粒度回合校验与顺序记录。
 * 断线重连：会话凭证（token）长期有效；socket 断开仅标记离线并开 5 分钟保留窗，
 * 期间凭码回座即恢复原座。
 *
 * v4 —— 四人围坐房：
 *   create-room 携带 settings.playerCount（2 | 4）；四人房设 A(房主)/B/C/D 四座。
 *   等待期房主可 set-seat-ai 把任一空座设为编辑部 AI（学徒..社长）代打；
 *   start-game（房主）：四座须「真人入座或 AI 代打」齐备方可开局；
 *   AI 席位由 relay 生成专用 aiToken，并按「顺时针行棋 + 着法重放」推导轮到谁，
 *   把 ai-turn 事件私发给第一位在线真人（AI 执行者），由其代为计算并上着。
 *   四人局认输/超时/离席逾时为「出局」而非判负终局：广播 game-timeout/opponent-resign，
 *   各端本地重放出局着法；仅存一席时终局。
 * 棋钟（v3，保留）：行棋方每手上报累计用时，服务器记账并周期裁决超时。
 * 大厅（v3，保留）：公开空房列表，房间创建/入座/关房/清扫均广播 lobby-update。
 * 二人房行为与 v3 完全兼容（join 即开局、离席逾时判负、room-expired）。
 */

import { createServer, type Server as HttpServer } from "http";
import { Server } from "socket.io";

const RELAY_PORT = 3004;

/* 断线保留窗（四人局为出局时限；二人局为判负时限） */
const RECONNECT_GRACE_MS = 5 * 60_000;
/* 本地身份兜底有效期（与保留窗对齐，另加 5 分钟宽限） */
export const IDENTITY_TTL_MS = RECONNECT_GRACE_MS + 5 * 60_000;

export type Seat = "A" | "B" | "C" | "D";
type RoomSeat = "A" | "B";

/* 四人局顺时针行棋次序（南→西→北→东） */
const SEAT_ORDER_4: Seat[] = ["A", "C", "B", "D"];

export interface RoomSettings {
  size: number;
  wallsPerPlayer: number;
  playerCount: 2 | 4;
  timeControl: { totalSec: number; perMoveSec: number };
}

/* 服务端规格清洗：奇数 5..13 / 挡板 0..20 / 席位 2|4 / 棋钟 0..上限 */
function normalizeSettings(raw: unknown): RoomSettings {
  const r = (raw ?? {}) as {
    size?: unknown;
    wallsPerPlayer?: unknown;
    playerCount?: unknown;
    timeControl?: { totalSec?: unknown; perMoveSec?: unknown };
  };
  let size = Math.round(Number(r.size));
  if (!Number.isFinite(size)) size = 9;
  if (size % 2 === 0) size += 1;
  size = Math.min(13, Math.max(5, size));
  let walls = Math.round(Number(r.wallsPerPlayer));
  if (!Number.isFinite(walls)) walls = 10;
  walls = Math.min(20, Math.max(0, walls));
  const playerCount: 2 | 4 = Number(r.playerCount) === 4 ? 4 : 2;
  if (!Number.isFinite(Math.round(Number(r.wallsPerPlayer)))) {
    walls = playerCount === 4 ? (size === 9 ? 5 : size === 5 ? 3 : size === 7 ? 4 : size === 11 ? 6 : 7) : size === 9 ? 10 : size === 5 ? 5 : size === 7 ? 8 : size === 11 ? 12 : 14;
  }
  const clampTime = (v: unknown, max: number): number => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(max, n);
  };
  const timeControl = {
    totalSec: clampTime(r.timeControl?.totalSec, 7200),
    perMoveSec: clampTime(r.timeControl?.perMoveSec, 3600),
  };
  return { size, wallsPerPlayer: walls, playerCount, timeControl };
}

interface Slot {
  token: string;
  socketId: string | null;
  connected: boolean;
  since: number;
  gcAt?: number | null; // 四人局：该座离席出局时刻（断线保留窗到期）
}

/* 服务器记账的棋钟：totalMs 为行棋方自报的累计用时（毫秒） */
interface RoomClock {
  totalMsA: number;
  totalMsB: number;
  totalMsC?: number;
  totalMsD?: number;
  turnStartAt: number; // 服务器时间戳：当前回合开始
}

interface Room {
  code: string;
  players: { A?: Slot; B?: Slot; C?: Slot; D?: Slot };
  aiSeats: Partial<Record<Seat, number>>; // 等待期房主设置：AI 档位（1..4）
  aiTokens: Partial<Record<Seat, string>>; // 开局时生成的 AI 席位凭证（仅回传房主）
  settings: RoomSettings;
  moves: Array<{ player: Seat; move: unknown; elapsedMs?: number }>;
  status: "waiting" | "playing" | "ended";
  isPublic: boolean;
  createdAt: number;
  clock: RoomClock;
  lastActivity: number;
  disconnectGcAt: number | null; // 二人局：判负窗；四人局用 per-slot gcAt
  loserOnGc: RoomSeat | null; // 二人局专用
  lastAiDispatch: { player: Seat; moveCount: number; socketId: string; at: number } | null;
}

const rooms = new Map<string, Room>();
let started = false;

export interface SeatStatusPayload {
  player: Seat;
  present: boolean; // 真人已入座
  connected: boolean;
  isAi: boolean;
  aiLevel?: number;
  eliminated: boolean;
  gcAt: number | null;
}

export interface PeerStatusPayload {
  roomCode: string;
  status: "waiting" | "playing" | "ended";
  moveCount: number;
  aConnected: boolean;
  bConnected: boolean;
  cConnected?: boolean;
  dConnected?: boolean;
  seats: SeatStatusPayload[];
  disconnectGcAt: number | null;
}

function seatOrder(r: Room): Seat[] {
  return r.settings.playerCount === 4 ? SEAT_ORDER_4 : ["A", "B"];
}

/* 由着法记录推导出局名单（resign / timeout 着即出局着） */
function eliminatedOf(r: Room): Set<Seat> {
  const out = new Set<Seat>();
  for (const m of r.moves) {
    const type = (m.move as { type?: string } | null)?.type;
    if (type === "resign" || type === "timeout") out.add(m.player);
  }
  return out;
}

/* 由着法记录重放行棋顺位（含出局跳席；非回合认输不改变当前轮次） */
function expectedTurnOf(r: Room): Seat {
  const order = seatOrder(r);
  const elim = new Set<Seat>();
  let cur: Seat = "A";
  for (const m of r.moves) {
    const type = (m.move as { type?: string } | null)?.type;
    const isForfeit = type === "resign" || type === "timeout";
    if (isForfeit) {
      elim.add(m.player);
      if (m.player === cur) {
        cur = nextAfter(order, elim, m.player);
      }
      /* 非回合认输/出局：当前轮次不变（与引擎 applyForfeit 语义一致） */
    } else {
      cur = nextAfter(order, elim, m.player);
    }
  }
  return cur;
}

function nextAfter(order: Seat[], elim: Set<Seat>, from: Seat): Seat {
  const i = order.indexOf(from);
  if (i < 0) return order.find((s) => !elim.has(s)) ?? from;
  for (let k = 1; k <= order.length; k++) {
    const cand = order[(i + k) % order.length];
    if (!elim.has(cand)) return cand;
  }
  return from;
}

function isAiSeat(r: Room, s: Seat): boolean {
  return !!r.aiSeats[s];
}

function totalMsOf(r: Room, s: Seat): number {
  if (s === "A") return r.clock.totalMsA;
  if (s === "B") return r.clock.totalMsB;
  if (s === "C") return r.clock.totalMsC ?? 0;
  return r.clock.totalMsD ?? 0;
}

function setTotalMs(r: Room, s: Seat, v: number) {
  if (s === "A") r.clock.totalMsA = v;
  else if (s === "B") r.clock.totalMsB = v;
  else if (s === "C") r.clock.totalMsC = v;
  else r.clock.totalMsD = v;
}

function peerStatus(r: Room): PeerStatusPayload {
  const elim = eliminatedOf(r);
  const four = r.settings.playerCount === 4;
  const seats: SeatStatusPayload[] = seatOrder(r).map((s) => {
    const slot = r.players[s];
    const isAi = isAiSeat(r, s);
    return {
      player: s,
      present: !!slot,
      connected: !!slot?.connected,
      isAi,
      aiLevel: isAi ? r.aiSeats[s] : undefined,
      eliminated: elim.has(s),
      gcAt: slot?.gcAt ?? null,
    };
  });
  return {
    roomCode: r.code,
    status: r.status,
    moveCount: r.moves.length,
    aConnected: !!r.players.A?.connected,
    bConnected: !!r.players.B?.connected,
    cConnected: four ? !!r.players.C?.connected : undefined,
    dConnected: four ? !!r.players.D?.connected : undefined,
    seats,
    disconnectGcAt: four ? null : r.disconnectGcAt,
  };
}

/* —— AI 执行者派发：轮到 AI 席位时，私发给第一位在线真人 —— */
function dispatchAiTurn(r: Room) {
  if (r.status !== "playing") return;
  const turn = expectedTurnOf(r);
  if (!isAiSeat(r, turn)) return;
  const token = r.aiTokens[turn];
  if (!token) return;
  const order = seatOrder(r);
  let executor: Slot | null = null;
  for (const s of order) {
    const slot = r.players[s];
    if (slot?.connected) {
      executor = slot;
      break;
    }
  }
  if (!executor || !executor.socketId) return;
  const now = Date.now();
  if (
    r.lastAiDispatch &&
    r.lastAiDispatch.player === turn &&
    r.lastAiDispatch.moveCount === r.moves.length &&
    r.lastAiDispatch.socketId === executor.socketId &&
    now - r.lastAiDispatch.at < 3000
  ) {
    return; // 同一席位同一手数 3 秒内不重复派发
  }
  r.lastAiDispatch = { player: turn, moveCount: r.moves.length, socketId: executor.socketId, at: now };
  io?.to(executor.socketId).emit("ai-turn", {
    roomCode: r.code,
    player: turn,
    token,
    moveCount: r.moves.length,
    aiLevel: r.aiSeats[turn],
    seatCount: r.settings.playerCount,
  });
}

/* ============ 大厅 ============ */

export interface LobbyRoomEntry {
  code: string;
  size: number;
  wallsPerPlayer: number;
  playerCount: 2 | 4;
  seatsTotal: number;
  seatsTaken: number; // 真人已入座数
  timeControl: { totalSec: number; perMoveSec: number };
  createdAt: number;
  hostConnected: boolean;
}

const LOBBY_ROOM = "quoridor-lobby";

/* 大厅列表：公开 + 等待对手 + 房主在线 */
function lobbyList(): LobbyRoomEntry[] {
  const out: LobbyRoomEntry[] = [];
  for (const r of rooms.values()) {
    if (r.status !== "waiting") continue;
    if (!r.isPublic) continue;
    const four = r.settings.playerCount === 4;
    const seatsTotal = four ? 4 : 2;
    let seatsTaken = 0;
    for (const s of seatOrder(r)) {
      if (r.players[s]) seatsTaken++;
    }
    if (four) {
      // 四人房：所有非 AI 座都被真人占满即视为「满员等待开局」下架
      let openHumanSeat = false;
      for (const s of ["B", "C", "D"] as Seat[]) {
        if (!r.players[s] && !isAiSeat(r, s)) openHumanSeat = true;
      }
      if (!openHumanSeat) continue;
    } else {
      if (!r.players.A || r.players.B) continue;
    }
    out.push({
      code: r.code,
      size: r.settings.size,
      wallsPerPlayer: r.settings.wallsPerPlayer,
      playerCount: r.settings.playerCount,
      seatsTotal,
      seatsTaken,
      timeControl: r.settings.timeControl,
      createdAt: r.createdAt,
      hostConnected: !!r.players.A?.connected,
    });
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

function broadcastLobby() {
  io?.to(LOBBY_ROOM).emit("lobby-update", { rooms: lobbyList(), serverNow: Date.now() });
}

/* ============ 四人局裁决 ============ */

/* 出局后若轮次变更则重置回合计时（四人局） */
function resetClockOnTurnChange(r: Room, turnBefore: Seat) {
  const turnAfter = expectedTurnOf(r);
  if (turnAfter !== turnBefore) {
    r.clock.turnStartAt = Date.now();
  }
}

/* 四人局出局（超时/离席逾时）：记录着法、广播、必要时终局 */
function eliminateSeat(r: Room, seat: Seat, reason: "total" | "permove" | "disconnect") {
  if (r.status !== "playing") return;
  if (eliminatedOf(r).has(seat)) return;
  const turnBefore = expectedTurnOf(r);
  r.moves.push({ player: seat, move: { type: "timeout" }, elapsedMs: 0 });
  r.lastActivity = Date.now();
  resetClockOnTurnChange(r, turnBefore);
  const active = seatOrder(r).filter((s) => !eliminatedOf(r).has(s));
  const ended = active.length <= 1;
  const winner = ended ? (active[0] ?? null) : null;
  if (ended) r.status = "ended";
  if (r.players[seat]) {
    r.players[seat]!.gcAt = null;
  }
  io?.to(r.code).emit("game-timeout", {
    loser: seat,
    winner,
    reason,
    ended,
    playerCount: r.settings.playerCount,
    clock: { ...r.clock, serverNow: Date.now() },
  });
  io?.to(r.code).emit("peer-status", peerStatus(r));
  if (ended) broadcastLobby();
  else dispatchAiTurn(r);
}

/* ============ 清扫 ============ */

/* 关房通知 + 清扫。返回 true 表示已删除。 */
function sweepRoom(code: string, r: Room): boolean {
  const now = Date.now();
  let removed = false;
  if (r.status === "waiting" && now - r.lastActivity > 10 * 60_000) {
    rooms.delete(code);
    removed = true;
  }
  if (!removed && r.status === "playing" && r.settings.playerCount === 4) {
    /* 四人局：逐座检查离席保留窗（到点出局而非关房） */
    for (const s of seatOrder(r)) {
      const slot = r.players[s];
      if (slot && !slot.connected && slot.gcAt && now > slot.gcAt && !eliminatedOf(r).has(s)) {
        eliminateSeat(r, s, "disconnect");
      }
    }
  }
  if (!removed && r.disconnectGcAt && now > r.disconnectGcAt && r.settings.playerCount === 2) {
    /* 二人局保留窗耗尽：若另有一位仍在线，判离席方负并广播；随后关房 */
    const loser = r.loserOnGc;
    if (loser) {
      const winner = loser === "A" ? "B" : "A";
      const other = r.players[winner as RoomSeat];
      if (other?.connected) {
        io?.to(code).emit("room-expired", { loser, winner });
      }
    }
    rooms.delete(code);
    removed = true;
  }
  if (!removed && r.status === "ended" && now - r.lastActivity > 5 * 60_000) {
    rooms.delete(code);
    removed = true;
  }
  if (!removed && now - r.lastActivity > 2 * 3600_000) {
    rooms.delete(code);
    removed = true;
  }
  if (removed) broadcastLobby();
  return removed;
}

function token(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function authPlayer(r: Room, tok: string): Seat | null {
  for (const s of ["A", "B", "C", "D"] as Seat[]) {
    if (r.players[s]?.token === tok) return s;
  }
  return null;
}

/* AI 席位凭证校验（开局时生成，仅房主与被派发的执行者持有） */
function authAiSeat(r: Room, tok: string): Seat | null {
  for (const s of ["A", "B", "C", "D"] as Seat[]) {
    if (r.aiTokens[s] && r.aiTokens[s] === tok) return s;
  }
  return null;
}

function expectedTurn(r: Room): Seat {
  if (r.settings.playerCount === 2) {
    return r.moves.length % 2 === 0 ? "A" : "B";
  }
  return expectedTurnOf(r);
}

/* ============ 棋钟裁决 ============ */

/* 广播并落账一次超时判负（二人局语义） */
function judgeTimeout(r: Room, loser: "A" | "B", reason: "total" | "permove") {
  const winner = loser === "A" ? "B" : "A";
  r.status = "ended";
  r.lastActivity = Date.now();
  r.moves.push({ player: loser, move: { type: "timeout" } });
  io?.to(r.code).emit("game-timeout", {
    loser,
    winner,
    reason,
    playerCount: 2,
    ended: true,
    clock: { ...r.clock, serverNow: Date.now() },
  });
  broadcastLobby();
}

/* 周期裁决：仅对 playing 且设了时限的房间 */
function tickClocks() {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.status !== "playing") continue;
    const tc = r.settings.timeControl;
    if (tc.totalSec <= 0 && tc.perMoveSec <= 0) continue;
    const p = expectedTurn(r);
    if (r.settings.playerCount === 4 && isAiSeat(r, p)) continue; // AI 席位不计时
    const usedTotal = totalMsOf(r, p) + (now - r.clock.turnStartAt);
    if (tc.totalSec > 0 && usedTotal >= tc.totalSec * 1000) {
      if (r.settings.playerCount === 4) eliminateSeat(r, p, "total");
      else judgeTimeout(r, p as RoomSeat, "total");
      continue;
    }
    if (tc.perMoveSec > 0 && now - r.clock.turnStartAt >= tc.perMoveSec * 1000) {
      if (r.settings.playerCount === 4) eliminateSeat(r, p, "permove");
      else judgeTimeout(r, p as RoomSeat, "permove");
    }
  }
}

let io: Server | null = null;

export function startRelay(): Promise<{ http: HttpServer; port: number }> {
  if (started) return Promise.resolve({ http: null as unknown as HttpServer, port: RELAY_PORT });
  started = true;

  const httpServer = createServer();
  io = new Server(httpServer, {
    path: "/",
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,
  });

  io.on("connection", (socket) => {
    /* —— 开房：房主携带版式与棋钟规格；isPublic 决定是否陈列于大厅 —— */
    socket.on(
      "create-room",
      (data: { settings?: unknown; isPublic?: boolean } | undefined, cb?: (res: object) => void) => {
        let code = "";
        for (let i = 0; i < 64; i++) {
          code = String(Math.floor(1000 + Math.random() * 9000));
          const existing = rooms.get(code);
          if (!existing || sweepRoom(code, existing)) break;
        }
        const tok = token();
        const settings = normalizeSettings(data?.settings);
        const now = Date.now();
        const r: Room = {
          code,
          players: { A: { token: tok, socketId: socket.id, connected: true, since: now } },
          aiSeats: {},
          aiTokens: {},
          settings,
          moves: [],
          status: "waiting",
          isPublic: data?.isPublic !== false,
          createdAt: now,
          clock: { totalMsA: 0, totalMsB: 0, turnStartAt: now },
          lastActivity: now,
          disconnectGcAt: null,
          loserOnGc: null,
          lastAiDispatch: null,
        };
        rooms.set(code, r);
        socket.join(code);
        cb?.({
          ok: true,
          roomCode: code,
          player: "A",
          token: tok,
          settings,
          seats: peerStatus(r).seats,
          clock: { ...r.clock, serverNow: now },
        });
        socket.emit("peer-status", peerStatus(r));
        broadcastLobby();
      },
    );

    /* —— 入座：客人拿到房的规格、既有着法与棋钟 —— */
    socket.on("join-room", (data: { roomCode?: string }, cb?: (res: object) => void) => {
      const code = String(data?.roomCode ?? "").trim();
      const r = rooms.get(code);
      if (!r) {
        cb?.({ ok: false, error: "房间不存在或已失效" });
        return;
      }
      if (r.status === "ended") {
        /* 已收束的房不可再入座，防止误入终局 */
        cb?.({ ok: false, error: "这一局已收束，另开一间吧" });
        return;
      }
      if (r.status === "playing") {
        cb?.({ ok: false, error: "对局已开始，须凭原座位回局" });
        return;
      }
      const four = r.settings.playerCount === 4;
      if (!four) {
        if (r.players.B) {
          const b = r.players.B;
          if (b.connected) {
            cb?.({ ok: false, error: "房间已满" });
            return;
          }
          /* 原 B 座离线：视作换座重连，更新凭证（旧 token 失效） */
        }
        const tok = token();
        const now = Date.now();
        r.players.B = { token: tok, socketId: socket.id, connected: true, since: now };
        if (r.players.A) r.status = "playing";
        /* 开局（或重新入座）即起钟 */
        r.clock = { totalMsA: 0, totalMsB: 0, turnStartAt: now };
        r.lastActivity = now;
        r.disconnectGcAt = null;
        r.loserOnGc = null;
        socket.join(code);
        cb?.({
          ok: true,
          roomCode: code,
          player: "B",
          token: tok,
          moves: r.moves,
          settings: r.settings,
          seats: peerStatus(r).seats,
          clock: { ...r.clock, serverNow: now },
        });
        io?.to(code).emit("peer-status", peerStatus(r));
        io?.to(code).emit("game-start", {
          moves: r.moves,
          settings: r.settings,
          clock: { ...r.clock, serverNow: now },
          seats: peerStatus(r).seats,
          playerCount: 2,
        });
        broadcastLobby();
        return;
      }
      /* 四人房：占第一个「无真人且非 AI」的座（B→C→D） */
      let seat: Seat | null = null;
      for (const s of ["B", "C", "D"] as Seat[]) {
        if (!r.players[s] && !isAiSeat(r, s)) {
          seat = s;
          break;
        }
      }
      if (!seat) {
        cb?.({ ok: false, error: "房间已满（或余座已留给编辑部 AI）" });
        return;
      }
      const tok = token();
      const now = Date.now();
      r.players[seat] = { token: tok, socketId: socket.id, connected: true, since: now };
      r.lastActivity = now;
      socket.join(code);
      cb?.({
        ok: true,
        roomCode: code,
        player: seat,
        token: tok,
        moves: r.moves,
        settings: r.settings,
        seats: peerStatus(r).seats,
        clock: { ...r.clock, serverNow: now },
      });
      io?.to(code).emit("peer-status", peerStatus(r));
      io?.to(code).emit("seat-update", { roomCode: code, seats: peerStatus(r).seats });
      broadcastLobby();
    });

    /* —— 四人房等待期：房主把某座设为编辑部 AI 代打（0 = 恢复等棋友） —— */
    socket.on(
      "set-seat-ai",
      (
        data: { roomCode?: string; token?: string; seat?: string; aiLevel?: number },
        cb?: (res: object) => void,
      ) => {
        const r = rooms.get(String(data?.roomCode ?? ""));
        if (!r || r.status !== "waiting") {
          cb?.({ ok: false, error: "房间不可设置（已开局或不存在）" });
          return;
        }
        const isHost = data?.token && r.players.A?.token === String(data.token);
        if (!isHost) {
          cb?.({ ok: false, error: "只有房主能安排席位" });
          return;
        }
        const seat = String(data?.seat ?? "") as Seat;
        if (!["B", "C", "D"].includes(seat)) {
          cb?.({ ok: false, error: "只能调整乙/丙/丁座" });
          return;
        }
        if (r.players[seat]) {
          cb?.({ ok: false, error: "该座已有棋友入座" });
          return;
        }
        const lv = Math.round(Number(data?.aiLevel));
        if (!Number.isFinite(lv) || lv <= 0) delete r.aiSeats[seat];
        else r.aiSeats[seat] = Math.min(4, Math.max(1, lv)) as number;
        r.lastActivity = Date.now();
        cb?.({ ok: true, seats: peerStatus(r).seats });
        io?.to(r.code).emit("seat-update", { roomCode: r.code, seats: peerStatus(r).seats });
        broadcastLobby();
      },
    );

    /* —— 四人房开局（房主）：四座齐备（真人或 AI）方可开 —— */
    socket.on("start-game", (data: { roomCode?: string; token?: string }, cb?: (res: object) => void) => {
      const r = rooms.get(String(data?.roomCode ?? ""));
      if (!r) {
        cb?.({ ok: false, error: "房间不存在" });
        return;
      }
      const isHost = data?.token && r.players.A?.token === String(data.token);
      if (!isHost) {
        cb?.({ ok: false, error: "只有房主能开局" });
        return;
      }
      if (r.settings.playerCount !== 4) {
        cb?.({ ok: false, error: "此房为双人对局，无需手动开局" });
        return;
      }
      if (r.status !== "waiting") {
        cb?.({ ok: false, error: "对局已在进行" });
        return;
      }
      let ready = true;
      for (const s of ["B", "C", "D"] as Seat[]) {
        if (!r.players[s] && !isAiSeat(r, s)) ready = false;
        if (r.players[s] && isAiSeat(r, s)) {
          cb?.({ ok: false, error: "座位冲突：AI 座上有人" });
          return;
        }
      }
      if (!ready) {
        cb?.({ ok: false, error: "尚有空座：请等待棋友入座，或把空座设为编辑部 AI" });
        return;
      }
      const now = Date.now();
      r.status = "playing";
      r.clock = { totalMsA: 0, totalMsB: 0, totalMsC: 0, totalMsD: 0, turnStartAt: now };
      r.lastActivity = now;
      r.disconnectGcAt = null;
      r.loserOnGc = null;
      /* 为 AI 席位生成凭证：仅回传房主（不广播） */
      const aiTokens: Record<string, string> = {};
      for (const s of ["B", "C", "D"] as Seat[]) {
        if (isAiSeat(r, s) && !r.players[s]) {
          const t = token();
          r.aiTokens[s] = t;
          aiTokens[s] = t;
        }
      }
      cb?.({ ok: true, aiTokens });
      io?.to(r.code).emit("game-start", {
        moves: r.moves,
        settings: r.settings,
        clock: { ...r.clock, serverNow: now },
        seats: peerStatus(r).seats,
        playerCount: 4,
      });
      broadcastLobby();
      dispatchAiTurn(r);
    });

    /* —— 回座：凭证不变，socket 换新即重新入房 —— */
    socket.on("resume", (data: { roomCode?: string; token?: string }, cb?: (res: object) => void) => {
      const code = String(data?.roomCode ?? "").trim();
      const r = rooms.get(code);
      if (!r) {
        cb?.({ ok: false, error: "房间已失效（断线超过 5 分钟或对局已收束）" });
        return;
      }
      const role = data?.token ? authPlayer(r, String(data.token)) : null;
      if (!role) {
        cb?.({ ok: false, error: "会话凭证不匹配" });
        return;
      }
      const slot = r.players[role]!;
      slot.socketId = socket.id;
      slot.connected = true;
      slot.since = Date.now();
      slot.gcAt = null;
      r.lastActivity = Date.now();
      if (r.settings.playerCount === 2) {
        if (r.players.A?.connected && r.players.B?.connected) {
          r.disconnectGcAt = null;
          r.loserOnGc = null;
        }
      }
      socket.join(code);
      cb?.({
        ok: true,
        roomCode: code,
        player: role,
        moves: r.moves,
        settings: r.settings,
        status: r.status,
        seats: peerStatus(r).seats,
        clock: { ...r.clock, serverNow: Date.now() },
        peer: peerStatus(r),
      });
      io?.to(code).emit("peer-status", peerStatus(r));
      dispatchAiTurn(r);
    });

    /* —— 行棋：粗校验轮次后转发；记账自报累计用时 —— */
    socket.on(
      "game-move",
      (data: { roomCode?: string; token?: string; move?: unknown; elapsedMs?: number; totalMs?: number }) => {
        const r = rooms.get(String(data?.roomCode ?? ""));
        if (!r || r.status !== "playing") return;
        const role = data?.token ? authPlayer(r, String(data.token)) : null;
        const aiRole = data?.token && !role ? authAiSeat(r, String(data.token)) : null;
        const seat = role ?? aiRole;
        if (!seat) return;
        if (expectedTurn(r) !== seat) return;
        const now = Date.now();
        if (role) {
          /* 自报累计（含本手）：信任行棋方自己的钟，服务器按此记账 */
          const reported = Number(data?.totalMs);
          if (Number.isFinite(reported) && reported >= 0) {
            setTotalMs(r, seat, Math.min(reported, 3600_000));
          }
        }
        r.clock.turnStartAt = now;
        r.moves.push({ player: seat, move: data.move, elapsedMs: data.elapsedMs ?? 0 });
        r.lastActivity = now;
        socket.to(r.code).emit("opponent-move", {
          player: seat,
          move: data.move,
          elapsedMs: data.elapsedMs ?? 0,
          totalMs: totalMsOf(r, seat),
        });
        dispatchAiTurn(r);
      },
    );

    /* —— 认输（四人局为出局，非终局） —— */
    socket.on("game-resign", (data: { roomCode?: string; token?: string }) => {
      const r = rooms.get(String(data?.roomCode ?? ""));
      if (!r) return;
      const role = data?.token ? authPlayer(r, String(data.token)) : null;
      if (!role) return;
      r.lastActivity = Date.now();
      if (r.settings.playerCount === 4) {
        if (r.status !== "playing") return;
        if (eliminatedOf(r).has(role)) return;
        const turnBefore = expectedTurnOf(r);
        r.moves.push({ player: role, move: { type: "resign" } });
        resetClockOnTurnChange(r, turnBefore);
        const active = seatOrder(r).filter((s) => !eliminatedOf(r).has(s));
        const ended = active.length <= 1;
        if (ended) r.status = "ended";
        socket.to(r.code).emit("opponent-resign", { player: role, ended, playerCount: 4 });
        socket.to(r.code).emit("peer-status", peerStatus(r));
        if (ended) broadcastLobby();
        else dispatchAiTurn(r);
        return;
      }
      r.status = "ended";
      r.moves.push({ player: role, move: { type: "resign" } });
      socket.to(r.code).emit("opponent-resign", { player: role });
      broadcastLobby();
    });

    /* —— 心跳对齐（客户端在线/切回前台即报平安） —— */
    socket.on("heartbeat", (data: { roomCode?: string; token?: string }) => {
      const r = rooms.get(String(data?.roomCode ?? ""));
      if (!r) return;
      const role = data?.token ? authPlayer(r, String(data.token)) : null;
      if (!role) return;
      r.lastActivity = Date.now();
    });

    /* —— 主动离席（区别于意外断线）：不保留座位 —— */
    socket.on("leave-room", (data: { roomCode?: string; token?: string }) => {
      const r = rooms.get(String(data?.roomCode ?? ""));
      if (!r) return;
      const role = data?.token ? authPlayer(r, String(data.token)) : null;
      if (role) {
        const slot = r.players[role]!;
        slot.connected = false;
        slot.socketId = null;
        socket.leave(r.code);
        io?.to(r.code).emit("peer-status", peerStatus(r));
        broadcastLobby();
      }
    });

    /* —— 大厅：订阅 / 退订空房列表 —— */
    socket.on("lobby-watch", (cb?: (res: object) => void) => {
      socket.join(LOBBY_ROOM);
      cb?.({ ok: true, rooms: lobbyList(), serverNow: Date.now() });
    });
    socket.on("lobby-unwatch", () => {
      socket.leave(LOBBY_ROOM);
    });

    /* —— 意外断线：开 5 分钟保留窗（二人局判负窗；四人局出局窗） —— */
    socket.on("disconnect", () => {
      let lobbyTouched = false;
      for (const [code, r] of rooms) {
        let touched = false;
        for (const role of ["A", "B", "C", "D"] as Seat[]) {
          const slot = r.players[role];
          if (slot?.socketId === socket.id && slot.connected) {
            slot.connected = false;
            slot.socketId = null;
            if (r.status === "playing") {
              if (r.settings.playerCount === 4) {
                /* 四人局：该座开离席出局窗（棋钟对 AI 席照常派发，真人座照常计时） */
                slot.gcAt = Date.now() + RECONNECT_GRACE_MS;
              } else {
                const other = r.players[role === "A" ? "B" : "A"];
                if (other?.connected) {
                  r.disconnectGcAt = Date.now() + RECONNECT_GRACE_MS;
                  r.loserOnGc = role as RoomSeat;
                } else {
                  r.disconnectGcAt = Date.now() + RECONNECT_GRACE_MS;
                  r.loserOnGc = null;
                }
              }
            }
            touched = true;
            if (r.status === "waiting") lobbyTouched = true;
          }
        }
        if (touched) {
          io?.to(code).emit("peer-status", peerStatus(r));
          dispatchAiTurn(r); // 执行者可能变化（原执行者掉线）
        }
        sweepRoom(code, r);
      }
      if (lobbyTouched) broadcastLobby();
    });
  });

  /* 周期清扫 + 棋钟裁决 + AI 派发兜底 */
  const sweep = setInterval(() => {
    for (const [code, r] of rooms) sweepRoom(code, r);
  }, 30_000);
  sweep.unref?.();
  const clockTick = setInterval(tickClocks, 1000);
  clockTick.unref?.();
  /* AI 派发兜底：执行者漏收/超时未上着时周期重派（客户端幂等） */
  const aiTick = setInterval(() => {
    for (const r of rooms.values()) {
      if (r.status === "playing" && r.settings.playerCount === 4) dispatchAiTurn(r);
    }
  }, 4000);
  aiTick.unref?.();

  return new Promise((resolve) => {
    httpServer.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.log("[quoridor-relay] port 3004 already in use, skipping (standalone relay running?)");
        resolve({ http: httpServer, port: RELAY_PORT });
      } else {
        console.error("[quoridor-relay] failed:", err);
        resolve({ http: httpServer, port: RELAY_PORT });
      }
    });
    httpServer.listen(RELAY_PORT, () => {
      console.log(`[quoridor-relay] listening on :${RELAY_PORT}`);
      resolve({ http: httpServer, port: RELAY_PORT });
    });
  });
}
