"use client";

/* 03 在线对战 —— 创建房间（4 位房间码）/ 凭码入座 / 断线回座。
 * 经 socket relay 同步；双端各自校验着法合法性。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Copy, LogIn, DoorOpen, RefreshCw } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import {
  clearIdentity,
  createRoom,
  getSocket,
  joinRoom,
  leaveRoom,
  loadIdentity,
  resumeSession,
  saveIdentity,
  type PeerStatus,
} from "@/lib/online/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function RoomView() {
  const startGame = useQuoridor((s) => s.startGame);
  const setOnline = useQuoridor((s) => s.setOnline);
  const updateOnline = useQuoridor((s) => s.updateOnline);
  const resyncOnline = useQuoridor((s) => s.resyncOnline);
  const setView = useQuoridor((s) => s.setView);
  const { toast } = useToast();

  const [phase, setPhase] = useState<"idle" | "waiting" | "joining" | "connecting">("idle");
  const [session, setSession] = useState<{ roomCode: string; token: string; myPlayer: "A" | "B" } | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const bootRef = useRef(false);

  const enterGame = useCallback(
    (s: { roomCode: string; token: string; myPlayer: "A" | "B" }, moves: unknown[] = []) => {
      saveIdentity(s);
      startGame("online");
      setOnline({
        roomCode: s.roomCode,
        token: s.token,
        myPlayer: s.myPlayer,
        opponentConnected: s.myPlayer === "B",
        phase: "playing",
      });
      if (moves.length > 0) {
        resyncOnline(moves as never);
      }
    },
    [startGame, setOnline, resyncOnline],
  );

  /* 挂载：URL ?room= 预填 + 断线回座探测 */
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    try {
      const pre = new URLSearchParams(window.location.search).get("room");
      if (pre && /^\d{4}$/.test(pre)) {
        setTimeout(() => setJoinCode(pre), 0);
      }
    } catch {
      /* noop */
    }
    const id = loadIdentity();
    if (!id) return;
    setTimeout(() => setPhase("connecting"), 0);
    const socket = getSocket();
    const attempt = () => {
      resumeSession(id.roomCode, id.token, (res) => {
        if (res.ok) {
          const moves = res.moves ?? [];
          if (res.status === "playing" || moves.length > 0) {
            enterGame(id, moves);
          } else {
            // 房间还在等对手：回到等待屏
            setSession(id);
            setPhase("waiting");
            setOnline({
              roomCode: id.roomCode,
              token: id.token,
              myPlayer: id.myPlayer,
              opponentConnected: false,
              phase: "waiting",
            });
          }
        } else {
          clearIdentity();
          setPhase("idle");
          setError(res.error ?? "上次的房间已失效");
        }
      });
    };
    if (socket.connected) attempt();
    else {
      const t = setTimeout(attempt, 1200);
      socket.once("connect", () => {
        clearTimeout(t);
        attempt();
      });
    }
  }, [enterGame, setOnline]);

  /* 监听开局（房主等待对手入座） */
  useEffect(() => {
    const socket = getSocket();
    const onGameStart = () => {
      if (session) {
        enterGame(session);
      }
    };
    const onPeerStatus = (ps: PeerStatus) => {
      if (!session || ps.roomCode !== session.roomCode) return;
      const oppKey = session.myPlayer === "A" ? "bConnected" : "aConnected";
      updateOnline({ opponentConnected: !!ps[oppKey] });
    };
    socket.on("game-start", onGameStart);
    socket.on("peer-status", onPeerStatus);
    return () => {
      socket.off("game-start", onGameStart);
      socket.off("peer-status", onPeerStatus);
    };
  }, [session, enterGame, updateOnline]);

  const handleCreate = () => {
    setError(null);
    createRoom((res) => {
      if (!res.ok || !res.roomCode || !res.token) {
        setError(res.error ?? "建房失败，请检查连接");
        return;
      }
      const s = { roomCode: res.roomCode, token: res.token, myPlayer: "A" as const };
      saveIdentity(s);
      setSession(s);
      setPhase("waiting");
      setOnline({
        roomCode: s.roomCode,
        token: s.token,
        myPlayer: "A",
        opponentConnected: false,
        phase: "waiting",
      });
    });
  };

  const handleJoin = () => {
    const code = joinCode.trim();
    if (!/^\d{4}$/.test(code)) {
      setError("房间码是 4 位数字");
      return;
    }
    setError(null);
    setPhase("joining");
    joinRoom(code, (res) => {
      setPhase("idle");
      if (!res.ok || !res.roomCode || !res.token) {
        setError(res.error ?? "加入失败");
        return;
      }
      enterGame(
        { roomCode: res.roomCode, token: res.token, myPlayer: "B" },
        res.moves ?? [],
      );
    });
  };

  const shareLink = () =>
    `${typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}?room=${session?.roomCode ?? ""}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "邀请链接已复制", description: "把链接发给对手，凭码或点击皆可入座。" });
    } catch {
      toast({ title: "复制失败", description: `请手动复制：${shareLink()}` });
    }
  };

  const cancelRoom = () => {
    if (session) leaveRoom(session.roomCode, session.token);
    clearIdentity();
    setSession(null);
    setPhase("idle");
    setOnline(null);
  };

  return (
    <section aria-label="在线对战" className="mx-auto w-full max-w-4xl px-6 py-16 sm:px-10 sm:py-20">
      <header className="mb-10">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-4">
          <h2 className="font-display text-4xl font-black text-ink sm:text-5xl">
            在线对战
            <span className="ml-4 font-west text-base font-normal italic text-ink/55">across the margin</span>
          </h2>
          <span className="font-mono text-[10px] tracking-[0.4em] text-ink/50">CH.03</span>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/70">
          四位房间码开一间对局室，把链接或房码递给对手，隔纸对坐。着法经实时信道同步、
          双端各自校对；断线后纸面为你保留 5 分钟，凭原座可回。
        </p>
      </header>

      {error && (
        <p className="mb-6 border-l-4 border-qa bg-ink/[0.04] px-4 py-2.5 font-mono text-xs" style={{ borderColor: "var(--riso-red)", color: "var(--riso-red)" }}>
          {error}
        </p>
      )}

      {phase === "waiting" && session ? (
        /* 等待对手 */
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-2 border-ink bg-paper p-8 text-center"
          style={{ boxShadow: "6px 6px 0 var(--ink)" }}
        >
          <p className="font-mono text-[10px] tracking-[0.4em] text-ink/50">ROOM CODE · 房间码</p>
          <p className="tabular mt-4 font-display text-7xl font-black tracking-[0.08em] text-ink sm:text-8xl" aria-label={`房间码 ${session.roomCode}`}>
            {session.roomCode}
          </p>
          <p className="thinking-dots mt-5 font-mono text-xs tracking-[0.2em]" style={{ color: "var(--qa)" }}>
            ● 等待对手入座……
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button
              className="gap-2 bg-ink font-mono text-xs text-paper hover:bg-ink/85"
              onClick={copyLink}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {copied ? "已复制邀请链接" : "复制邀请链接"}
            </Button>
            <Button
              variant="outline"
              className="gap-2 border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper"
              onClick={cancelRoom}
            >
              关掉这间房
            </Button>
          </div>
          <p className="mt-6 break-all font-mono text-[10px] text-ink/45">{shareLink()}</p>
        </motion.div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          {/* 开房 */}
          <motion.div
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="border-2 border-ink bg-paper p-7"
            style={{ boxShadow: "6px 6px 0 var(--ink)" }}
          >
            <div className="flex items-center gap-3">
              <DoorOpen className="h-5 w-5" style={{ color: "var(--qa)" }} aria-hidden />
              <h3 className="font-display text-2xl font-black">开设对局室</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              生成 4 位房间码，你执甲（红）先行。对手凭码或链接入座后立即开局。
            </p>
            <Button
              className="mt-6 w-full gap-2 bg-qa font-mono text-sm font-bold text-paper hover:opacity-90"
              style={{ background: "var(--qa)" }}
              onClick={handleCreate}
              disabled={phase === "connecting"}
            >
              <DoorOpen className="h-4 w-4" aria-hidden />
              {phase === "connecting" ? "正在联络服务器……" : "开一间房 CREATE"}
            </Button>
          </motion.div>

          {/* 入座 */}
          <motion.div
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="border-2 border-ink bg-paper p-7"
            style={{ boxShadow: "6px 6px 0 var(--ink)" }}
          >
            <div className="flex items-center gap-3">
              <LogIn className="h-5 w-5" style={{ color: "var(--qb)" }} aria-hidden />
              <h3 className="font-display text-2xl font-black">凭码入座</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              输入对手递来的 4 位房间码，你执乙（蓝）后行。
            </p>
            <div className="mt-6 flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                inputMode="numeric"
                maxLength={4}
                placeholder="0000"
                aria-label="4 位房间码"
                className={cn(
                  "tabular w-full border-2 border-ink bg-transparent px-4 py-2.5 text-center text-2xl font-bold tracking-[0.35em] text-ink",
                  "focus:outline-none focus-visible:bg-ink/[0.04]",
                )}
              />
              <Button
                className="gap-2 bg-qb px-5 font-mono text-sm font-bold text-paper hover:opacity-90"
                style={{ background: "var(--qb)" }}
                onClick={handleJoin}
                disabled={joinCode.length !== 4 || phase === "joining"}
              >
                {phase === "joining" ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
                入座
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="mt-10 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 font-mono text-xs text-ink/60 hover:text-ink"
          onClick={() => setView("contents")}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          返回目录
        </Button>
        <p className="font-mono text-[10px] tracking-[0.25em] text-ink/40">
          实时信道 · 双端校对 · 断线 5 分钟回座
        </p>
      </div>
    </section>
  );
}
