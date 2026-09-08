/* 在线对战的同步钩子：挂在 GameView。
 * 职责：监听对手着法（本地校验后应用）、对端状态、重连恢复、发送本方着法。
 */

"use client";

import { useEffect, useRef } from "react";
import { useQuoridor } from "@/store/game-store";
import type { MovePayload, Player } from "@/lib/game/types";
import {
  getSocket,
  loadIdentity,
  resumeSession,
  sendMove,
  sendResign,
  type PeerStatus,
} from "@/lib/online/client";
import { useToast } from "@/hooks/use-toast";

export function useOnlineSync(active: boolean) {
  const mode = useQuoridor((s) => s.mode);
  const online = useQuoridor((s) => s.online);
  const state = useQuoridor((s) => s.state);
  const applyRemoteMove = useQuoridor((s) => s.applyRemoteMove);
  const remoteResign = useQuoridor((s) => s.remoteResign);
  const updateOnline = useQuoridor((s) => s.updateOnline);
  const resyncOnline = useQuoridor((s) => s.resyncOnline);
  const setView = useQuoridor((s) => s.setView);
  const { toast } = useToast();

  const lastSyncedLen = useRef(-1);
  const roomRef = useRef(online);

  useEffect(() => {
    roomRef.current = online;
  }, [online]);

  const enabled = active && mode === "online";

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
      const oppKey = cur.myPlayer === "A" ? "bConnected" : "aConnected";
      updateOnline({
        opponentConnected: !!ps[oppKey],
        phase: ps.status === "ended" ? "ended" : ps.status === "playing" ? "playing" : "waiting",
      });
    };

    const onOpponentResign = (data: { player: Player }) => {
      remoteResign(data.player);
      toast({ title: "对手认输", description: "这一局以认输收束。" });
    };

    const onConnect = () => {
      const cur = roomRef.current;
      if (cur && cur.phase !== "waiting") updateOnline({ phase: "playing" });
    };

    const onDisconnect = () => {
      const cur = roomRef.current;
      if (cur && cur.phase === "playing") updateOnline({ phase: "reconnecting" });
    };

    socket.on("opponent-move", onOpponentMove);
    socket.on("peer-status", onPeerStatus);
    socket.on("opponent-resign", onOpponentResign);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("opponent-move", onOpponentMove);
      socket.off("peer-status", onPeerStatus);
      socket.off("opponent-resign", onOpponentResign);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [enabled, applyRemoteMove, remoteResign, updateOnline, toast]);

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
      if (last.player === online.myPlayer && last.payload.type !== "resign") {
        sendMove(online.roomCode, online.token, last.payload, last.elapsedMs);
      }
      lastSyncedLen.current = len;
    } else if (len < lastSyncedLen.current) {
      lastSyncedLen.current = len;
    }
  }, [enabled, online, state]);

  /* 重连恢复：挂载时若 socket 已连但局面与 relay 不齐（或刷新后） */
  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const cur = roomRef.current;
    const identity = loadIdentity();
    if (!cur || !identity || identity.roomCode !== cur.roomCode) return;
    const attempt = () => {
      resumeSession(identity.roomCode, identity.token, (res) => {
        if (res.ok && res.moves) {
          const store = useQuoridor.getState();
          const localLen = store.state?.history.length ?? 0;
          if (res.moves.length > localLen || localLen === 0) {
            if (store.mode === "online") resyncOnline(res.moves);
          }
        } else if (!res.ok && res.error) {
          useQuoridor.getState().updateOnline({ phase: "error", error: res.error });
        }
      });
    };
    if (socket.connected) attempt();
    else socket.once("connect", attempt);
    return () => {
      socket.off("connect", attempt);
    };
  }, [enabled, resyncOnline]);

  /* 认输时通知对方 */
  useEffect(() => {
    if (!enabled || !online || !state?.winner) return;
    if (state.winReason === "resign") {
      const last = state.history[state.history.length - 1];
      if (last && last.player === online.myPlayer) {
        sendResign(online.roomCode, online.token);
      }
    }
  }, [enabled, online, state]);

  return null;
}
