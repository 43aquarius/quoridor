/* 全局状态机：hero → contents → (setup/room) → game → result → archive
 * 对局状态完全可序列化，统一驱动悔棋、回放、在线同步与 localStorage 存档。
 */

"use client";

import { create } from "zustand";
import type { AiLevel, GameConfig, GameMode, GameState, Move, MovePayload, Player, SkinId, TimeControl, Vec } from "@/lib/game/types";
import { AI_PROFILES, PLAYER_CN, SKINS, initialGame, normalizeConfig, normalizeState } from "@/lib/game/types";
import type { Orientation } from "@/lib/game/types";
import {
  applyPayload,
  applyResign,
  applyTimeout,
  checkWall,
  isEliminated,
  legalPawnMoves,
  pawnOf,
  playersOf,
  shortestPathLength,
  stateFromHistory,
  wallsLeftOf,
} from "@/lib/game/engine";
import type { RejectReason } from "@/lib/game/engine";
import {
  loadArchive,
  newEntryId,
  saveArchive,
  type ArchiveEntry,
} from "@/lib/game/archive";
import { playPawnClick, playReject, playWallSlide, setSoundEnabled } from "@/lib/game/sounds";
import type { SeatStatus } from "@/lib/online/client";

export type View = "hero" | "contents" | "setup" | "localsetup" | "quadsetup" | "room" | "game" | "rules" | "archive";

/* 席位配置：真人或编辑部 AI（本地四人局用） */
export type SeatKind = { kind: "human" } | { kind: "ai"; level: AiLevel };
export type SeatConfig = Record<Player, SeatKind>;

export function isSeatAi(cfg: SeatConfig | null, p: Player): boolean {
  return !!cfg && cfg[p]?.kind === "ai";
}

export interface OnlineSession {
  roomCode: string;
  myPlayer: Player;
  token: string;
  opponentConnected: boolean; // 二人局：对手在线；四人局：是否有任一真人同席
  opponentGcAt?: number | null; // 二人局：对手断线判负时刻；四人局见 seats[].gcAt
  phase: "waiting" | "playing" | "ended" | "reconnecting" | "error";
  reconnectAttempt?: number; // 本方重连尝试次数
  error?: string;
  playerCount?: 2 | 4;
  seats?: SeatStatus[]; // 四人房席位实况（含 AI 代打档位与出局状态）
  aiLevels?: Partial<Record<Player, AiLevel>>; // AI 席位 → 档位（执行者计算用）
}

export interface GameMeta {
  startedAt: number;
  turnStartedAt: number;
  totalMsA: number;
  totalMsB: number;
  totalMsC?: number;
  totalMsD?: number;
  maxPathA: number;
  maxPathB: number;
  maxPathC?: number;
  maxPathD?: number;
  maxPathAtA?: number;
  maxPathAtB?: number;
  maxPathAtC?: number;
  maxPathAtD?: number;
  earliestWallOut?: { player: Player; moveN: number };
  aiThinking: boolean;
  aiLabel: string | null;
  replayIndex: number | null;
  lastReject: { x: number; y: number; o: Orientation; reason: RejectReason; t: number } | null;
  animMove: number;
  archived: boolean;
}

/* 各席累计用时 / 归途峰值取值器 */
export function totalMsOf(meta: GameMeta, p: Player): number {
  if (p === "A") return meta.totalMsA;
  if (p === "B") return meta.totalMsB;
  if (p === "C") return meta.totalMsC ?? 0;
  return meta.totalMsD ?? 0;
}

export function maxPathOf(meta: GameMeta, p: Player): number {
  if (p === "A") return meta.maxPathA;
  if (p === "B") return meta.maxPathB;
  if (p === "C") return meta.maxPathC ?? 0;
  return meta.maxPathD ?? 0;
}

const LS_SKIN = "quoridor-skin";
const LS_SOUND = "quoridor-sound";
const LS_SAVED = "quoridor-saved-game";
const LS_CONFIG = "quoridor-config";

function initialMeta(size = 9): GameMeta {
  const now = Date.now();
  return {
    startedAt: now,
    turnStartedAt: now,
    totalMsA: 0,
    totalMsB: 0,
    maxPathA: size - 1,
    maxPathB: size - 1,
    aiThinking: false,
    aiLabel: null,
    replayIndex: null,
    lastReject: null,
    animMove: 0,
    archived: false,
  };
}

/* 由历史重建统计（悔棋后重算）；规格取自局面本身（旧档回填 9×10 二人） */
function deriveStats(state: GameState): Partial<GameMeta> {
  const src = normalizeState(state);
  const cfg = { size: src.size, wallsPerPlayer: src.wallsStart, playerCount: src.playerCount };
  let s = initialGame(cfg);
  const seats = playersOf(src);
  const maxPath: Record<string, number> = {};
  const maxPathAt: Record<string, number | undefined> = {};
  const totalMs: Record<string, number> = {};
  for (const p of seats) {
    maxPath[p] = src.size - 1;
    totalMs[p] = 0;
  }
  let earliestWallOut: GameMeta["earliestWallOut"];
  for (const m of src.history) {
    if (m.payload.type === "resign") {
      s = applyResign(s, m.player);
      continue;
    }
    if (m.payload.type === "timeout") {
      s = applyTimeout(s, m.player);
      continue;
    }
    const r = applyPayload(s, m.player, m.payload, m.elapsedMs);
    if (!r.ok || !r.state) break;
    s = r.state;
    for (const p of seats) {
      const d = shortestPathLength(s, p);
      if (d > maxPath[p]) {
        maxPath[p] = d;
        maxPathAt[p] = m.n;
      }
    }
    if (!earliestWallOut) {
      for (const p of seats) {
        if (wallsLeftOf(s, p) === 0) {
          earliestWallOut = { player: p, moveN: m.n };
          break;
        }
      }
    }
    totalMs[m.player] = (totalMs[m.player] ?? 0) + m.elapsedMs;
  }
  const out: Partial<GameMeta> = { earliestWallOut, totalMsA: totalMs["A"] ?? 0, totalMsB: totalMs["B"] ?? 0 };
  if (maxPath["A"] !== undefined) out.maxPathA = maxPath["A"];
  if (maxPath["B"] !== undefined) out.maxPathB = maxPath["B"];
  out.maxPathAtA = maxPathAt["A"];
  out.maxPathAtB = maxPathAt["B"];
  if (src.playerCount === 4) {
    out.totalMsC = totalMs["C"] ?? 0;
    out.totalMsD = totalMs["D"] ?? 0;
    out.maxPathC = maxPath["C"];
    out.maxPathD = maxPath["D"];
    out.maxPathAtC = maxPathAt["C"];
    out.maxPathAtD = maxPathAt["D"];
  }
  return out;
}

function readLS(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function persistSaved(mode: GameMode | null, aiLevel: AiLevel | null, config: GameConfig | null, state: GameState | null, seatConfig?: SeatConfig | null) {
  if (typeof window === "undefined") return;
  if (mode && config && state && !state.winner) {
    writeLS(LS_SAVED, JSON.stringify({ mode, aiLevel, config, state, seatConfig: seatConfig ?? null, savedAt: Date.now() }));
  } else {
    try {
      localStorage.removeItem(LS_SAVED);
    } catch {
      /* noop */
    }
  }
}

function refreshHasSaved(set: (partial: object) => void) {
  const raw = readLS(LS_SAVED);
  let ok = false;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { state: { winner: Player | null } };
      ok = !parsed?.state?.winner;
    } catch {
      ok = false;
    }
  }
  set({ hasSavedGame: ok });
}

export interface QuoridorStore {
  view: View;
  mode: GameMode | null;
  aiLevel: AiLevel | null;
  state: GameState | null;
  meta: GameMeta;
  online: OnlineSession | null;
  skin: SkinId;
  soundOn: boolean;
  config: GameConfig; // 版式规格：棋盘尺寸 + 每方挡板数 + 席位数
  seatConfig: SeatConfig | null; // 本地四人局：各席真人 / AI 档位
  archive: ArchiveEntry[];
  hasSavedGame: boolean;
  posterEntry: ArchiveEntry | null;
  posterOpen: boolean;
  /* 内部：提交一手（本地/AI 共用） */
  commitLocal: (payload: MovePayload) => { ok: boolean; reason?: RejectReason };

  setView: (v: View) => void;
  setSkin: (s: SkinId) => void;
  toggleSound: () => void;
  setConfig: (c: Partial<GameConfig>) => void;

  startGame: (mode: GameMode, aiLevel?: AiLevel, config?: Partial<GameConfig>, seatConfig?: SeatConfig) => void;
  resumeSaved: () => boolean;
  discardSaved: () => void;

  tryPawnMove: (to: Vec) => { ok: boolean; reason?: RejectReason };
  tryWallPlace: (x: number, y: number, o: Orientation) => { ok: boolean; reason?: RejectReason };
  applyAiMove: (payload: MovePayload, label?: string) => void;
  applyRemoteMove: (player: Player, payload: MovePayload, elapsedMs: number) => boolean;
  remoteResign: (player: Player) => void;
  /* 超时判负（本地/单机模式由时钟钩子触发） */
  applyTimeout: (loser: Player) => void;
  /* 在线：收到服务器 game-timeout 裁决（四人局为出局） */
  remoteTimeout: (loser: Player) => void;
  resyncOnline: (moves: Array<{ player: Player; move: MovePayload; elapsedMs?: number }>, settings?: { size?: number; wallsPerPlayer?: number; playerCount?: number; timeControl?: Partial<TimeControl> }, clock?: { serverNow?: number; turnStartAt?: number; totalMsA?: number; totalMsB?: number; totalMsC?: number; totalMsD?: number; seats?: SeatStatus[] }) => void;
  /* 重连后按服务器时钟校准本回合计时起点 */
  calibrateTurnClock: (serverNow: number, turnStartAt: number, clock?: { totalMsA?: number; totalMsB?: number; totalMsC?: number; totalMsD?: number }) => void;

  undo: () => void;
  resign: () => void;
  replayTo: (n: number | null) => void;

  setAiThinking: (v: boolean, label?: string) => void;

  setOnline: (s: OnlineSession | null) => void;
  updateOnline: (patch: Partial<OnlineSession>) => void;

  /* 客户端挂载后从 localStorage 恢复持久化偏好（皮肤/音效/规格/存档指示）。
   * 初始 state 必须确定性（不读 localStorage），否则 SSR HTML 与客户端首帧不一致 →
   * React hydration mismatch（如 skin-rb vs skin-bi）。本方法仅在 useEffect 中调用。 */
  hydrate: () => void;

  saveToArchive: () => ArchiveEntry | null;
  deleteArchiveEntry: (id: string) => void;
  openPoster: (e: ArchiveEntry) => void;
  closePoster: () => void;
}

/* 提交一手后的统一收尾：声音、统计、计时、动画计数 */
function updateAfterMove(
  get: () => QuoridorStore,
  set: (partial: Partial<QuoridorStore>) => void,
  next: GameState,
  elapsed: number,
) {
  const prev = get();
  const last = next.history[next.history.length - 1];
  if (last.payload.type === "pawn") playPawnClick();
  else if (last.payload.type === "wall") playWallSlide();

  const meta = prev.meta;
  const patch: Partial<GameMeta> = {
    turnStartedAt: Date.now(),
    animMove: meta.animMove + 1,
    lastReject: null,
    replayIndex: null,
  };
  /* 各席累计用时 / 归途峰值 */
  const seats = playersOf(next);
  for (const p of seats) {
    const d = shortestPathLength(next, p);
    const prevMax = maxPathOf(meta, p);
    const contributed = last.player === p ? elapsed : 0;
    const prevTotal = totalMsOf(meta, p);
    if (p === "A") {
      patch.totalMsA = prevTotal + contributed;
      patch.maxPathA = Math.max(prevMax, d);
      if (d > prevMax) patch.maxPathAtA = last.n;
    } else if (p === "B") {
      patch.totalMsB = prevTotal + contributed;
      patch.maxPathB = Math.max(prevMax, d);
      if (d > prevMax) patch.maxPathAtB = last.n;
    } else if (p === "C") {
      patch.totalMsC = prevTotal + contributed;
      patch.maxPathC = Math.max(prevMax, d);
      if (d > prevMax) patch.maxPathAtC = last.n;
    } else if (p === "D") {
      patch.totalMsD = prevTotal + contributed;
      patch.maxPathD = Math.max(prevMax, d);
      if (d > prevMax) patch.maxPathAtD = last.n;
    }
  }
  /* 最早耗尽挡板（各席） */
  if (!meta.earliestWallOut) {
    for (const p of seats) {
      if (wallsLeftOf(next, p) === 0) {
        patch.earliestWallOut = { player: p, moveN: last.n };
        break;
      }
    }
  }
  set({
    state: next,
    meta: { ...meta, ...patch },
  });
}

export const useQuoridor = create<QuoridorStore>((set, get) => ({
  view: "hero",
  mode: null,
  aiLevel: null,
  state: null,
  meta: initialMeta(),
  online: null,
  /* SSR 安全：初始值全部确定性（服务端/客户端首帧一致）；
   * localStorage 恢复统一延后到挂载后的 hydrate()。 */
  skin: "rb",
  soundOn: true,
  config: normalizeConfig(null),
  archive: [],
  hasSavedGame: false,
  posterEntry: null,
  posterOpen: false,
  seatConfig: null,

  commitLocal: (payload) => {
    const { state, meta } = get();
    if (!state || state.winner) return { ok: false, reason: "game-over" };
    const me = state.turn;
    const elapsed = Date.now() - meta.turnStartedAt;
    const r = applyPayload(state, me, payload, elapsed);
    if (!r.ok || !r.state) {
      playReject();
      return { ok: false, reason: r.reason };
    }
    const next = r.state;
    updateAfterMove(get, set, next, elapsed);
    persistSaved(get().mode, get().aiLevel, get().config, next, get().seatConfig);
    refreshHasSaved(set);
    return { ok: true };
  },

  setView: (v) => set({ view: v }),

  setSkin: (s) => {
    writeLS(LS_SKIN, s);
    set({ skin: s });
  },

  setConfig: (c) => {
    const cfg = normalizeConfig({ ...get().config, ...c });
    writeLS(LS_CONFIG, JSON.stringify(cfg));
    set({ config: cfg });
  },

  toggleSound: () => {
    const next = !get().soundOn;
    setSoundEnabled(next);
    writeLS(LS_SOUND, next ? "on" : "off");
    set({ soundOn: next });
  },

  startGame: (mode, aiLevel, config, seatConfig) => {
    const cfg = normalizeConfig(config ?? get().config);
    const state = initialGame(cfg);
    const meta = initialMeta(cfg.size);
    writeLS(LS_CONFIG, JSON.stringify(cfg));
    set({
      mode,
      aiLevel: aiLevel ?? null,
      config: cfg,
      seatConfig: seatConfig ?? null,
      state,
      meta,
      online: null,
      view: "game",
    });
    persistSaved(mode, aiLevel ?? null, cfg, state, seatConfig ?? null);
    refreshHasSaved(set);
  },

  resumeSaved: () => {
    const raw = readLS(LS_SAVED);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as {
        mode: GameMode;
        aiLevel: AiLevel | null;
        config?: { size?: number; wallsPerPlayer?: number; playerCount?: number };
        seatConfig?: SeatConfig | null;
        state: GameState;
      };
      if (!parsed?.state || parsed.state.winner) return false;
      const state = normalizeState(parsed.state);
      const cfg = normalizeConfig(
        parsed.config ?? { size: state.size, wallsPerPlayer: state.wallsStart, playerCount: state.playerCount },
      );
      const meta = { ...initialMeta(state.size), ...deriveStats(state) };
      set({
        mode: parsed.mode,
        aiLevel: parsed.aiLevel ?? null,
        config: cfg,
        seatConfig: parsed.seatConfig ?? null,
        state,
        meta,
        view: "game",
        online: null,
      });
      return true;
    } catch {
      return false;
    }
  },

  discardSaved: () => {
    persistSaved(null, null, null, null);
    set({ hasSavedGame: false });
  },

  tryPawnMove: (to) => {
    const { state, mode, online } = get();
    if (!state || state.winner) return { ok: false, reason: "game-over" };
    const me = state.turn;
    if (mode === "online" && online && me !== online.myPlayer) {
      return { ok: false, reason: "not-your-turn" };
    }
    const from = pawnOf(state, me);
    const legal = legalPawnMoves(state, me);
    if (!legal.some((v) => v.x === to.x && v.y === to.y)) {
      return { ok: false, reason: "illegal-pawn" };
    }
    return get().commitLocal({ type: "pawn", from, to: { ...to } });
  },

  tryWallPlace: (x, y, o) => {
    const { state, mode, online } = get();
    if (!state || state.winner) return { ok: false, reason: "game-over" };
    const me = state.turn;
    if (mode === "online" && online && me !== online.myPlayer) {
      return { ok: false, reason: "not-your-turn" };
    }
    const chk = checkWall(state, x, y, o, me);
    if (!chk.ok) {
      playReject();
      set({
        meta: { ...get().meta, lastReject: { x, y, o, reason: chk.reason!, t: Date.now() } },
      });
      return { ok: false, reason: chk.reason };
    }
    return get().commitLocal({ type: "wall", wall: { x, y, o, by: me } });
  },

  applyAiMove: (payload, label) => {
    const { state, meta, mode, seatConfig } = get();
    if (!state || state.winner) return;
    const me = state.turn;
    /* 四人局 AI 席位不耗时（与在线 AI 代打一致）；二人局沿用旧语义（思考期间钟照走） */
    const elapsed = state.playerCount === 4 && isSeatAi(seatConfig, me) ? 0 : Date.now() - meta.turnStartedAt;
    const r = applyPayload(state, me, payload, elapsed);
    if (!r.ok || !r.state) return;
    const next = r.state;
    updateAfterMove(get, set, next, elapsed);
    set({ meta: { ...get().meta, aiThinking: false, aiLabel: label ?? null } });
    persistSaved(mode, get().aiLevel, get().config, next, get().seatConfig);
    refreshHasSaved(set);
  },

  applyRemoteMove: (player, payload, elapsedMs) => {
    const { state } = get();
    if (!state || state.winner) return false;
    const r = applyPayload(state, player, payload, elapsedMs);
    if (!r.ok || !r.state) return false;
    const next = r.state;
    updateAfterMove(get, set, next, elapsedMs);
    persistSaved(get().mode, get().aiLevel, get().config, next, get().seatConfig);
    return true;
  },

  remoteResign: (player) => {
    const { state } = get();
    if (!state || state.winner) return;
    const next = applyResign(state, player);
    /* 四人局出局后棋局继续：重置回合计时并续存书签 */
    if (!next.winner) {
      set({ state: next, meta: { ...get().meta, aiThinking: false, turnStartedAt: Date.now() } });
      persistSaved(get().mode, get().aiLevel, get().config, next, get().seatConfig);
    } else {
      set({ state: next, meta: { ...get().meta, aiThinking: false } });
      persistSaved(null, null, null, null);
    }
  },

  applyTimeout: (loser) => {
    const { state } = get();
    if (!state || state.winner) return;
    const next = applyTimeout(state, loser);
    if (!next.winner) {
      set({ state: next, meta: { ...get().meta, aiThinking: false, turnStartedAt: Date.now() } });
      persistSaved(get().mode, get().aiLevel, get().config, next, get().seatConfig);
    } else {
      set({ state: next, meta: { ...get().meta, aiThinking: false } });
      persistSaved(null, null, null, null);
    }
  },

  remoteTimeout: (loser) => {
    const { state } = get();
    if (!state || state.winner) return;
    const next = applyTimeout(state, loser);
    if (!next.winner) {
      set({ state: next, meta: { ...get().meta, aiThinking: false, turnStartedAt: Date.now() } });
      persistSaved(get().mode, get().aiLevel, get().config, next, get().seatConfig);
    } else {
      set({ state: next, meta: { ...get().meta, aiThinking: false } });
      persistSaved(null, null, null, null);
    }
  },

  resyncOnline: (moves, settings, clock) => {
    // 由 relay 的着法记录重建局面（重连 / 加入已有房间）；规格以房主设置为准
    const cfg = normalizeConfig(settings ?? get().config);
    const built: Move[] = moves.map((m, i) => ({
      n: i + 1,
      player: m.player,
      notation: "",
      elapsedMs: m.elapsedMs ?? 0,
      t: 0,
      payload: m.move,
    }));
    const next = normalizeState(stateFromHistory(built, undefined, cfg));
    const stats = deriveStats(next);
    let meta = { ...initialMeta(next.size), ...stats };
    /* 服务器时钟校准：累计用时与当前回合起点（防双端时钟漂移） */
    if (clock) {
      if (typeof clock.totalMsA === "number" && clock.totalMsA >= 0) meta.totalMsA = clock.totalMsA;
      if (typeof clock.totalMsB === "number" && clock.totalMsB >= 0) meta.totalMsB = clock.totalMsB;
      if (next.playerCount === 4) {
        if (typeof clock.totalMsC === "number" && clock.totalMsC >= 0) meta.totalMsC = clock.totalMsC;
        if (typeof clock.totalMsD === "number" && clock.totalMsD >= 0) meta.totalMsD = clock.totalMsD;
      }
      if (typeof clock.serverNow === "number" && typeof clock.turnStartAt === "number" && !next.winner) {
        meta.turnStartedAt = Date.now() - Math.max(0, clock.serverNow - clock.turnStartAt);
      }
    }
    writeLS(LS_CONFIG, JSON.stringify(cfg));
    set({ config: cfg, state: next, meta: { ...meta, archived: false } });
  },

  calibrateTurnClock: (serverNow, turnStartAt, clock) => {
    const { state, meta } = get();
    if (!state || state.winner) return;
    const drift = Math.max(0, serverNow - turnStartAt);
    const patch: Partial<GameMeta> = {
      turnStartedAt: Date.now() - drift,
    };
    if (clock) {
      if (typeof clock.totalMsA === "number" && clock.totalMsA >= 0) patch.totalMsA = clock.totalMsA;
      if (typeof clock.totalMsB === "number" && clock.totalMsB >= 0) patch.totalMsB = clock.totalMsB;
      if (state.playerCount === 4) {
        if (typeof clock.totalMsC === "number" && clock.totalMsC >= 0) patch.totalMsC = clock.totalMsC;
        if (typeof clock.totalMsD === "number" && clock.totalMsD >= 0) patch.totalMsD = clock.totalMsD;
      }
    }
    set({ meta: { ...meta, ...patch } });
  },

  undo: () => {
    const { state, mode, meta, seatConfig } = get();
    if (!state || mode === "online") return;
    const cfg = { size: state.size, wallsPerPlayer: state.wallsStart, playerCount: state.playerCount };
    let history = state.history.slice();
    if (history.length === 0) return;
    history = history.slice(0, -1);
    if (mode === "ai") {
      // 撤到轮到人类（甲）为止：通常撤两手（AI 应手 + 你的上一手）
      let probe = stateFromHistory(history, undefined, cfg);
      while (probe.turn !== "A" && history.length > 0) {
        history = history.slice(0, -1);
        probe = stateFromHistory(history, undefined, cfg);
      }
    } else if (state.playerCount === 4 && seatConfig) {
      // 四人局：撤到轮到真人席位为止（跳过 AI 代打的手）
      let probe = stateFromHistory(history, undefined, cfg);
      while (isSeatAi(seatConfig, probe.turn) && history.length > 0) {
        history = history.slice(0, -1);
        probe = stateFromHistory(history, undefined, cfg);
      }
    }
    const next = stateFromHistory(history, undefined, cfg);
    const stats = deriveStats(next);
    set({
      state: next,
      meta: {
        ...meta,
        ...stats,
        replayIndex: null,
        lastReject: null,
        aiThinking: false,
        turnStartedAt: Date.now(),
      },
    });
    persistSaved(get().mode, get().aiLevel, get().config, next, get().seatConfig);
  },

  resign: () => {
    const { state, mode, online } = get();
    if (!state || state.winner) return;
    const player = mode === "online" && online ? online.myPlayer : state.turn;
    const next = applyResign(state, player);
    if (!next.winner) {
      /* 四人局出局后棋局继续 */
      set({ state: next, meta: { ...get().meta, turnStartedAt: Date.now() } });
      persistSaved(mode, get().aiLevel, get().config, next, get().seatConfig);
    } else {
      set({ state: next });
      persistSaved(null, null, null, null);
    }
  },

  replayTo: (n) => {
    const { state, meta } = get();
    if (!state) return;
    if (n == null || n >= state.history.length) {
      set({ meta: { ...meta, replayIndex: null } });
    } else {
      set({ meta: { ...meta, replayIndex: Math.max(0, n) } });
    }
  },

  setAiThinking: (v, label) => {
    const { meta } = get();
    set({ meta: { ...meta, aiThinking: v, aiLabel: label ?? meta.aiLabel } });
  },

  setOnline: (s) => set({ online: s }),
  updateOnline: (patch) => set({ online: get().online ? { ...get().online!, ...patch } : null }),

  saveToArchive: () => {
    const { state, mode, aiLevel, meta, archive, config, seatConfig, online } = get();
    if (!state || !state.winner || !mode || meta.archived) return null;
    const four = state.playerCount === 4;
    const aiNameOf = (p: Player): string => {
      if (mode === "ai" && aiLevel && p === "B") return AI_PROFILES[aiLevel].name;
      if (four && seatConfig?.[p]?.kind === "ai") return AI_PROFILES[seatConfig[p].level].name;
      if (four && mode === "online" && online?.seats) {
        const st = online.seats.find((s) => s.player === p);
        if (st?.isAi && st.aiLevel) return AI_PROFILES[st.aiLevel as AiLevel].name;
      }
      return "";
    };
    const labelOf = (p: Player, cn: string): string => {
      const ai = aiNameOf(p);
      if (ai) return `${ai} · ${cn}`;
      if (mode === "online" && online) return online.myPlayer === p ? `你 · ${cn}` : `棋友 · ${cn}`;
      if (mode === "ai") return p === "A" ? `你 · ${cn}` : cn;
      return four ? `真人 · ${cn}` : cn;
    };
    const labelA = labelOf("A", "甲");
    const labelB = labelOf("B", "乙");
    const labelC = four ? labelOf("C", "丙") : undefined;
    const labelD = four ? labelOf("D", "丁") : undefined;
    const entry: ArchiveEntry = {
      id: newEntryId(),
      date: Date.now(),
      mode,
      aiLevel: aiLevel ?? undefined,
      playerCount: state.playerCount,
      labelA,
      labelB,
      labelC,
      labelD,
      winner: state.winner,
      winReason: state.winReason,
      moveCount: state.history.length,
      durationMs: Date.now() - meta.startedAt,
      size: state.size,
      wallsPerPlayer: state.wallsStart,
      wallsUsedA: state.wallsStart - state.wallsA,
      wallsUsedB: state.wallsStart - state.wallsB,
      wallsUsedC: four ? state.wallsStart - (state.wallsC ?? 0) : undefined,
      wallsUsedD: four ? state.wallsStart - (state.wallsD ?? 0) : undefined,
      maxPathA: meta.maxPathA,
      maxPathB: meta.maxPathB,
      maxPathC: meta.maxPathC,
      maxPathD: meta.maxPathD,
      maxPathAtA: meta.maxPathAtA,
      maxPathAtB: meta.maxPathAtB,
      maxPathAtC: meta.maxPathAtC,
      maxPathAtD: meta.maxPathAtD,
      earliestWallOut: meta.earliestWallOut,
      moves: state.history,
    };
    const next = [entry, ...archive];
    saveArchive(next);
    persistSaved(null, null, config, null);
    set({ archive: next, meta: { ...meta, archived: true }, hasSavedGame: false });
    return entry;
  },

  deleteArchiveEntry: (id) => {
    const next = get().archive.filter((e) => e.id !== id);
    saveArchive(next);
    set({ archive: next });
  },

  hydrate: () => {
    const patch: Partial<QuoridorStore> = { archive: loadArchive() };
    const skin = readLS(LS_SKIN) as SkinId | null;
    if (skin && SKINS.some((s) => s.id === skin)) patch.skin = skin;
    const soundRaw = readLS(LS_SOUND);
    if (soundRaw !== null) {
      const on = soundRaw !== "off";
      patch.soundOn = on;
      setSoundEnabled(on);
    }
    try {
      const raw = readLS(LS_CONFIG);
      if (raw) patch.config = normalizeConfig(JSON.parse(raw) as Partial<GameConfig>);
    } catch {
      /* 忽略损坏的规格存档 */
    }
    set(patch);
    refreshHasSaved(set);
  },

  openPoster: (e) => set({ posterEntry: e, posterOpen: true }),
  closePoster: () => set({ posterOpen: false }),
}));
