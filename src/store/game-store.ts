/* 全局状态机：hero → contents → (setup/room) → game → result → archive
 * 对局状态完全可序列化，统一驱动悔棋、回放、在线同步与 localStorage 存档。
 */

"use client";

import { create } from "zustand";
import type { AiLevel, GameMode, GameState, Move, MovePayload, Player, SkinId, Vec } from "@/lib/game/types";
import { AI_PROFILES, initialGame } from "@/lib/game/types";
import type { Orientation } from "@/lib/game/types";
import { applyPayload, applyResign, checkWall, legalPawnMoves, shortestPathLength, stateFromHistory } from "@/lib/game/engine";
import type { RejectReason } from "@/lib/game/engine";
import {
  loadArchive,
  newEntryId,
  saveArchive,
  type ArchiveEntry,
} from "@/lib/game/archive";
import { playPawnClick, playReject, playWallSlide, setSoundEnabled } from "@/lib/game/sounds";

export type View = "hero" | "contents" | "setup" | "room" | "game" | "rules" | "archive";

export interface OnlineSession {
  roomCode: string;
  myPlayer: Player;
  token: string;
  opponentConnected: boolean;
  phase: "waiting" | "playing" | "ended" | "reconnecting" | "error";
  error?: string;
}

export interface GameMeta {
  startedAt: number;
  turnStartedAt: number;
  totalMsA: number;
  totalMsB: number;
  maxPathA: number;
  maxPathB: number;
  maxPathAtA?: number;
  maxPathAtB?: number;
  earliestWallOut?: { player: Player; moveN: number };
  aiThinking: boolean;
  aiLabel: string | null;
  replayIndex: number | null;
  lastReject: { x: number; y: number; o: Orientation; reason: RejectReason; t: number } | null;
  animMove: number;
  archived: boolean;
}

const LS_SKIN = "quoridor-skin";
const LS_SOUND = "quoridor-sound";
const LS_SAVED = "quoridor-saved-game";

function initialMeta(): GameMeta {
  const now = Date.now();
  return {
    startedAt: now,
    turnStartedAt: now,
    totalMsA: 0,
    totalMsB: 0,
    maxPathA: 8,
    maxPathB: 8,
    aiThinking: false,
    aiLabel: null,
    replayIndex: null,
    lastReject: null,
    animMove: 0,
    archived: false,
  };
}

/* 由历史重建统计（悔棋后重算） */
function deriveStats(state: GameState): Partial<GameMeta> {
  let s = initialGame();
  let maxPathA = 8;
  let maxPathB = 8;
  let maxPathAtA: number | undefined;
  let maxPathAtB: number | undefined;
  let earliestWallOut: GameMeta["earliestWallOut"];
  let totalMsA = 0;
  let totalMsB = 0;
  for (const m of state.history) {
    if (m.payload.type === "resign") {
      s = applyResign(s, m.player);
      continue;
    }
    const r = applyPayload(s, m.player, m.payload, m.elapsedMs);
    if (!r.ok || !r.state) break;
    s = r.state;
    const dA = shortestPathLength(s, "A");
    const dB = shortestPathLength(s, "B");
    if (dA > maxPathA) {
      maxPathA = dA;
      maxPathAtA = m.n;
    }
    if (dB > maxPathB) {
      maxPathB = dB;
      maxPathAtB = m.n;
    }
    if (!earliestWallOut && s.wallsA === 0) earliestWallOut = { player: "A", moveN: m.n };
    if (!earliestWallOut && s.wallsB === 0) earliestWallOut = { player: "B", moveN: m.n };
    if (m.player === "A") totalMsA += m.elapsedMs;
    else totalMsB += m.elapsedMs;
  }
  return { maxPathA, maxPathB, maxPathAtA, maxPathAtB, earliestWallOut, totalMsA, totalMsB };
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

function persistSaved(mode: GameMode | null, aiLevel: AiLevel | null, state: GameState | null) {
  if (typeof window === "undefined") return;
  if (mode && state && !state.winner) {
    writeLS(LS_SAVED, JSON.stringify({ mode, aiLevel, state, savedAt: Date.now() }));
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
  archive: ArchiveEntry[];
  hasSavedGame: boolean;
  posterEntry: ArchiveEntry | null;
  posterOpen: boolean;
  /* 内部：提交一手（本地/AI 共用） */
  commitLocal: (payload: MovePayload) => { ok: boolean; reason?: RejectReason };

  setView: (v: View) => void;
  setSkin: (s: SkinId) => void;
  toggleSound: () => void;

  startGame: (mode: GameMode, aiLevel?: AiLevel) => void;
  resumeSaved: () => boolean;
  discardSaved: () => void;

  tryPawnMove: (to: Vec) => { ok: boolean; reason?: RejectReason };
  tryWallPlace: (x: number, y: number, o: Orientation) => { ok: boolean; reason?: RejectReason };
  applyAiMove: (payload: MovePayload, label?: string) => void;
  applyRemoteMove: (player: Player, payload: MovePayload, elapsedMs: number) => boolean;
  remoteResign: (player: Player) => void;
  resyncOnline: (moves: Array<{ player: Player; move: MovePayload; elapsedMs?: number }>) => void;

  undo: () => void;
  resign: () => void;
  replayTo: (n: number | null) => void;

  setAiThinking: (v: boolean, label?: string) => void;

  setOnline: (s: OnlineSession | null) => void;
  updateOnline: (patch: Partial<OnlineSession>) => void;

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
  else playWallSlide();

  const dA = shortestPathLength(next, "A");
  const dB = shortestPathLength(next, "B");
  const meta = prev.meta;
  set({
    state: next,
    meta: {
      ...meta,
      totalMsA: meta.totalMsA + (last.player === "A" ? elapsed : 0),
      totalMsB: meta.totalMsB + (last.player === "B" ? elapsed : 0),
      maxPathA: Math.max(meta.maxPathA, dA),
      maxPathB: Math.max(meta.maxPathB, dB),
      maxPathAtA: dA > meta.maxPathA ? last.n : meta.maxPathAtA,
      maxPathAtB: dB > meta.maxPathB ? last.n : meta.maxPathAtB,
      earliestWallOut:
        meta.earliestWallOut ??
        (next.wallsA === 0
          ? { player: "A", moveN: last.n }
          : next.wallsB === 0
            ? { player: "B", moveN: last.n }
            : undefined),
      turnStartedAt: Date.now(),
      animMove: meta.animMove + 1,
      lastReject: null,
      replayIndex: null,
    },
  });
}

export const useQuoridor = create<QuoridorStore>((set, get) => ({
  view: "hero",
  mode: null,
  aiLevel: null,
  state: null,
  meta: initialMeta(),
  online: null,
  skin: (readLS(LS_SKIN) as SkinId) || "rb",
  soundOn: readLS(LS_SOUND) !== "off",
  archive: [],
  hasSavedGame: false,
  posterEntry: null,
  posterOpen: false,

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
    persistSaved(get().mode, get().aiLevel, next);
    refreshHasSaved(set);
    return { ok: true };
  },

  setView: (v) => set({ view: v }),

  setSkin: (s) => {
    writeLS(LS_SKIN, s);
    set({ skin: s });
  },

  toggleSound: () => {
    const next = !get().soundOn;
    setSoundEnabled(next);
    writeLS(LS_SOUND, next ? "on" : "off");
    set({ soundOn: next });
  },

  startGame: (mode, aiLevel) => {
    const state = initialGame();
    const meta = initialMeta();
    set({ mode, aiLevel: aiLevel ?? null, state, meta, online: null, view: "game" });
    persistSaved(mode, aiLevel ?? null, state);
    refreshHasSaved(set);
  },

  resumeSaved: () => {
    const raw = readLS(LS_SAVED);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { mode: GameMode; aiLevel: AiLevel | null; state: GameState };
      if (!parsed?.state || parsed.state.winner) return false;
      const meta = { ...initialMeta(), ...deriveStats(parsed.state) };
      set({
        mode: parsed.mode,
        aiLevel: parsed.aiLevel ?? null,
        state: parsed.state,
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
    persistSaved(null, null, null);
    set({ hasSavedGame: false });
  },

  tryPawnMove: (to) => {
    const { state, mode, online } = get();
    if (!state || state.winner) return { ok: false, reason: "game-over" };
    const me = state.turn;
    if (mode === "online" && online && me !== online.myPlayer) {
      return { ok: false, reason: "not-your-turn" };
    }
    const from = me === "A" ? state.posA : state.posB;
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
    const { state, meta } = get();
    if (!state || state.winner) return;
    const me = state.turn;
    const elapsed = Date.now() - meta.turnStartedAt;
    const r = applyPayload(state, me, payload, elapsed);
    if (!r.ok || !r.state) return;
    const next = r.state;
    updateAfterMove(get, set, next, elapsed);
    set({ meta: { ...get().meta, aiThinking: false, aiLabel: label ?? null } });
    persistSaved(get().mode, get().aiLevel, next);
    refreshHasSaved(set);
  },

  applyRemoteMove: (player, payload, elapsedMs) => {
    const { state } = get();
    if (!state || state.winner) return false;
    const r = applyPayload(state, player, payload, elapsedMs);
    if (!r.ok || !r.state) return false;
    const next = r.state;
    updateAfterMove(get, set, next, elapsedMs);
    persistSaved(get().mode, get().aiLevel, next);
    return true;
  },

  remoteResign: (player) => {
    const { state } = get();
    if (!state || state.winner) return;
    const next = applyResign(state, player);
    set({ state: next });
    persistSaved(null, null, null);
  },

  resyncOnline: (moves) => {
    // 由 relay 的看法定看板重建局面（重连 / 加入已有房间）
    const built: Move[] = moves.map((m, i) => ({
      n: i + 1,
      player: m.player,
      notation: "",
      elapsedMs: m.elapsedMs ?? 0,
      t: 0,
      payload: m.move,
    }));
    const next = stateFromHistory(built);
    const stats = deriveStats(next);
    const meta = { ...initialMeta(), ...stats };
    set({ state: next, meta: { ...meta, archived: false } });
  },

  undo: () => {
    const { state, mode, meta } = get();
    if (!state || mode === "online") return;
    let history = state.history.slice();
    if (history.length === 0) return;
    history = history.slice(0, -1);
    if (mode === "ai") {
      // 撤到轮到人类（甲）为止：通常撤两手（AI 应手 + 你的上一手）
      let probe = stateFromHistory(history);
      while (probe.turn !== "A" && history.length > 0) {
        history = history.slice(0, -1);
        probe = stateFromHistory(history);
      }
    }
    const next = stateFromHistory(history);
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
    persistSaved(get().mode, get().aiLevel, next);
  },

  resign: () => {
    const { state, mode, online } = get();
    if (!state || state.winner) return;
    const player = mode === "online" && online ? online.myPlayer : state.turn;
    const next = applyResign(state, player);
    set({ state: next });
    persistSaved(null, null, null);
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
    const { state, mode, aiLevel, meta, archive } = get();
    if (!state || !state.winner || meta.archived) return null;
    const labelA = mode === "ai" ? "你" : "甲";
    const labelB =
      mode === "ai" && aiLevel ? AI_PROFILES[aiLevel].name : mode === "online" ? "对手" : "乙";
    const entry: ArchiveEntry = {
      id: newEntryId(),
      date: Date.now(),
      mode,
      aiLevel: aiLevel ?? undefined,
      labelA,
      labelB,
      winner: state.winner,
      winReason: state.winReason,
      moveCount: state.history.length,
      durationMs: Date.now() - meta.startedAt,
      wallsUsedA: 10 - state.wallsA,
      wallsUsedB: 10 - state.wallsB,
      maxPathA: meta.maxPathA,
      maxPathB: meta.maxPathB,
      maxPathAtA: meta.maxPathAtA,
      maxPathAtB: meta.maxPathAtB,
      earliestWallOut: meta.earliestWallOut,
      moves: state.history,
    };
    const next = [entry, ...archive];
    saveArchive(next);
    persistSaved(null, null, null);
    set({ archive: next, meta: { ...meta, archived: true }, hasSavedGame: false });
    return entry;
  },

  deleteArchiveEntry: (id) => {
    const next = get().archive.filter((e) => e.id !== id);
    saveArchive(next);
    set({ archive: next });
  },

  openPoster: (e) => set({ posterEntry: e, posterOpen: true }),
  closePoster: () => set({ posterOpen: false }),
}));

/* 客户端初始化：音效开关 + 档案 */
if (typeof window !== "undefined") {
  setSoundEnabled(useQuoridor.getState().soundOn);
  useQuoridor.setState({ archive: loadArchive() });
  refreshHasSaved((p) => useQuoridor.setState(p as Partial<QuoridorStore>));
}
