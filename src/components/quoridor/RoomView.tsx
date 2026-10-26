"use client";

/* 04 在线对战 —— 对局大厅（空房实时列表）/ 创建房间（4 位房间码）/ 凭码入座 / 断线回座。
 * 房主先选版式与棋钟规格（双人 / 四人围桌），开房即锁定（可选是否公开陈列于大厅）；
 * 对手入座自动按同一规格摆盘；四人房由房主点「开局」（空座可设为编辑部 AI 代打）。
 * 经 socket relay 同步；双端各自校验着法合法性。
 * 棋钟：行棋方自报累计用时，服务器记账并在总时长耗尽 / 单步超时时终审（四人局为出局）。
 * 连接韧性：等待期掉线自动补连重新挂房；凭 localStorage 兜底身份误关标签页也能回座。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Copy, LogIn, DoorOpen, RefreshCw, Users, Radio, BookOpen, PenLine, Scissors, Crown, Landmark, User, Bot } from "lucide-react";
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
  setSeatAi,
  startFourGame,
  watchLobby,
  type GameStartPayload,
  type LobbyRoomEntry,
  type LobbyUpdatePayload,
  type PeerStatus,
  type RoomSettingsPayload,
  type SeatStatus,
} from "@/lib/online/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FormatPanel } from "./FormatPanel";
import { ClockPanel } from "./ClockPanel";
import { AI_PROFILES, PLAYER_CN, configLabel, playerColorVar, recommendedWalls, timeLabel, type AiLevel, type Player } from "@/lib/game/types";
import { stateFromHistory } from "@/lib/game/engine";

function sinceLabel(createdAt: number, serverNow: number): string {
  const secs = Math.max(0, Math.round((serverNow - createdAt) / 1000));
  if (secs < 60) return `${secs} 秒前`;
  return `${Math.floor(secs / 60)} 分钟前`;
}

/* 上一局是否已收束：服务端 ended / 终局着法（认输·超时）/ 重建局面已有胜者。
 * 关键修复：已收束的房不再自动带入对局页——否则重进「在线对战」会被
 * 已终的局面直接拉回「胜 / 负」结算画面。
 * 四人局：认输 / 超时是出局着而非终局，只能靠重建局面判定（winner 字段）。 */
function movesEnded(
  status: "waiting" | "playing" | "ended" | undefined,
  moves: Array<{ player: Player; move: unknown; elapsedMs?: number }>,
  settings?: RoomSettingsPayload,
): boolean {
  if (status === "ended") return true;
  if (!moves || moves.length === 0) return false;
  const four = settings?.playerCount === 4;
  if (!four) {
    const last = moves[moves.length - 1] as { move?: { type?: string } };
    if (last?.move?.type === "resign" || last?.move?.type === "timeout") return true;
  }
  try {
    const cfg = settings ?? undefined;
    const built = moves.map((m, i) => ({
      n: i + 1,
      player: m.player,
      notation: "",
      elapsedMs: m.elapsedMs ?? 0,
      t: 0,
      payload: m.move as never,
    }));
    return !!stateFromHistory(built, undefined, cfg).winner;
  } catch {
    return false;
  }
}

const LEVEL_ICONS: Record<AiLevel, React.ReactNode> = {
  1: <PenLine className="h-4 w-4" aria-hidden />,
  2: <Scissors className="h-4 w-4" aria-hidden />,
  3: <Crown className="h-4 w-4" aria-hidden />,
  4: <Landmark className="h-4 w-4" aria-hidden />,
};

/* 席位卡的 AI 档位循环：等待棋友 → 学徒 → 排字师 → 总编 → 社长 → 等待棋友 */
function nextAiChoice(cur: number): number {
  return cur >= 4 ? 0 : cur + 1;
}

const AI_CHOICE_LABEL: Record<number, string> = {
  0: "等待棋友",
  1: "学徒代打",
  2: "排字师代打",
  3: "总编代打",
  4: "社长代打",
};

export function RoomView() {
  const startGame = useQuoridor((s) => s.startGame);
  const setOnline = useQuoridor((s) => s.setOnline);
  const updateOnline = useQuoridor((s) => s.updateOnline);
  const resyncOnline = useQuoridor((s) => s.resyncOnline);
  const setView = useQuoridor((s) => s.setView);
  const config = useQuoridor((s) => s.config);
  const setConfig = useQuoridor((s) => s.setConfig);
  const { toast } = useToast();

  const [phase, setPhase] = useState<"idle" | "waiting" | "joining" | "connecting">("idle");
  const [session, setSession] = useState<{ roomCode: string; token: string; myPlayer: Player; isPublic?: boolean } | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [lobbyRooms, setLobbyRooms] = useState<LobbyRoomEntry[]>([]);
  const [lobbyLive, setLobbyLive] = useState(false);
  /* 四人等待房席位实况（host 与 guest 共用的只读视图；host 有点击权） */
  const [seatStates, setSeatStates] = useState<SeatStatus[] | null>(null);
  const [starting, setStarting] = useState(false);
  const bootRef = useRef(false);
  const sessionRef = useRef(session);
  const phaseRef = useRef(phase);
  /* 开房时服务器锁定的规格（后续本地切换不影响已开之房；开局时以它为准） */
  const roomSettingsRef = useRef<RoomSettingsPayload | null>(null);

  useEffect(() => {
    sessionRef.current = session;
    phaseRef.current = phase;
  }, [session, phase]);

  /* 席位卡点击（仅房主、仅等待期）：循环 AI 档位 / 恢复等棋友 */
  const cycleSeat = (seat: SeatStatus) => {
    const cur = sessionRef.current;
    if (!cur || cur.myPlayer !== "A" || phaseRef.current !== "waiting") return;
    if (seat.player === "A") return; // 房主自座不可改
    if (seat.present) return; // 已有真人入座
    const next = nextAiChoice(seat.isAi ? (seat.aiLevel ?? 0) : 0);
    setSeatAi(cur.roomCode, cur.token, seat.player, next, (res) => {
      if (!res.ok) {
        toast({ title: "席位设置未通过", description: res.error ?? "请稍后再试。" });
        return;
      }
      if (res.seats) setSeatStates(res.seats);
      toast({
        title: `座位 ${PLAYER_CN[seat.player]} 已调整为 ${AI_CHOICE_LABEL[next]}`,
        description: next === 0 ? "该座重新等待棋友凭码入座。" : `${AI_PROFILES[next as AiLevel].brief}`,
      });
    });
  };

  const enterGame = useCallback(
    (
      s: { roomCode: string; token: string; myPlayer: Player },
      moves: Array<{ player: Player; move: unknown; elapsedMs?: number }> = [],
      settings?: RoomSettingsPayload,
      clock?: { serverNow?: number; turnStartAt?: number; totalMsA?: number; totalMsB?: number; totalMsC?: number; totalMsD?: number },
      seats?: SeatStatus[],
    ) => {
      saveIdentity(s);
      const useSettings = settings ?? {
        size: config.size,
        wallsPerPlayer: config.wallsPerPlayer,
        playerCount: config.playerCount,
        timeControl: config.timeControl,
      };
      startGame("online", undefined, useSettings);
      const aiLevels: Partial<Record<Player, AiLevel>> = {};
      let anyAi = false;
      if (seats) {
        for (const st of seats) {
          if (st.isAi && st.aiLevel) {
            aiLevels[st.player] = st.aiLevel as AiLevel;
            anyAi = true;
          }
        }
      }
      setOnline({
        roomCode: s.roomCode,
        token: s.token,
        myPlayer: s.myPlayer,
        opponentConnected: s.myPlayer === "B" ? true : s.myPlayer !== "A",
        phase: "playing",
        playerCount: useSettings.playerCount,
        seats,
        aiLevels: anyAi ? aiLevels : undefined,
      });
      if (moves.length > 0) {
        resyncOnline(moves as never, useSettings, clock);
      }
    },
    [startGame, setOnline, resyncOnline, config],
  );

  /* 挂载：URL ?room= 预填 + 断线回座探测（sessionStorage 主、localStorage 备） */
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
          if (movesEnded(res.status, moves, res.settings)) {
            /* 修复：上一局已收束——不再回座拉回结算画面，留在开新局的页面 */
            clearIdentity();
            setOnline(null);
            setPhase("idle");
            setNotice(`上一局（房间 ${id.roomCode}）已收束。已存档的棋谱可在「棋谱档案馆」重读；也可即刻开一间新房再战。`);
            return;
          }
          if (res.status === "playing" || moves.length > 0) {
            enterGame(id, moves, res.settings, res.clock, res.seats ?? res.peer?.seats);
          } else {
            // 房间还在等对手：回到等待屏
            setSession(id);
            setPhase("waiting");
            setSeatStates(res.seats ?? null);
            setOnline({
              roomCode: id.roomCode,
              token: id.token,
              myPlayer: id.myPlayer,
              opponentConnected: false,
              phase: "waiting",
              playerCount: res.settings?.playerCount,
              seats: res.seats,
            });
            /* 等待屏的版式按房间规格对齐显示 */
            if (res.settings) {
              setConfig({
                size: res.settings.size,
                wallsPerPlayer: res.settings.wallsPerPlayer,
                playerCount: res.settings.playerCount,
                timeControl: res.settings.timeControl,
              });
            }
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
      const t = setTimeout(attempt, 1600);
      socket.once("connect", () => {
        clearTimeout(t);
        attempt();
      });
    }
     
  }, []);

  /* —— 大厅：订阅空房列表（本页期间实时更新） —— */
  useEffect(() => {
    const stop = watchLobby(
      (payload: LobbyUpdatePayload) => {
        setLobbyRooms(payload.rooms ?? []);
        setLobbyLive(true);
      },
      (snapshot: LobbyUpdatePayload) => {
        setLobbyRooms(snapshot.rooms ?? []);
        setLobbyLive(true);
      },
    );
    return () => {
      stop();
    };
  }, []);

  /* 监听开局（房主等待对手入座 / 四人房房主点开局）；等待期掉线自动补连重新挂房 */
  useEffect(() => {
    const socket = getSocket();
    const onGameStart = (payload: GameStartPayload) => {
      const cur = sessionRef.current;
      if (cur) {
        enterGame(cur, payload.moves ?? [], payload.settings, payload.clock, payload.seats);
      }
    };
    const onPeerStatus = (ps: PeerStatus) => {
      const cur = sessionRef.current;
      if (!cur || ps.roomCode !== cur.roomCode) return;
      if (ps.seats) setSeatStates(ps.seats);
      if (ps.seats && ps.seats.length === 4) {
        updateOnline({
          seats: ps.seats,
          playerCount: 4,
          opponentConnected: ps.seats.some((s) => s.player !== cur.myPlayer && s.present && !s.isAi && s.connected),
        });
      } else {
        const oppKey = cur.myPlayer === "A" ? "bConnected" : "aConnected";
        updateOnline({ opponentConnected: !!ps[oppKey] });
      }
    };
    const onSeatUpdate = (data: { roomCode?: string; seats?: SeatStatus[] }) => {
      const cur = sessionRef.current;
      if (!cur || !data || data.roomCode !== cur.roomCode) return;
      if (data.seats) setSeatStates(data.seats);
    };
    /* 等待屏掉线重连：重新 resume 挂回房间，保证开局信号能送达 */
    const onConnect = () => {
      const cur = sessionRef.current;
      if (cur && phaseRef.current === "waiting") {
        resumeSession(cur.roomCode, cur.token, () => {
          /* 回座结果由 peer-status / game-start / seat-update 驱动界面 */
        });
      }
    };
    const onDisconnect = () => {
      const cur = sessionRef.current;
      if (cur && phaseRef.current === "waiting") {
        setPhase("connecting");
      }
    };
    socket.on("game-start", onGameStart);
    socket.on("peer-status", onPeerStatus);
    socket.on("seat-update", onSeatUpdate);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("game-start", onGameStart);
      socket.off("peer-status", onPeerStatus);
      socket.off("seat-update", onSeatUpdate);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [enterGame, updateOnline]);

  const four = config.playerCount === 4;

  const switchPlayerCount = (count: 2 | 4) => {
    setConfig({ playerCount: count, wallsPerPlayer: recommendedWalls(config.size, count) });
  };

  const handleCreate = () => {
    setError(null);
    setNotice(null);
    createRoom(
      {
        size: config.size,
        wallsPerPlayer: config.wallsPerPlayer,
        playerCount: config.playerCount,
        timeControl: config.timeControl,
      },
      isPublic,
      (res) => {
        if (!res.ok || !res.roomCode || !res.token) {
          setError(res.error ?? "建房失败，请检查连接");
          return;
        }
        const s = { roomCode: res.roomCode, token: res.token, myPlayer: "A" as Player, isPublic };
        roomSettingsRef.current = res.settings ?? null;
        saveIdentity(s);
        setSession(s);
        setPhase("waiting");
        setSeatStates(res.seats ?? null);
        setOnline({
          roomCode: s.roomCode,
          token: s.token,
          myPlayer: "A",
          opponentConnected: false,
          phase: "waiting",
          playerCount: config.playerCount,
          seats: res.seats,
        });
        toast({
          title: `房间 ${s.roomCode} 已开`,
          description: `开本 ${configLabel({ size: res.settings?.size ?? config.size, wallsPerPlayer: res.settings?.wallsPerPlayer ?? config.wallsPerPlayer, playerCount: config.playerCount })} · ${timeLabel(res.settings?.timeControl ?? config.timeControl)}已锁定${isPublic ? "，已陈列于大厅" : "（私密房，凭码入座）"}${four ? "。等待棋友入座，或把空座设为编辑部 AI 代打后开局。" : "。"}`,
        });
      },
    );
  };

  const joinByCode = useCallback(
    (code: string) => {
      if (!/^\d{4}$/.test(code)) {
        setError("房间码是 4 位数字");
        return;
      }
      setError(null);
      setNotice(null);
      setPhase("joining");
      joinRoom(code, (res) => {
        setPhase("idle");
        if (!res.ok || !res.roomCode || !res.token) {
          setError(res.error ?? "加入失败");
          return;
        }
        const s = { roomCode: res.roomCode, token: res.token, myPlayer: (res.player ?? "B") as Player };
        /* 四人围桌：入座 ≠ 开局 —— 留在等待屏等房主点开局（game-start 驱动入局） */
        if (res.settings?.playerCount === 4 && (res.moves ?? []).length === 0) {
          saveIdentity(s);
          setSession(s);
          setPhase("waiting");
          setSeatStates(res.seats ?? null);
          setOnline({
            roomCode: s.roomCode,
            token: s.token,
            myPlayer: s.myPlayer,
            opponentConnected: true,
            phase: "waiting",
            playerCount: 4,
            seats: res.seats,
          });
          toast({
            title: `已入座房间 ${s.roomCode}`,
            description: `你执${PLAYER_CN[s.myPlayer]}。等房主凑齐席位（或设 AI 代打）点开局后自动翻盘。`,
          });
          return;
        }
        enterGame(s, res.moves ?? [], res.settings, res.clock, res.seats);
      });
    },
    [enterGame, toast],
  );

  const handleJoin = () => joinByCode(joinCode.trim());

  /* 四人房房主开局：四座齐备（真人或 AI） */
  const handleStartFour = () => {
    const cur = sessionRef.current;
    if (!cur || cur.myPlayer !== "A") return;
    setStarting(true);
    startFourGame(cur.roomCode, cur.token, (res) => {
      setStarting(false);
      if (!res.ok) {
        toast({ title: "开局未获通过", description: res.error ?? "请检查座位配置。" });
        return;
      }
      /* game-start 广播会驱动所有人（含本端）进入对局页；此处兜底直接入局（以开房时锁定的规格为准） */
      const useSettings =
        roomSettingsRef.current ?? {
          size: config.size,
          wallsPerPlayer: config.wallsPerPlayer,
          playerCount: 4,
          timeControl: config.timeControl,
        };
      enterGame(cur, [], useSettings, undefined, seatStates ?? undefined);
    });
  };

  const shareLink = () =>
    `${typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}?room=${session?.roomCode ?? ""}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "邀请链接已复制", description: "把链接发给棋友，凭码或点击皆可入座。" });
    } catch {
      toast({ title: "复制失败", description: `请手动复制：${shareLink()}` });
    }
  };

  const cancelRoom = () => {
    if (session) leaveRoom(session.roomCode, session.token);
    clearIdentity();
    setSession(null);
    setPhase("idle");
    setSeatStates(null);
    roomSettingsRef.current = null;
    setOnline(null);
  };

  /* 四人等待房：是否所有座都已就位（真人或 AI） */
  const seatsReady =
    four &&
    (seatStates ?? []).length === 4 &&
    (seatStates ?? []).every((st) => st.player === "A" || st.present || st.isAi);
  const iAmHost = session?.myPlayer === "A";

  return (
    <section aria-label="在线对战" className="mx-auto w-full max-w-4xl px-6 py-16 sm:px-10 sm:py-20">
      <header className="mb-10">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-4">
          <h2 className="font-display text-4xl font-black text-ink sm:text-5xl">
            在线对战
            <span className="ml-4 font-west text-base font-normal italic text-ink/55">across the margin</span>
          </h2>
          <span className="font-mono text-[10px] tracking-[0.4em] text-ink/50">CH.04</span>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/70">
          四位房间码开一间对局室，或从大厅挑一间空房直接入座。着法经实时信道同步、
          双端各自校对；断线后纸面为你保留 5 分钟，刷新、误关标签页或换网都能凭原座回局。
          挂棋钟的房间由服务器终审计时，总时长耗尽或单步超时即判负；四人围桌为出局制，
          一人掉线不散桌，空座还能交给编辑部 AI 代打。
        </p>
      </header>

      {error && (
        <p className="mb-6 border-l-4 border-qa bg-ink/[0.04] px-4 py-2.5 font-mono text-xs" style={{ borderColor: "var(--riso-red)", color: "var(--riso-red)" }}>
          {error}
        </p>
      )}

      {notice && !error && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-l-4 border-ink bg-ink/[0.04] px-4 py-2.5">
          <p className="font-mono text-xs leading-relaxed text-ink/75">{notice}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-ink bg-transparent font-mono text-[11px] hover:bg-ink hover:text-paper"
              onClick={() => setView("archive")}
            >
              <BookOpen className="h-3 w-3" aria-hidden />
              去档案馆
            </Button>
            <button
              type="button"
              aria-label="关闭提示"
              className="font-mono text-[11px] text-ink/40 hover:text-ink"
              onClick={() => setNotice(null)}
            >
              ✕
            </button>
          </div>
        </div>
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
          <p className="mt-3 font-mono text-[11px] text-ink/55">
            开本已锁定 · {configLabel(roomSettingsRef.current ?? config)} · {timeLabel((roomSettingsRef.current ?? config).timeControl)}
          </p>
          <p className="mt-2 font-mono text-[11px]" style={{ color: session.isPublic ? "var(--qb)" : "var(--ink)" }}>
            {session.isPublic ? "此房已陈列于大厅，等待过路棋手入座" : "私密房：对手须凭码或链接入座"}
          </p>

          {/* 四人围桌：席位实况 + 房主可设 AI 代打 + 开局 */}
          {four && (
            <div className="mt-6 border-t border-dashed border-ink/40 pt-5">
              <p className="font-mono text-[10px] tracking-[0.3em] text-ink/50">
                围桌席位 SEATS · 甲→丙→乙→丁 顺时针
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2.5 text-left sm:grid-cols-4">
                {(seatStates ?? []).map((st) => {
                  const color = playerColorVar(st.player);
                  const canCycle = iAmHost && st.player !== "A" && !st.present;
                  return (
                    <button
                      key={st.player}
                      type="button"
                      disabled={!canCycle}
                      onClick={() => cycleSeat(st)}
                      title={canCycle ? "点击切换：等棋友 → 学徒 → 排字师 → 总编 → 社长 → 等棋友" : undefined}
                      className={cn(
                        "flex min-h-[104px] flex-col border-2 p-3 transition-transform",
                        canCycle && "hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none",
                        st.present ? "border-ink" : "border-ink/40",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} aria-hidden />
                        <span className="font-display text-lg font-black text-ink">{PLAYER_CN[st.player]}</span>
                        {st.player === "A" && <span className="font-mono text-[8px] tracking-[0.2em] text-ink/45">房主·你</span>}
                      </span>
                      {st.present ? (
                        <span className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-ink/70">
                          <User className="h-3.5 w-3.5" aria-hidden />
                          {st.player === session.myPlayer ? "你已入座" : "棋友已入座"}
                          {!st.connected && <span style={{ color: "var(--riso-red)" }}>· 掉线</span>}
                        </span>
                      ) : st.isAi ? (
                        <span className="mt-2 flex items-center gap-1.5 font-mono text-[10px]" style={{ color }}>
                          {LEVEL_ICONS[(st.aiLevel ?? 1) as AiLevel]}
                          {AI_PROFILES[(st.aiLevel ?? 1) as AiLevel].name}代打
                        </span>
                      ) : (
                        <span className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-ink/45">
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          等待棋友{st.player === "A" ? "" : iAmHost ? "（点击设 AI）" : ""}
                        </span>
                      )}
                      <span className="mt-auto pt-2 font-mono text-[8px] leading-relaxed tracking-[0.12em] text-ink/35">
                        {st.isAi ? "开局后由服务器派发在线真人代为执子" : st.present ? "就位" : "凭码入座或 AI 代打"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {iAmHost ? (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    className="gap-2 bg-qa px-6 font-mono text-sm font-bold text-paper hover:opacity-90"
                    style={{ background: "var(--qa)" }}
                    disabled={!seatsReady || starting}
                    onClick={handleStartFour}
                    title={seatsReady ? "四座齐备，翻开棋盘" : "尚有空座：等棋友入座，或把空座设为编辑部 AI 代打"}
                  >
                    <DoorOpen className="h-4 w-4" aria-hidden />
                    {starting ? "正在开局……" : seatsReady ? "开局 START" : "尚有空座，暂不能开局"}
                  </Button>
                  <span className="font-mono text-[10px] text-ink/45">
                    {seatsReady ? "四座齐备 · 点击即开局" : "把空座点成编辑部 AI 代打，或等棋友凭码入座"}
                  </span>
                </div>
              ) : (
                <p className="thinking-dots mt-5 font-mono text-xs tracking-[0.2em]" style={{ color: "var(--qb)" }}>
                  ● 已入座 · 等待房主开局……
                </p>
              )}
            </div>
          )}

          {!four && (
            <p className="thinking-dots mt-5 font-mono text-xs tracking-[0.2em]" style={{ color: "var(--qa)" }}>
              ● 等待对手入座……
            </p>
          )}

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
        <div className="space-y-8">
          {/* —— 席位形态切换：双人对坐 / 四人围桌 —— */}
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="对局席位形态">
            {([2, 4] as const).map((count) => {
              const active = config.playerCount === count;
              return (
                <button
                  key={count}
                  type="button"
                  aria-pressed={active}
                  onClick={() => switchPlayerCount(count)}
                  className={cn(
                    "flex items-center gap-3 border-2 p-4 text-left transition-transform duration-150",
                    "hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none",
                    active ? "border-ink bg-ink text-paper" : "border-ink/45 bg-paper text-ink hover:border-ink",
                  )}
                  style={{ boxShadow: active ? "5px 5px 0 var(--ink)" : "none" }}
                >
                  <span className={cn("flex h-11 w-11 items-center justify-center border", active ? "border-paper/60" : "border-ink/50")}>
                    {count === 2 ? <Users className="h-5 w-5" aria-hidden /> : <Bot className="h-5 w-5" aria-hidden />}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-display text-xl font-black">
                      {count === 2 ? "双人对坐" : "四人围桌"}
                    </span>
                    <span className={cn("mt-0.5 font-mono text-[9px] tracking-[0.15em]", active ? "text-paper/65" : "text-ink/50")}>
                      {count === 2 ? "DUEL · 一对一，入座即开局" : "FOUR-TABLE · 四席围坐，房主开局"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* —— 对局大厅：实时空房列表 —— */}
          <section
            aria-label="对局大厅"
            className="border-2 border-ink bg-paper"
            style={{ boxShadow: "6px 6px 0 var(--ink)" }}
          >
            <header className="flex items-center justify-between border-b border-ink/30 px-4 py-2.5 sm:px-5">
              <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-ink/55">
                <Users className="h-3.5 w-3.5" aria-hidden />
                对局大厅 THE LOBBY
              </span>
              <span className="flex items-center gap-2 font-mono text-[10px] text-ink/45">
                {lobbyLive ? (
                  <span className="flex items-center gap-1.5" style={{ color: "var(--qb)" }}>
                    <Radio className="h-3 w-3 animate-pulse" aria-hidden />
                    LIVE · {lobbyRooms.length} 间空房
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
                    正在联络大厅……
                  </span>
                )}
              </span>
            </header>
            <div className="scroll-ink max-h-[300px] overflow-y-auto">
              {lobbyRooms.length === 0 ? (
                <p className="px-5 py-8 text-center font-mono text-[11px] leading-relaxed text-ink/45">
                  此刻大厅空无一房。
                  <br />
                  开一间公开房，纸面自会等人。
                </p>
              ) : (
                <ul className="divide-y divide-ink/20">
                  {lobbyRooms.map((r) => (
                    <li
                      key={r.code}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-ink/[0.03] sm:px-5"
                    >
                      <span className="tabular font-display text-2xl font-black tracking-[0.1em] text-ink" aria-label={`房间 ${r.code}`}>
                        {r.code}
                      </span>
                      <span
                        className={cn(
                          "border px-2 py-0.5 font-mono text-[10px]",
                          r.playerCount === 4 ? "border-ink bg-ink/[0.05] text-ink" : "border-ink/45 text-ink/60",
                        )}
                      >
                        {r.playerCount === 4 ? `四人围桌 ${r.seatsTaken}/${r.seatsTotal} 席` : "双人对坐"}
                      </span>
                      <span className="tabular border border-ink/45 px-2 py-0.5 font-mono text-[10px] text-ink/60">
                        {configLabel({ size: r.size, wallsPerPlayer: r.wallsPerPlayer, playerCount: r.playerCount })}
                      </span>
                      <span className="tabular border border-ink/45 px-2 py-0.5 font-mono text-[10px] text-ink/60">
                        {timeLabel(r.timeControl)}
                      </span>
                      <span className="font-mono text-[10px] text-ink/40">
                        {r.hostConnected ? "房主在线" : "房主掉线"} · {sinceLabel(r.createdAt, Date.now() + 0)}
                      </span>
                      <span className="ml-auto">
                        <Button
                          size="sm"
                          className="gap-1.5 bg-qb font-mono text-[11px] font-bold text-paper hover:opacity-90"
                          style={{ background: "var(--qb)" }}
                          disabled={phase === "joining" || phase === "connecting"}
                          onClick={() => joinByCode(r.code)}
                        >
                          <LogIn className="h-3.5 w-3.5" aria-hidden />
                          入座
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="border-t border-dashed border-ink/30 px-4 py-2 font-mono text-[9px] tracking-wider text-ink/40 sm:px-5">
              大厅只陈列公开等待房 · 房间坐满或开局即下架 · 私密房请凭码入座
            </p>
          </section>

          {/* 版式规格（房主开房前选定，入座后锁定；随席位形态切换预设） */}
          <FormatPanel compact />

          {/* 棋钟规格 */}
          <ClockPanel compact />

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
                {four
                  ? "按上方围桌开本与棋钟生成 4 位房间码，你执甲（红）居南座。棋友凭码入座其余三席；等不齐时把空座设为编辑部 AI 代打，点「开局」即翻盘。"
                  : "按上方开本与棋钟生成 4 位房间码，你执甲（红）先行。对手凭码、链接或大厅入座后立即开局，双方规格自动对齐。"}
              </p>
              <label
                className={cn(
                  "mt-4 flex cursor-pointer items-center gap-2.5 border border-ink/45 px-3 py-2 select-none",
                  "transition-colors hover:border-ink",
                )}
              >
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 accent-[var(--qa)]"
                  aria-label="在大厅公开此房"
                />
                <span className="font-mono text-[11px] text-ink/70">
                  在大厅公开此房 <span className="text-ink/40">（公开即可被列表入座，私密则凭码）</span>
                </span>
              </label>
              <Button
                className="mt-5 w-full gap-2 bg-qa font-mono text-sm font-bold text-paper hover:opacity-90"
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
                输入对手递来的 4 位房间码。双人居乙（蓝）后行；四人围桌自动坐进第一个空座
                （乙→丙→丁），棋盘按房主锁定的开本与棋钟摆放。
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
          实时信道 · 双端校对 · 双人/四人 · AI 代打 · 断线 5 分钟回座 · 逾时判负/出局
        </p>
      </div>
    </section>
  );
}
