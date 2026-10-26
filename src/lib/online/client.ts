/* 在线对战 socket 客户端 v5 —— 多实例网关适配版
 *
 * 背景:发布环境的网关对每个请求/连接随机分流到不同服务实例;relay 的房间
 * 状态存于单实例内存。玩家 A 建房落在实例 1,玩家 B 入房若被分到实例 2,
 * 就会「房间不存在或已失效」。网关上轮询传输的 POST 请求体不可用,唯
 * WebSocket 持久连接可"钉住"实例。
 *
 * 对策:
 *   1) 所有连接仅用 WebSocket 传输(网关唯一可靠通道);
 *   2) 实例狩猎:join-room / resume 收到「房间不存在」时,换一条全新连接
 *      (= 新随机实例)重试,直至命中房间所在实例;命中连接晋升为活动连接,
 *      对局全程钉在该实例上;
 *   3) 门面 Socket:对外暴露稳定的类 Socket 对象,UI 的监听器登记在门面
 *      上,底层连接更换(晋升)时 UI 无感知;
 *   4) 大厅:并行探针池分别订阅各实例的空房列表,合并呈现(房间码去重,
 *      按最后目击时间淘汰陈旧条目)。
 *
 * 会话凭证双层存储:sessionStorage(同标签页刷新)为主,
 * localStorage 兜底(误关标签页 / 手机锁屏后重开仍可回座,10 分钟内有效)。
 * 重连策略:活动连接无限次自动重连(指数退避封顶 6s);重连成功即触发
 * 回座(resume)——resume 自带狩猎,可跨实例找回房间。
 */

"use client";

import { io, type Socket } from "socket.io-client";
import type { MovePayload, Player, TimeControl } from "@/lib/game/types";
import { normalizeTimeControl } from "@/lib/game/types";

/* —— relay 地址:共享对战服。可用构建期 NEXT_PUBLIC_RELAY_URL 覆盖 —— */
const RELAY_ORIGIN = (process.env.NEXT_PUBLIC_RELAY_URL || "https://d1n1c9rzwhe0-d.space.zhipuaidemo.cn")
  .trim()
  .replace(/\/+$/, "");
export const RELAY_URL = `${RELAY_ORIGIN}/?XTransformPort=3004`;
/** @deprecated 兼容旧引用:网关按 XTransformPort 查询参数转发到 relay 端口 */
export const RELAY_PORT = 3004;

/* —— 狩猎与探针参数 —— */
const NOT_FOUND = "房间不存在或已失效";
const HUNT_BATCH = 6; // 每批并行探针数
const HUNT_BUDGET_MS = 20000; // 狩猎总预算
const PROBE_CONNECT_MS = 9000; // 探针连接超时
const ATTEMPT_TIMEOUT_MS = 5000; // 单次 emit+ack 超时
const LOBBY_PROBES = 6; // 大厅探针池规模
const LOBBY_STALE_MS = 90_000; // 大厅条目最长无目击存活

const SESSION_KEY = "quoridor-online-session";
const BACKUP_KEY = "quoridor-online-session-backup";
const BACKUP_TTL_MS = 10 * 60_000; // 兜底身份有效期

export function saveIdentity(id: { roomCode: string; token: string; myPlayer: Player }) {
  const backup = { ...id, savedAt: Date.now() };
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

export function loadIdentity(): { roomCode: string; token: string; myPlayer: Player } | null {
  // 主:sessionStorage(同标签页刷新)
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const id = JSON.parse(raw) as { roomCode: string; token: string; myPlayer: Player };
      if (id?.roomCode && id?.token) return id;
    }
  } catch {
    /* noop */
  }
  // 备:localStorage(误关标签页 / 新开标签页重进),限 10 分钟内
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as { roomCode: string; token: string; myPlayer: Player; savedAt: number };
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

/* 服务器棋钟记账(重连校准用) */
export interface RoomClockPayload {
  totalMsA: number;
  totalMsB: number;
  totalMsC?: number;
  totalMsD?: number;
  turnStartAt: number;
  serverNow: number;
}

/* 席位实况(四人房):谁在座、谁掉线、谁是编辑部 AI、谁已出局 */
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

/* AI 代打派发:轮到 AI 席位时私发给执行者(第一位在线真人) */
export interface AiTurnPayload {
  roomCode: string;
  player: Player;
  token: string; // 该 AI 席位的行棋凭证(仅本事件携带)
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

/* ============ 连接工厂 ============ */

function makeSocket(reconnection: boolean): Socket {
  return io(RELAY_URL, {
    /* 网关上轮询传输的 POST 请求体不可用(每次请求被独立分流),仅 WebSocket 可靠 */
    transports: ["websocket"],
    /* 每条连接独立引擎:并行探针采样不同实例的前提 */
    forceNew: true,
    reconnection,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 6000,
    randomizationFactor: 0.35,
    timeout: 12000,
  });
}

function safeDisconnect(s: Socket | null | undefined) {
  try {
    s?.removeAllListeners();
    s?.disconnect();
  } catch {
    /* noop */
  }
}

/* ============ 门面 Socket:稳定的事件面,底层连接可无缝更换 ============ */

type Handler = (...args: unknown[]) => void;

class SocketFacade {
  private active: Socket;
  private handlers = new Map<string, Set<Handler>>();
  private onceWrap = new Map<Handler, Handler>();

  constructor() {
    this.active = makeSocket(true);
    this.attach(this.active);
  }

  private attach(s: Socket) {
    s.onAny((event, ...args) => this.dispatch(String(event), args));
    s.on("connect", () => this.dispatch("connect", []));
    s.on("disconnect", (reason) => this.dispatch("disconnect", [reason]));
    s.on("connect_error", (err) => this.dispatch("connect_error", [err]));
    /* Manager 级事件(门面上补齐 socket.io 对 reconnect_attempt 的透传) */
    s.io.on("reconnect_attempt", (attempt: number) => this.dispatch("reconnect_attempt", [attempt]));
  }

  private detach(s: Socket) {
    try {
      s.offAny();
      s.off("connect");
      s.off("disconnect");
      s.off("connect_error");
      s.io.off("reconnect_attempt");
    } catch {
      /* noop */
    }
  }

  /** 探针晋升为活动连接(已命中目标实例)。旧连接立即退役。 */
  promote(s: Socket) {
    if (!s || s === this.active) return;
    const old = this.active;
    this.attach(s);
    this.active = s;
    /* 晋升连接开启自动重连;重连落点若非本实例,由 connect 钩子触发回座狩猎找回 */
    try {
      s.io.reconnection(true);
      s.io.reconnectionAttempts(Infinity);
    } catch {
      /* noop */
    }
    this.detach(old);
    safeDisconnect(old);
  }

  private dispatch(event: string, args: unknown[]) {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    for (const fn of Array.from(set)) {
      try {
        (fn as (...a: unknown[]) => void)(...args);
      } catch (err) {
        console.error("[online] listener error:", event, err);
      }
    }
  }

  private ensure(event: string) {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    return set;
  }

  on(event: string, fn: Handler): this {
    this.ensure(event).add(fn);
    return this;
  }

  once(event: string, fn: Handler): this {
    const wrap: Handler = (...args) => {
      this.off(event, wrap);
      fn(...args);
    };
    this.onceWrap.set(fn, wrap);
    this.ensure(event).add(wrap);
    return this;
  }

  off(event: string, fn?: Handler): this {
    const set = this.handlers.get(event);
    if (!set) return this;
    if (!fn) {
      set.clear();
      return this;
    }
    const wrap = this.onceWrap.get(fn);
    if (wrap) {
      set.delete(wrap);
      this.onceWrap.delete(fn);
    }
    set.delete(fn);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    this.active.emit(event, ...(args as never[]));
  }

  get connected(): boolean {
    return this.active.connected;
  }

  get id(): string | undefined {
    return this.active.id;
  }

  connect(): this {
    if (!this.active.connected) this.active.connect();
    return this;
  }

  disconnect(): this {
    this.active.disconnect();
    return this;
  }

  /** 当前活动连接(狩猎的候选之一) */
  getActive(): Socket {
    return this.active;
  }

  dispose() {
    this.handlers.clear();
    this.onceWrap.clear();
    const old = this.active;
    this.detach(old);
    safeDisconnect(old);
  }
}

let facade: SocketFacade | null = null;

function getFacade(): SocketFacade {
  if (!facade) facade = new SocketFacade();
  return facade;
}

/** 稳定的类 Socket 门面:监听器登记其上,底层连接更换不丢失。 */
export function getSocket(): Socket {
  return getFacade() as unknown as Socket;
}

export function destroySocket() {
  stopLobbyAd();
  lobbyTearDown();
  facade?.dispose();
  facade = null;
}

/* ============ 大厅探针池:多实例空房列表合并 ============ */

interface LobbyWatchEntry extends LobbyRoomEntry {
  __lastSeen: number;
}

let lobbySockets: Socket[] = [];
let lobbyOnUpdate: ((payload: LobbyUpdatePayload) => void) | null = null;
let lobbyMerge = new Map<string, LobbyWatchEntry>();
let lobbyFlushTimer: ReturnType<typeof setTimeout> | null = null;

function lobbyAbsorb(rooms: LobbyRoomEntry[] | undefined) {
  if (!Array.isArray(rooms)) return;
  const now = Date.now();
  for (const r of rooms) {
    if (!r?.code) continue;
    lobbyMerge.set(r.code, { ...r, __lastSeen: now });
  }
  /* 顺带淘汰长期无目击的条目(房间已在别的实例关房/满员) */
  for (const [code, e] of lobbyMerge) {
    if (now - e.__lastSeen > LOBBY_STALE_MS) lobbyMerge.delete(code);
  }
  lobbyScheduleFlush();
}

function lobbyScheduleFlush() {
  if (lobbyFlushTimer) return;
  lobbyFlushTimer = setTimeout(() => {
    lobbyFlushTimer = null;
    if (!lobbyOnUpdate) return;
    lobbyOnUpdate({ rooms: Array.from(lobbyMerge.values()), serverNow: Date.now() });
  }, 350);
}

function lobbyWatchEmit(s: Socket) {
  try {
    s.emit("lobby-watch", (res: { rooms?: LobbyRoomEntry[] }) => {
      lobbyAbsorb(res?.rooms);
    });
  } catch {
    /* noop */
  }
}

function lobbyEnsure() {
  while (lobbySockets.length < LOBBY_PROBES) {
    const s = makeSocket(true); // 自动重连 → 随时间重采样不同实例
    s.on("connect", () => lobbyWatchEmit(s)); // 每次连上(含重连)都重新订阅
    s.onAny((event, ...args) => {
      if (event === "lobby-update" && args[0]) lobbyAbsorb((args[0] as { rooms?: LobbyRoomEntry[] }).rooms);
    });
    lobbySockets.push(s);
  }
}

function lobbyRemove(s: Socket) {
  const i = lobbySockets.indexOf(s);
  if (i >= 0) lobbySockets.splice(i, 1);
  /* 该连接被晋升为对局连接:退订大厅,避免持续广播 */
  try {
    s.emit("lobby-unwatch");
  } catch {
    /* noop */
  }
}

function lobbyTearDown() {
  if (lobbyFlushTimer) {
    clearTimeout(lobbyFlushTimer);
    lobbyFlushTimer = null;
  }
  for (const s of lobbySockets) safeDisconnect(s);
  lobbySockets = [];
  lobbyMerge.clear();
}

/* —— 大厅:订阅 / 退订空房列表(返回退订函数) —— */

export function watchLobby(
  onUpdate: (payload: LobbyUpdatePayload) => void,
  onSnapshot?: (payload: LobbyUpdatePayload) => void,
) {
  lobbyOnUpdate = onUpdate;
  lobbyMerge.clear();
  lobbyEnsure();
  /* 初次合并快照:给探针一小段时间应答 */
  const t = setTimeout(() => {
    onSnapshot?.({ rooms: Array.from(lobbyMerge.values()), serverNow: Date.now() });
  }, 2600);
  return () => {
    clearTimeout(t);
    lobbyOnUpdate = null;
    lobbyTearDown();
  };
}

export function unwatchLobby() {
  lobbyOnUpdate = null;
  lobbyTearDown();
}

/* ============ 跨实例大厅广告 ============ */

/* 网关随机分流:大厅探针只能采样到部分实例,房间可能恰好不在采样内。
 * 房主客户端周期性地向多个实例轮播「大厅广告」,让任何实例的大厅
 * 订阅者都能看到这间公开等待房。广告仅陈列,入座仍靠实例狩猎。 */
const AD_BURST = 9; // 每轮广播并行连接数
const AD_INTERVAL_MS = 15_000;
const AD_CAMPAIGN_MS = 5 * 60_000; // 广告战役上限(等待房多在几分钟内配对)

let adTimer: ReturnType<typeof setInterval> | null = null;
let adDeadline = 0;
let adEntry: LobbyRoomEntry | null = null;
let adCode: string | null = null;

function adStopOnStart() {
  stopLobbyAd();
}

function adBurst() {
  const entry = adEntry;
  if (!entry) return;
  for (let i = 0; i < AD_BURST; i++) {
    connectProbe().then((s) => {
      if (!s) return;
      try {
        s.emit("lobby-advertise", { entry });
      } catch {
        /* noop */
      }
      setTimeout(() => safeDisconnect(s), 800);
    });
  }
}

export function startLobbyAd(entry: LobbyRoomEntry) {
  stopLobbyAd();
  adEntry = entry;
  adCode = entry.code;
  adDeadline = Date.now() + AD_CAMPAIGN_MS;
  adBurst();
  adTimer = setInterval(() => {
    if (!adEntry || Date.now() > adDeadline) {
      stopLobbyAd();
      return;
    }
    adBurst();
  }, AD_INTERVAL_MS);
  /* 对局开始(含二人房入座即开局)即停止广告 */
  getFacade().on("game-start", adStopOnStart);
}

export function stopLobbyAd(code?: string) {
  if (code && code !== adCode) return;
  if (adTimer) {
    clearInterval(adTimer);
    adTimer = null;
  }
  try {
    getFacade().off("game-start", adStopOnStart);
  } catch {
    /* noop */
  }
  const gone = adCode;
  adEntry = null;
  adCode = null;
  if (gone) {
    /* 尽力撤下广告(其余实例靠 TTL 自然过期) */
    connectProbe().then((s) => {
      if (!s) return;
      try {
        s.emit("lobby-unadvertise", { code: gone });
      } catch {
        /* noop */
      }
      setTimeout(() => safeDisconnect(s), 600);
    });
  }
}

/* ============ 实例狩猎 ============ */

function connectProbe(): Promise<Socket | null> {
  return new Promise((resolve) => {
    const s = makeSocket(false);
    let settled = false;
    const finish = (v: Socket | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!v) safeDisconnect(s);
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), PROBE_CONNECT_MS);
    s.once("connect", () => finish(s));
    s.once("connect_error", () => finish(null));
  });
}

interface HuntSpec {
  event: "join-room" | "resume";
  payload: Record<string, unknown>;
  done: (res: unknown) => void;
}

let huntChain: Promise<void> = Promise.resolve();

/** 串行化狩猎:同一时刻至多一场(后到者排队),避免并发晋升竞态。 */
function hunt(spec: HuntSpec) {
  huntChain = huntChain
    .then(() => huntRun(spec))
    .catch((err) => {
      console.error("[online] hunt error:", err);
      try {
        spec.done({ ok: false, error: "连接对战服务器失败,请重试" });
      } catch {
        /* noop */
      }
    });
}

async function huntRun({ event, payload, done }: HuntSpec): Promise<void> {
  const deadline = Date.now() + HUNT_BUDGET_MS;
  const tried = new Set<Socket>();

  const attempt = (s: Socket): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: NOT_FOUND, __miss: true });
      }, ATTEMPT_TIMEOUT_MS);
      try {
        s.emit(event, payload, (res: Record<string, unknown> | undefined) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(res ?? { ok: false, error: "服务无响应" });
        });
      } catch {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ ok: false, error: NOT_FOUND, __miss: true });
        }
      }
    });

  const settle = (res: Record<string, unknown>, winner?: Socket, rest?: Socket[]) => {
    if (winner && res.ok) {
      const f = getFacade();
      if (winner !== f.getActive()) {
        lobbyRemove(winner);
        f.promote(winner);
        lobbyEnsure();
      }
    }
    if (rest) for (const other of rest) if (other !== winner) safeDisconnect(other);
    done(res);
  };

  /* 轮 0:零成本候选——活动连接与大厅探针(均已连接) */
  const ready = [getFacade().getActive(), ...lobbySockets];
  for (const s of ready) {
    if (!s || !s.connected || tried.has(s)) continue;
    if (Date.now() > deadline) break;
    tried.add(s);
    const res = await attempt(s);
    if (res.ok || (res.error && res.error !== NOT_FOUND)) {
      settle(res, res.ok ? s : undefined);
      return;
    }
  }

  /* 轮 1..N:并行连一批新探针(= 各自随机实例),串行逐个尝试 */
  while (Date.now() < deadline) {
    const batch = await Promise.all(Array.from({ length: HUNT_BATCH }, () => connectProbe()));
    const probes = batch.filter((s): s is Socket => !!s && s.connected && !tried.has(s));
    for (let i = 0; i < probes.length; i++) {
      const s = probes[i];
      if (Date.now() > deadline || !s.connected) {
        safeDisconnect(s);
        continue;
      }
      tried.add(s);
      const res = await attempt(s);
      if (res.ok) {
        /* 命中房间所在实例:晋升,其余探针即弃 */
        settle(res, s, probes);
        return;
      }
      if (res.error && res.error !== NOT_FOUND) {
        /* 房在但被拒(已满/已开局/已收束/凭证无效):立即上报 */
        settle(res, undefined, probes);
        return;
      }
      safeDisconnect(s);
    }
  }

  done({ ok: false, error: NOT_FOUND });
}

/* ============ 公开 API ============ */

export function createRoom(
  settings: RoomSettingsPayload,
  isPublic: boolean,
  cb: (res: CreateRoomRes) => void,
) {
  /* 建房落在任意实例皆可;活动连接即房主连接,全程钉住该实例 */
  const s = getFacade().getActive();
  if (!s.connected) s.connect();
  s.emit("create-room", { settings, isPublic }, (res: CreateRoomRes) => {
    /* 公开房:启动跨实例大厅广告,让任何实例的大厅都能看到这间房 */
    if (res?.ok && res.roomCode && isPublic) {
      const st = res.settings ?? normalizeSettingsPayload(settings);
      startLobbyAd({
        code: res.roomCode,
        size: st.size,
        wallsPerPlayer: st.wallsPerPlayer,
        playerCount: st.playerCount,
        seatsTotal: st.playerCount,
        seatsTaken: 1,
        timeControl: st.timeControl,
        createdAt: Date.now(),
        hostConnected: true,
      });
    }
    cb(res);
  });
}

export function joinRoom(roomCode: string, cb: (res: JoinRoomRes) => void) {
  /* 网关随机分流:须狩猎到房间所在实例才能入座 */
  hunt({
    event: "join-room",
    payload: { roomCode },
    done: (res) => cb(res as JoinRoomRes),
  });
}

export function resumeSession(roomCode: string, token: string, cb: (res: ResumeRes) => void) {
  /* 回座同样须狩猎:断线重连后的新连接可能已不在原实例 */
  hunt({
    event: "resume",
    payload: { roomCode, token },
    done: (res) => cb(res as ResumeRes),
  });
}

/* 四人房等待期:房主把某座设为编辑部 AI 代打(aiLevel 0 = 恢复等棋友) */
export function setSeatAi(
  roomCode: string,
  token: string,
  seat: Player,
  aiLevel: number,
  cb: (res: { ok: boolean; seats?: SeatStatus[]; error?: string }) => void,
) {
  getFacade().emit("set-seat-ai", { roomCode, token, seat, aiLevel }, cb as never);
}

/* 四人房开局(房主):四座齐备(真人或 AI)后广播开局 */
export function startFourGame(
  roomCode: string,
  token: string,
  cb: (res: { ok: boolean; aiTokens?: Record<string, string>; error?: string }) => void,
) {
  getFacade().emit("start-game", { roomCode, token }, cb as never);
}

export function sendMove(
  roomCode: string,
  token: string,
  payload: MovePayload,
  elapsedMs: number,
  totalMs: number,
) {
  getFacade().emit("game-move", { roomCode, token, move: payload, elapsedMs, totalMs });
}

export function sendResign(roomCode: string, token: string) {
  getFacade().emit("game-resign", { roomCode, token });
}

export function sendHeartbeat(roomCode: string, token: string) {
  getFacade().emit("heartbeat", { roomCode, token });
}

export function leaveRoom(roomCode: string, token: string) {
  stopLobbyAd(roomCode);
  getFacade().emit("leave-room", { roomCode, token });
}
