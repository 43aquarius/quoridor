/* 在线对战的同步钩子：挂在 GameView。
 * 职责：监听其他席位着法（本地校验后应用）、对端状态、认输、判负/出局收束；
 * 重连恢复（关键路径）：socket 每次 connect（含自动重连成功）都凭原凭证
 * 重新 resume 入房——修复「重连后能发不能收」；局面落后 relay 时整体重同步。
 * 四人房（v4）：席位实况（seats）驱动边栏显示；AI 代打席位由服务器派发
 * ai-turn 事件给第一位在线真人（执行者），本钩子代为计算并上着；
 * 认输/超时/离席逾时为「出局」，各端本地重放出局着法，仅存一席时终局。
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuoridor, totalMsOf } from "@/store/game-store";
import type { AiLevel, MovePayload, Player } from "@/lib/game/types";
import { PLAYER_CN } from "@/lib/game/types";
import { requestAiMove } from "@/lib/game/ai-client";
import {
  getSocket,
  loadIdentity,
  resumeSession,
  sendHeartbeat,
  sendMove,
  sendResign,
  type AiTurnPayload,
  type GameStartPayload,
  type GameTimeoutPayload,
  type PeerStatus,
  type RoomExpiredPayload,
  type SeatStatus,
} from "@/lib/online/client";
import { useToast } from "@/hooks/use-toast";

/* resume 去抖：避免 connect 与挂载双触发时并发请求 */
let resumingAt = 0;

function aiLevelsFromSeats(seats: SeatStatus[] | undefined): Partial<Record<Player, AiLevel>> | undefined {
  if (!seats) return undefined;
  const out: Partial<Record<Player, AiLevel>> = {};
  let any = false;
  for (const s of seats) {
    if (s.isAi && s.aiLevel) {
      out[s.player] = s.aiLevel as AiLevel;
      any = true;
    }
  }
  return any ? out : undefined;
}

export function useOnlineSync(active: boolean) {
  const mode = useQuoridor((s) => s.mode);
  const online = useQuoridor((s) => s.online);
  const state = useQuoridor((s) => s.state);
  const applyRemoteMove = useQuoridor((s) => s.applyRemoteMove);
  const remoteResign = useQuoridor((s) => s.remoteResign);
  const remoteTimeout = useQuoridor((s) => s.remoteTimeout);
  const updateOnline = useQuoridor((s) => s.updateOnline);
  const resyncOnline = useQuoridor((s) => s.resyncOnline);
  const calibrateTurnClock = useQuoridor((s) => s.calibrateTurnClock);
  const { toast } = useToast();

  const lastSyncedLen = useRef(-1);
  const roomRef = useRef(online);
  /* AI 代打执行状态：待办着法 / 计算中互斥 */
  const pendingAiTurnRef = useRef<{
    player: Player;
    token: string;
    moveCount: number;
    aiLevel: AiLevel;
    at: number;
  } | null>(null);
  const aiBusyRef = useRef(false);

  useEffect(() => {
    roomRef.current = online;
  }, [online]);

  const enabled = active && mode === "online";

  /* 统一的回座逻辑：重新入房 + 局面对齐。
   * opts.manual：手动「刷新同步」——绕过去抖，并给出反馈与对端在线状态。 */
  const rejoinRoom = (opts?: { force?: boolean; manual?: boolean }) => {
    const cur = roomRef.current;
    const identity = loadIdentity();
    if (!cur || !identity || identity.roomCode !== cur.roomCode) return;
    const now = Date.now();
    if (!opts?.force && now - resumingAt < 700) return; // 去抖
    resumingAt = now;
    resumeSession(identity.roomCode, identity.token, (res) => {
      if (res.ok && res.moves) {
        const store = useQuoridor.getState();
        const localLen = store.state?.history.length ?? 0;
        if (res.moves.length > localLen || localLen === 0) {
          if (store.mode === "online") {
            resyncOnline(res.moves, res.settings, res.clock);
            lastSyncedLen.current = res.moves.length;
          }
        } else {
          lastSyncedLen.current = localLen;
          /* 局面已同步：仅按服务器校准本回合计时起点与累计用时 */
          if (res.clock && store.state && !store.state.winner) {
            calibrateTurnClock(res.clock.serverNow, res.clock.turnStartAt, res.clock);
          }
        }
        const patch: Partial<import("@/store/game-store").OnlineSession> = {
          phase: res.status === "ended" ? "ended" : res.status === "playing" ? "playing" : "waiting",
          error: undefined,
          reconnectAttempt: 0,
        };
        const seats = res.seats ?? res.peer?.seats;
        if (seats) {
          patch.seats = seats;
          patch.playerCount = seats.length === 4 ? 4 : 2;
          const lv = aiLevelsFromSeats(seats);
          if (lv) patch.aiLevels = lv;
          /* 二人局：对手在线；四人局：是否有任一其他真人在线 */
          if (seats.length === 4) {
            patch.opponentConnected = seats.some(
              (s) => s.player !== cur.myPlayer && s.present && !s.isAi && s.connected,
            );
          }
        }
        if (!seats || seats.length !== 4) {
          if (res.peer) {
            patch.opponentConnected = cur.myPlayer === "A" ? res.peer.bConnected : res.peer.aConnected;
          }
        }
        useQuoridor.getState().updateOnline(patch);
        if (opts?.manual) {
          const opp =
            seats && seats.length === 4
              ? seats.some((s) => s.player !== cur.myPlayer && s.present && !s.isAi && s.connected)
              : res.peer
                ? cur.myPlayer === "A"
                  ? res.peer.bConnected
                  : res.peer.aConnected
                : undefined;
          const statusText =
            res.status === "ended" ? "已收束" : res.status === "playing" ? "对局进行中" : "等待入座";
          const oppText =
            seats && seats.length === 4
              ? opp
                ? "同席棋友在线"
                : "同席无在线真人（AI 席位照常行棋）"
              : opp === undefined
                ? "对手状态未知"
                : opp
                  ? "对手在线"
                  : "对手掉线（5 分钟内可回座）";
          toast({
            title: "已重新校线 SYNC REFRESHED",
            description: `房间 ${identity.roomCode} · 已对齐 ${res.moves.length} 手 · ${statusText} · ${oppText}`,
          });
        }
      } else if (!res.ok && res.error) {
        // 房间已关或凭证失效：给出明确出路而不是死循环
        const store = useQuoridor.getState();
        if (store.state?.winner) return;
        useQuoridor.getState().updateOnline({ phase: "error", error: res.error });
        toast({
          title: opts?.manual ? "校线失败" : "回座失败",
          description: opts?.manual
            ? `${res.error}回到在线对战开一间新房吧。`
            : `${res.error}可回到在线对战开一间新房。`,
        });
      }
    });
  };

  /* —— AI 代打执行：局面与服务器对齐后代为计算并上着 —— */
  const attemptPendingAiMove = useCallback(() => {
    const job = pendingAiTurnRef.current;
    if (!job || aiBusyRef.current) return;
    const store = useQuoridor.getState();
    const cur = roomRef.current;
    if (!cur) {
      pendingAiTurnRef.current = null;
      return;
    }
    const st = store.state;
    if (!st || st.winner) {
      pendingAiTurnRef.current = null;
      return;
    }
    const len = st.history.length;
    if (len > job.moveCount) {
      // 该手已落（本端或他端先一步）
      pendingAiTurnRef.current = null;
      return;
    }
    if (len < job.moveCount) {
      // 本端落后：先核账对齐，之后 effect 会重试
      rejoinRoom();
      return;
    }
    if (st.turn !== job.player) {
      pendingAiTurnRef.current = null;
      return;
    }
    if (Date.now() - job.at > 20_000) {
      pendingAiTurnRef.current = null;
      return;
    }
    aiBusyRef.current = true;
    const roomCode = cur?.roomCode ?? "";
    requestAiMove(st, job.aiLevel)
      .then((decision) => {
        const s2 = useQuoridor.getState();
        const st2 = s2.state;
        if (
          decision &&
          st2 &&
          !st2.winner &&
          st2.history.length === job.moveCount &&
          st2.turn === job.player
        ) {
          const ok = s2.applyRemoteMove(job.player, decision.payload, 0);
          if (ok) {
            sendMove(roomCode, job.token, decision.payload, 0, 0);
          }
        }
      })
      .catch(() => {
        /* 计算失败：交由服务器周期重派 */
      })
      .finally(() => {
        aiBusyRef.current = false;
        pendingAiTurnRef.current = null;
      });
  }, [rejoinRoom]);

  /* 局面变化时重试待办的 AI 代打（重同步对齐后触发） */
  useEffect(() => {
    if (!enabled) return;
    if (pendingAiTurnRef.current) attemptPendingAiMove();
  }, [enabled, state, attemptPendingAiMove]);

  /* 监听服务器事件 */
  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();

    const onOpponentMove = (data: { player: Player; move: MovePayload; elapsedMs?: number }) => {
      const ok = applyRemoteMove(data.player, data.move, data.elapsedMs ?? 0);
      if (!ok) {
        // 双端各自校验：收到非法着法时拒绝并入
        toast({
          title: "收到一着无法通过的校对",
          description: "着法与本地棋盘冲突，已忽略。",
        });
      }
    };

    const onPeerStatus = (ps: PeerStatus) => {
      const cur = roomRef.current;
      if (!cur || ps.roomCode !== cur.roomCode) return;
      const patch: Partial<import("@/store/game-store").OnlineSession> = {
        opponentGcAt: ps.disconnectGcAt,
        phase:
          ps.status === "ended"
            ? "ended"
            : ps.status === "playing"
              ? roomRef.current?.phase === "reconnecting"
                ? "reconnecting" // 本方信道仍在重连时维持状态
                : "playing"
              : "waiting",
      };
      if (ps.seats && ps.seats.length === 4) {
        patch.seats = ps.seats;
        patch.playerCount = 4;
        const lv = aiLevelsFromSeats(ps.seats);
        if (lv) patch.aiLevels = lv;
        patch.opponentConnected = ps.seats.some(
          (s) => s.player !== cur.myPlayer && s.present && !s.isAi && s.connected,
        );
      } else {
        const oppKey = cur.myPlayer === "A" ? "bConnected" : "aConnected";
        patch.opponentConnected = !!ps[oppKey];
      }
      updateOnline(patch);
    };

    const onSeatUpdate = (data: { roomCode?: string; seats?: SeatStatus[] }) => {
      const cur = roomRef.current;
      if (!cur || !data || data.roomCode !== cur.roomCode) return;
      if (data.seats) {
        const patch: Partial<import("@/store/game-store").OnlineSession> = {
          seats: data.seats,
          playerCount: data.seats.length === 4 ? 4 : 2,
        };
        const lv = aiLevelsFromSeats(data.seats);
        if (lv) patch.aiLevels = lv;
        updateOnline(patch);
      }
    };

    const onOpponentResign = (data: { player: Player; ended?: boolean; playerCount?: 2 | 4 }) => {
      remoteResign(data.player);
      const four = data.playerCount === 4 || data.ended === false;
      toast({
        title: four ? "有席位认输出局" : "对手认输",
        description: four
          ? `${PLAYER_CN[data.player] ?? "?"}方认输出局${data.ended ? "，这一局就此收束" : "，棋局继续"}。`
          : "这一局以认输收束。",
      });
      if (data.ended) updateOnline({ phase: "ended" });
    };

    /* 服务器棋钟终审：超时判负（二人局） / 出局（四人局） */
    const onGameTimeout = (data: GameTimeoutPayload) => {
      const cur = roomRef.current;
      if (!cur || !data) return;
      if (data.clock) {
        calibrateTurnClock(data.clock.serverNow, data.clock.turnStartAt, data.clock);
      }
      remoteTimeout(data.loser);
      const four = data.playerCount === 4 || data.reason === "disconnect";
      updateOnline({ phase: data.ended || !four ? "ended" : "playing" });
      toast({
        title: four ? "棋钟终审 TIMEOUT" : "棋钟终审 TIMEOUT",
        description: four
          ? data.reason === "disconnect"
            ? `${PLAYER_CN[data.loser] ?? "?"}方离席逾五分钟未回，判出局${data.ended ? "，这一局就此收束" : "，棋局继续"}。`
            : data.reason === "total"
              ? `${PLAYER_CN[data.loser] ?? "?"}方总时长耗尽，判出局${data.ended ? "，这一局就此收束" : "，棋局继续"}。`
              : `${PLAYER_CN[data.loser] ?? "?"}方单步超时，判出局${data.ended ? "，这一局就此收束" : "，棋局继续"}。`
          : `${PLAYER_CN[data.loser] ?? "?"}方超时判负，这一局以超时收束。`,
      });
    };

    const onRoomExpired = (data: RoomExpiredPayload) => {
      const cur = roomRef.current;
      if (!cur || !data) return;
      remoteResign(data.loser);
      updateOnline({ phase: "ended" });
      toast({
        title: "对手未在保留时限内回座",
        description: "按编辑部规矩，离席逾五分钟判负。这一局以判负收束。",
      });
    };

    const onGameStart = (payload: GameStartPayload) => {
      const cur = roomRef.current;
      if (!cur) return;
      // 房主侧收到开局信号（含规格）；若本地尚未开局则据 relay 着法对齐
      if (payload.settings) {
        useQuoridor.getState().setConfig(payload.settings);
      }
      if (payload.seats) {
        const patch: Partial<import("@/store/game-store").OnlineSession> = {
          seats: payload.seats,
          playerCount: payload.seats.length === 4 ? 4 : 2,
          phase: "playing",
        };
        const lv = aiLevelsFromSeats(payload.seats);
        if (lv) patch.aiLevels = lv;
        useQuoridor.getState().updateOnline(patch);
      }
      if (payload.moves && payload.moves.length > 0) {
        const store = useQuoridor.getState();
        const localLen = store.state?.history.length ?? 0;
        if (store.mode === "online" && (payload.moves.length > localLen || localLen === 0)) {
          resyncOnline(payload.moves, payload.settings);
        }
      }
    };

    /* AI 代打派发：仅执行者收到（服务器私发） */
    const onAiTurn = (data: AiTurnPayload) => {
      const cur = roomRef.current;
      if (!cur || !data || data.roomCode !== cur.roomCode) return;
      if (data.moveCount < 0) return;
      const level = (data.aiLevel ?? cur.aiLevels?.[data.player]) as AiLevel | undefined;
      if (!level) return;
      const store = useQuoridor.getState();
      if (store.state?.winner) return;
      pendingAiTurnRef.current = {
        player: data.player,
        token: data.token,
        moveCount: data.moveCount,
        aiLevel: level,
        at: Date.now(),
      };
      attemptPendingAiMove();
    };

    /* 关键：每次 connect（首连或自动重连成功）都凭凭证重新入房 */
    const onConnect = () => {
      const cur = roomRef.current;
      if (!cur) return;
      // 静默回座：重新订阅房间事件；局面落后则整体重同步
      rejoinRoom();
    };

    const onReconnectAttempt = (attempt: number) => {
      const cur = roomRef.current;
      if (cur && cur.phase !== "waiting") {
        updateOnline({ phase: "reconnecting", reconnectAttempt: attempt });
      }
    };

    const onDisconnect = () => {
      const cur = roomRef.current;
      if (cur && (cur.phase === "playing" || cur.phase === "reconnecting")) {
        updateOnline({ phase: "reconnecting" });
      }
    };

    socket.on("opponent-move", onOpponentMove);
    socket.on("peer-status", onPeerStatus);
    socket.on("seat-update", onSeatUpdate);
    socket.on("opponent-resign", onOpponentResign);
    socket.on("game-timeout", onGameTimeout);
    socket.on("room-expired", onRoomExpired);
    socket.on("game-start", onGameStart);
    socket.on("ai-turn", onAiTurn);
    socket.on("connect", onConnect);
    socket.on("reconnect_attempt", onReconnectAttempt);
    socket.on("disconnect", onDisconnect);

    /* 网络恢复 / 页面回前台：若 socket 掉着则立即补连 */
    const onWindowOnline = () => {
      if (!socket.connected) socket.connect();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !socket.connected) socket.connect();
    };
    window.addEventListener("online", onWindowOnline);
    document.addEventListener("visibilitychange", onVisible);

    /* 周期心跳：手机息屏 / 弱网下维持 lastActivity，防止被误清扫 */
    const hb = setInterval(() => {
      const cur = roomRef.current;
      if (cur && (cur.phase === "playing" || cur.phase === "waiting")) {
        sendHeartbeat(cur.roomCode, cur.token);
      }
    }, 30_000);

    return () => {
      socket.off("opponent-move", onOpponentMove);
      socket.off("peer-status", onPeerStatus);
      socket.off("seat-update", onSeatUpdate);
      socket.off("opponent-resign", onOpponentResign);
      socket.off("game-timeout", onGameTimeout);
      socket.off("room-expired", onRoomExpired);
      socket.off("game-start", onGameStart);
      socket.off("ai-turn", onAiTurn);
      socket.off("connect", onConnect);
      socket.off("reconnect_attempt", onReconnectAttempt);
      socket.off("disconnect", onDisconnect);
      window.removeEventListener("online", onWindowOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(hb);
    };
  }, [enabled, applyRemoteMove, remoteResign, remoteTimeout, updateOnline, resyncOnline, calibrateTurnClock, toast, rejoinRoom, attemptPendingAiMove]);

  /* 发送本方着法：监听历史长度变化 */
  useEffect(() => {
    if (!enabled || !online || !state) return;
    const len = state.history.length;
    if (len === 0) {
      lastSyncedLen.current = 0;
      return;
    }
    if (lastSyncedLen.current === -1) {
      // 初次挂载：只记录，不发送（避免把历史重发一遍）
      lastSyncedLen.current = len;
      return;
    }
    if (len > lastSyncedLen.current) {
      const last = state.history[len - 1];
      if (
        last.player === online.myPlayer &&
        last.payload.type !== "resign" &&
        last.payload.type !== "timeout"
      ) {
        /* 上报本方累计用时（含本手），服务器据此记账与裁决 */
        const myTotal = totalMsOf(useQuoridor.getState().meta, online.myPlayer);
        sendMove(online.roomCode, online.token, last.payload, last.elapsedMs, myTotal);
      }
      lastSyncedLen.current = len;
    } else if (len < lastSyncedLen.current) {
      lastSyncedLen.current = len;
    }
  }, [enabled, online, state]);

  /* 挂载即对齐：socket 已连则立刻回座核账 */
  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    if (socket.connected) rejoinRoom();
    else socket.once("connect", rejoinRoom);
    return () => {
      socket.off("connect", rejoinRoom);
    };
     
  }, [enabled]);

  /* 认输时通知对方（四人局：出局着也须上报——游戏未必终局） */
  useEffect(() => {
    if (!enabled || !online || !state) return;
    const last = state.history[state.history.length - 1];
    if (!last || last.player !== online.myPlayer) return;
    if (last.payload.type === "resign") {
      sendResign(online.roomCode, online.token);
    }
  }, [enabled, online, state]);

  /* 手动刷新同步：对局页「刷新同步」按钮的入口。
   * 若本方信道已断则先补连，再强制回座核账并反馈对手在线状态。 */
  const rejoinRef = useRef(rejoinRoom);
  useEffect(() => {
    rejoinRef.current = rejoinRoom;
  });
  const requestResync = useCallback(() => {
    const socket = getSocket();
    if (!socket.connected) {
      useQuoridor.getState().updateOnline({ phase: "reconnecting" });
      socket.connect();
      /* 连上后 onConnect 会自动回座；此处再强制一次以确保立即核账 */
      socket.once("connect", () => rejoinRef.current({ force: true, manual: true }));
    } else {
      rejoinRef.current({ force: true, manual: true });
    }
  }, []);

  return { requestResync };
}
