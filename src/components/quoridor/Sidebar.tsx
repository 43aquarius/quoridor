"use client";

/* 对局页右侧杂志边栏：回合指示、剩余挡板（小铅条图）、每步计时、
 * 代数记谱着法记录（可点击回放）、悔棋 / 认输 / 音效。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Undo2,
  Flag,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  CornerUpLeft,
  Wifi,
  WifiOff,
  Radio,
  RefreshCw,
} from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import { AI_PROFILES, PLAYER_CN, cellName, isTimed, timeLabel, playerColorVar, type Player } from "@/lib/game/types";
import { isEliminated, pawnOf, playersOf, wallsLeftOf } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { SkinFilmStrip } from "./SkinFilmStrip";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function fmtShort(ms: number): string {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : fmt(ms);
}

/* 每步计时（跳动） */
function TurnTimer({ turnStartedAt, paused }: { turnStartedAt: number; paused: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [paused]);
  if (paused) return <span className="tabular text-3xl font-bold text-ink/35">0:00</span>;
  return (
    <span className="tabular text-3xl font-bold text-ink">
      {fmt(now - turnStartedAt)}
    </span>
  );
}

/* 本手倒计时（设单步时限时） */
function MoveCountdown({
  turnStartedAt,
  limitSec,
  paused,
}: {
  turnStartedAt: number;
  limitSec: number;
  paused: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [paused]);
  if (paused) {
    return <span className="tabular text-3xl font-bold text-ink/35">—</span>;
  }
  const left = Math.max(0, limitSec * 1000 - (now - turnStartedAt));
  const s = Math.ceil(left / 1000);
  const urgent = s <= 10;
  return (
    <span
      className={cn("tabular text-3xl font-bold", urgent ? "clock-danger" : "text-ink")}
      style={urgent ? { color: "var(--riso-red)" } : undefined}
      aria-live={urgent ? "assertive" : undefined}
    >
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

/* 总时钟：限时显示剩余，不限时显示累计 */
function PlayerClock({
  usedMs,
  turnStartedAt,
  isTicking,
  totalSec,
}: {
  usedMs: number;
  turnStartedAt: number;
  isTicking: boolean;
  totalSec: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isTicking) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [isTicking]);
  if (totalSec <= 0) {
    return <span className="tabular text-[10px] text-ink/45">累计 {fmt(usedMs)}</span>;
  }
  const live = usedMs + (isTicking ? Math.max(0, now - turnStartedAt) : 0);
  const left = Math.max(0, totalSec * 1000 - live);
  const s = Math.ceil(left / 1000);
  const urgent = s <= 30;
  return (
    <span
      className={cn("tabular font-mono text-[10px] font-bold", urgent && "clock-danger")}
      style={urgent ? { color: "var(--riso-red)" } : undefined}
    >
      剩 {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

/* 剩余挡板：小铅条图形（总数随开本规格） */
function WallLeadBars({ left, total, color }: { left: number; total: number; color: string }) {
  return (
    <span className="flex flex-wrap items-center gap-[3px]" aria-label={`剩余挡板 ${left} 根`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="h-[7px] w-[14px] rounded-full"
          style={{
            background: i < left ? color : "transparent",
            border: `1px solid ${i < left ? color : "var(--ink)"}`,
            opacity: i < left ? 1 : 0.4,
          }}
        />
      ))}
    </span>
  );
}

/* 对手断线判负倒计时（跳动） */
function GcCountdown({ gcAt }: { gcAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, gcAt - now);
  const s = Math.ceil(left / 1000);
  return (
    <span className="tabular font-mono text-[10px]" style={{ color: "var(--riso-red)" }}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")} 后判负
    </span>
  );
}

export function Sidebar({ onRefresh }: { onRefresh?: () => void }) {
  const state = useQuoridor((s) => s.state);
  const mode = useQuoridor((s) => s.mode);
  const aiLevel = useQuoridor((s) => s.aiLevel);
  const meta = useQuoridor((s) => s.meta);
  const online = useQuoridor((s) => s.online);
  const config = useQuoridor((s) => s.config);
  const seatConfig = useQuoridor((s) => s.seatConfig);
  const playerSeat = useQuoridor((s) => s.playerSeat);
  const soundOn = useQuoridor((s) => s.soundOn);
  const toggleSound = useQuoridor((s) => s.toggleSound);
  const undo = useQuoridor((s) => s.undo);
  const resign = useQuoridor((s) => s.resign);
  const replayTo = useQuoridor((s) => s.replayTo);
  const setView = useQuoridor((s) => s.setView);
  const [playing, setPlaying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  const replayIdx = meta.replayIndex;

  /* 手动刷新同步：短暂自旋反馈 */
  const handleRefresh = () => {
    if (!onRefresh) return;
    setRefreshing(true);
    onRefresh();
    setTimeout(() => setRefreshing(false), 1200);
  };

  /* 回放自动播放 */
  useEffect(() => {
    if (!playing || replayIdx == null) return;
    const id = setTimeout(() => {
      const nextIdx = (replayIdx ?? 0) + 1;
      if (state && nextIdx >= state.history.length) {
        setPlaying(false);
        replayTo(null);
      } else {
        replayTo(nextIdx);
      }
    }, 850);
    return () => clearTimeout(id);
  }, [playing, replayIdx, state, replayTo]);

  useEffect(() => {
    if (replayIdx == null && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state?.history.length, replayIdx]);

  if (!state) return null;

  const four = state.playerCount === 4;
  const seats = playersOf(state);

  /* 各席位显示名（模式感知） */
  const seatName = (p: Player): string => {
    const cn = PLAYER_CN[p];
    if (four) {
      const sc = seatConfig?.[p];
      if (sc?.kind === "ai") return `${AI_PROFILES[sc.level].name} · ${cn}`;
      const os = online?.seats?.find((s) => s.player === p);
      if (os?.isAi && os.aiLevel) return `${AI_PROFILES[os.aiLevel as 1 | 2 | 3 | 4].name} · ${cn}`;
      if (mode === "online" && online) return online.myPlayer === p ? `你 · ${cn}` : `棋友 · ${cn}`;
      return `真人 · ${cn}`;
    }
    if (p === "A") return mode === "ai" ? (playerSeat === "A" ? "你 · 甲（红）" : aiLevel ? `${AI_PROFILES[aiLevel].name} · 甲` : "甲") : "甲";
    return mode === "ai" && aiLevel
      ? playerSeat === "B"
        ? "你 · 乙（蓝）"
        : `${AI_PROFILES[aiLevel].name} · 乙`
      : mode === "online"
        ? `对手 · 乙${online && online.myPlayer === "B" ? "（你）" : ""}`
        : "乙";
  };

  const paused = !!state.winner;
  const replaying = replayIdx != null;

  const playerBlock = (p: Player) => {
    const isTurn = state.turn === p && !state.winner;
    const out = isEliminated(state, p);
    const color = playerColorVar(p);
    const pos = pawnOf(state, p);
    const left = wallsLeftOf(state, p);
    const name = seatName(p);
    const totalMs = p === "A" ? meta.totalMsA : p === "B" ? meta.totalMsB : p === "C" ? (meta.totalMsC ?? 0) : (meta.totalMsD ?? 0);
    const maxPath = p === "A" ? meta.maxPathA : p === "B" ? meta.maxPathB : p === "C" ? (meta.maxPathC ?? 0) : (meta.maxPathD ?? 0);
    /* 四人房：该席在线状态（在线 / 掉线 / 编辑部代打） */
    const seatInfo = four ? online?.seats?.find((s) => s.player === p) : undefined;
    return (
      <div
        className={cn(
          "relative border border-ink/30 px-4 py-3 transition-colors",
          isTurn && "border-ink bg-ink/[0.04]",
          out && "opacity-55",
        )}
      >
        {isTurn && (
          <motion.span
            layoutId="turn-marker"
            className="absolute left-0 top-0 h-full w-[4px]"
            style={{ background: color }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} aria-hidden />
            <span className="font-display text-base font-bold text-ink">{name}</span>
            {out ? (
              <span className="font-mono text-[9px] tracking-[0.2em] text-ink/45">✕ 出局</span>
            ) : isTurn ? (
              <span className="font-mono text-[9px] tracking-[0.2em]" style={{ color }}>
                ● 行棋中
              </span>
            ) : null}
            {four && mode === "online" && seatInfo && !out && !seatInfo.isAi && seatInfo.present && (
              <span
                className="font-mono text-[9px] tracking-[0.1em]"
                style={{ color: seatInfo.connected ? "var(--ink)" : "var(--riso-red)" }}
              >
                {seatInfo.connected ? "· 在线" : "· 掉线"}
              </span>
            )}
            {four && mode === "online" && seatInfo?.isAi && (
              <span className="font-mono text-[9px] tracking-[0.1em] text-ink/40">· 编辑部代打</span>
            )}
          </span>
          <span className="tabular text-xs text-ink/60">{cellName(pos, state.size)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <WallLeadBars left={left} total={state.wallsStart} color={color} />
          <span className="tabular text-[10px] text-ink/50">×{left}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-ink/45">
          <PlayerClock
            usedMs={totalMs}
            turnStartedAt={meta.turnStartedAt}
            isTicking={isTurn && !out}
            totalSec={config.timeControl.totalSec}
          />
          <span>归途 {maxPath} 步峰值</span>
        </div>
        {four && mode === "online" && seatInfo && !seatInfo.connected && seatInfo.present && !out && seatInfo.gcAt && (
          <div className="mt-1">
            <GcCountdown gcAt={seatInfo.gcAt} />
          </div>
        )}
      </div>
    );
  };

  return (
    <aside aria-label="对局边栏" className="flex w-full flex-col gap-5">
      {/* 回合与计时 */}
      <section className="border border-ink/40">
        <div className="flex items-center justify-between border-b border-ink/25 px-4 py-2">
          <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-ink/55">对局状态 STATUS</span>
          <span className="flex items-center gap-2 font-mono text-[10px] text-ink/40">
            <span className="tabular">{state.size}×{state.size} · {state.wallsStart}板{four ? " · 四人围坐" : ""}</span>
            {isTimed(config.timeControl) && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular" title="棋钟规格">{timeLabel(config.timeControl)}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>第 {Math.max(1, state.history.length + (state.winner ? 0 : 1))} 手</span>
          </span>
        </div>
        <div className="space-y-2.5 p-3.5">
          {seats.map((p) => (
            <div key={p}>{playerBlock(p)}</div>
          ))}
          <div className="flex items-end justify-between border-t border-dashed border-ink/30 pt-3">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] tracking-[0.25em] text-ink/50">
                本手用时 {config.timeControl.perMoveSec > 0 ? "MOVE ⏱" : "MOVE"}
              </span>
              {config.timeControl.perMoveSec > 0 ? (
                <MoveCountdown
                  turnStartedAt={meta.turnStartedAt}
                  limitSec={config.timeControl.perMoveSec}
                  paused={paused}
                />
              ) : (
                <TurnTimer turnStartedAt={meta.turnStartedAt} paused={paused} />
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {meta.aiThinking ? (
                <span className="thinking-dots flex items-center gap-1.5 font-mono text-[11px]" style={{ color: "var(--qa)" }}>
                  <Radio className="h-3 w-3" aria-hidden />
                  {meta.aiLabel ?? "编辑部正在算着……"}
                </span>
              ) : state.winner ? (
                <span className="font-mono text-[11px] text-ink/60">
                  {state.winReason === "timeout"
                    ? four
                      ? `${PLAYER_CN[state.history[state.history.length - 1]?.player ?? "A"]}方超时出局 · 棋局继续`
                      : `${state.winner === "A" ? "乙" : "甲"}方超时 · 判负`
                    : state.winReason === "last"
                      ? `${PLAYER_CN[state.winner]}成为末位存席 · 收笔`
                      : `${PLAYER_CN[state.winner] ?? "甲"}胜 · 收笔`}
                </span>
              ) : (
                <span className="font-mono text-[11px] text-ink/60">
                  轮到{PLAYER_CN[state.turn]}落子
                </span>
              )}
              {mode === "online" && online && !four && (
                <span className="flex items-center gap-1.5 font-mono text-[10px]">
                  {online.opponentConnected ? (
                    <>
                      <Wifi className="h-3 w-3" style={{ color: "var(--qb)" }} aria-hidden />
                      <span className="text-ink/60">对手在线 · 房间 {online.roomCode}</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3" style={{ color: "var(--riso-red)" }} aria-hidden />
                      <span style={{ color: "var(--riso-red)" }}>
                        {online.phase === "waiting"
                          ? "等待对手入座"
                          : online.phase === "reconnecting"
                            ? "本方信道中断，重连中……"
                            : "对手掉线，纸面为其保留座位"}
                      </span>
                      {online.phase !== "waiting" &&
                        online.phase !== "reconnecting" &&
                        online.opponentGcAt && <GcCountdown gcAt={online.opponentGcAt} />}
                    </>
                  )}
                </span>
              )}
              {mode === "online" && online && four && (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink/50">
                  <Wifi className={cn("h-3 w-3", !online.opponentConnected && "opacity-40")} style={{ color: "var(--qb)" }} aria-hidden />
                  四人房 {online.roomCode} · 你执{PLAYER_CN[online.myPlayer]} · 席位状态见上
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 着法记录 */}
      <section className="flex min-h-0 flex-col border border-ink/40">
        <div className="flex items-center justify-between border-b border-ink/25 px-4 py-2">
          <span className="font-mono text-[10px] tracking-[0.3em] text-ink/55">着法记录 RECORD</span>
          <span className="font-mono text-[10px] text-ink/40">{state.history.length} 着</span>
        </div>
        <div
          ref={logRef}
          className="scroll-ink max-h-[300px] min-h-[140px] overflow-y-auto px-2 py-2 lg:max-h-[340px]"
          role="log"
          aria-label="着法列表"
        >
          {state.history.length === 0 && (
            <p className="px-2 py-6 text-center font-mono text-[11px] text-ink/40">
              —— 白纸一张，落第一着 ——
            </p>
          )}
          {state.history.map((m) => {
            const future = replaying && m.n > (replayIdx ?? 0);
            const current = replaying && m.n === (replayIdx ?? 0);
            return (
              <button
                key={m.n}
                type="button"
                onClick={() => (mode === "online" ? undefined : replayTo(m.n))}
                disabled={mode === "online"}
                title={mode === "online" ? "在线对局不支持回放跳转" : `回放至第 ${m.n} 手`}
                className={cn(
                  "group flex w-full items-baseline gap-2 rounded-none px-2 py-[3px] text-left",
                  mode !== "online" && "hover:bg-ink/[0.05]",
                  current && "bg-ink/[0.08]",
                  future && "opacity-35",
                )}
              >
                <span className="tabular w-6 shrink-0 text-[11px] text-ink/50">{String(m.n).padStart(2, "0")}</span>
                <span
                  className="w-4 shrink-0 text-center text-[11px] font-bold"
                  style={{ color: playerColorVar(m.player) }}
                >
                  {PLAYER_CN[m.player]}
                </span>
                <span
                  className={cn(
                    "tabular flex-1 text-[12px] font-medium",
                    m.payload.type === "wall" ? "tracking-wide" : "",
                  )}
                  style={{ color: playerColorVar(m.player) }}
                >
                  {m.notation}
                </span>
                <span className="tabular shrink-0 text-[10px] text-ink/40">{fmtShort(m.elapsedMs)}</span>
              </button>
            );
          })}
        </div>
        {/* 回放控制条 */}
        <AnimatePresence>
          {replaying && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-ink/25 bg-ink/[0.05]"
            >
              <div className="flex items-center justify-between gap-1 px-2.5 py-2">
                <span className="tabular font-mono text-[10px] text-ink/60">
                  回放 {replayIdx}/{state.history.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="上一手" onClick={() => replayTo(Math.max(0, (replayIdx ?? 1) - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={playing ? "暂停" : "自动播放"}
                    onClick={() => {
                      if ((replayIdx ?? 0) + 1 >= state.history.length) replayTo(0);
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="下一手"
                    onClick={() => {
                      const next = (replayIdx ?? 0) + 1;
                      if (next >= state.history.length) {
                        setPlaying(false);
                        replayTo(null);
                      } else replayTo(next);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="回到最新"
                    onClick={() => {
                      setPlaying(false);
                      replayTo(null);
                    }}
                  >
                    <CornerUpLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* 操作 */}
      <section className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper"
          onClick={undo}
          disabled={mode === "online" || state.history.length === 0 || replaying}
          title={mode === "online" ? "在线对局不可悔棋" : mode === "ai" ? "撤回你的上一手与 AI 的应手" : "撤回一手"}
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          悔棋 UNDO
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper"
              disabled={!!state.winner}
            >
              <Flag className="h-3.5 w-3.5" aria-hidden />
              认输 RESIGN
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-2 border-ink bg-paper sm:max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-xl font-black">确认认输？</AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-relaxed text-ink/70">
                这一页将以认输收束。对方执笔写完最后一行。此操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper">
                再想想
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-ink font-mono text-xs text-paper hover:bg-ink/85"
                onClick={resign}
              >
                落笔认输
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {mode === "online" && onRefresh && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper"
            onClick={handleRefresh}
            disabled={!!state.winner}
            title="手动校线：强制重连并对齐棋面与对手在线状态（防一方掉线而不自知）"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />
            刷新同步 REFRESH
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper"
          onClick={toggleSound}
          aria-pressed={soundOn}
        >
          {soundOn ? <Volume2 className="h-3.5 w-3.5" aria-hidden /> : <VolumeX className="h-3.5 w-3.5" aria-hidden />}
          音效
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-9 font-mono text-xs text-ink/55 hover:text-ink"
          onClick={() => setView("contents")}
        >
          ← 目录
        </Button>
      </section>

      {four ? (
        <p className="border-t border-dashed border-ink/35 pt-4 font-mono text-[9px] leading-relaxed tracking-[0.15em] text-ink/40">
          四人围坐 · 四色套印已钉死（红/蓝/苔绿/墨黑）· 顺时针行棋 甲→丙→乙→丁 · 出局制：认输/超时/离席逾时即出局，仅存一席时末位胜
        </p>
      ) : (
        <div className="border-t border-dashed border-ink/35 pt-4">
          <SkinFilmStrip compact />
        </div>
      )}
    </aside>
  );
}
