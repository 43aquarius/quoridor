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
} from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import { AI_PROFILES, cellName, type Player } from "@/lib/game/types";
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

/* 剩余挡板：小铅条图形 */
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

export function Sidebar() {
  const state = useQuoridor((s) => s.state);
  const mode = useQuoridor((s) => s.mode);
  const aiLevel = useQuoridor((s) => s.aiLevel);
  const meta = useQuoridor((s) => s.meta);
  const online = useQuoridor((s) => s.online);
  const soundOn = useQuoridor((s) => s.soundOn);
  const toggleSound = useQuoridor((s) => s.toggleSound);
  const undo = useQuoridor((s) => s.undo);
  const resign = useQuoridor((s) => s.resign);
  const replayTo = useQuoridor((s) => s.replayTo);
  const setView = useQuoridor((s) => s.setView);
  const [playing, setPlaying] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  const replayIdx = meta.replayIndex;

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

  const labelA = mode === "ai" ? "你 · 甲" : "甲";
  const labelB = mode === "ai" && aiLevel ? `${AI_PROFILES[aiLevel].name} · 乙` : mode === "online" ? `对手 · 乙${online && online.myPlayer === "B" ? "（你）" : ""}` : "乙";
  const paused = !!state.winner;
  const replaying = replayIdx != null;

  const playerBlock = (p: Player) => {
    const isTurn = state.turn === p && !state.winner;
    const color = p === "A" ? "var(--qa)" : "var(--qb)";
    const pos = p === "A" ? state.posA : state.posB;
    const left = p === "A" ? state.wallsA : state.wallsB;
    const name = p === "A" ? labelA : labelB;
    const totalMs = p === "A" ? meta.totalMsA : meta.totalMsB;
    return (
      <div
        className={cn(
          "relative border border-ink/30 px-4 py-3 transition-colors",
          isTurn && "border-ink bg-ink/[0.04]",
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
            {isTurn && (
              <span className="font-mono text-[9px] tracking-[0.2em]" style={{ color }}>
                ● 行棋中
              </span>
            )}
          </span>
          <span className="tabular text-xs text-ink/60">{cellName(pos)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <WallLeadBars left={left} total={10} color={color} />
          <span className="tabular text-[10px] text-ink/50">×{left}</span>
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink/45">
          <span>累计 {fmt(totalMs)}</span>
          <span>归途 {p === "A" ? meta.maxPathA : meta.maxPathB} 步峰值</span>
        </div>
      </div>
    );
  };

  return (
    <aside aria-label="对局边栏" className="flex w-full flex-col gap-5">
      {/* 回合与计时 */}
      <section className="border border-ink/40">
        <div className="flex items-center justify-between border-b border-ink/25 px-4 py-2">
          <span className="font-mono text-[10px] tracking-[0.3em] text-ink/55">对局状态 STATUS</span>
          <span className="font-mono text-[10px] text-ink/40">
            第 {Math.max(1, state.history.length + (state.winner ? 0 : 1))} 手
          </span>
        </div>
        <div className="space-y-2.5 p-3.5">
          {playerBlock("A")}
          {playerBlock("B")}
          <div className="flex items-end justify-between border-t border-dashed border-ink/30 pt-3">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] tracking-[0.25em] text-ink/50">本手用时 MOVE</span>
              <TurnTimer turnStartedAt={meta.turnStartedAt} paused={paused} />
            </div>
            <div className="flex flex-col items-end gap-1">
              {meta.aiThinking && aiLevel ? (
                <span className="thinking-dots flex items-center gap-1.5 font-mono text-[11px]" style={{ color: "var(--qa)" }}>
                  <Radio className="h-3 w-3" aria-hidden />
                  {AI_PROFILES[aiLevel].thinking}
                </span>
              ) : state.winner ? (
                <span className="font-mono text-[11px] text-ink/60">
                  {state.winner === "A" ? "甲" : "乙"}胜 · 收笔
                </span>
              ) : (
                <span className="font-mono text-[11px] text-ink/60">
                  轮到{state.turn === "A" ? "甲" : "乙"}落子
                </span>
              )}
              {mode === "online" && online && (
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
                        {online.phase === "waiting" ? "等待对手入座" : "对手掉线 · 5 分钟内可回座"}
                      </span>
                    </>
                  )}
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
                  style={{ color: m.player === "A" ? "var(--qa)" : "var(--qb)" }}
                >
                  {m.player === "A" ? "甲" : "乙"}
                </span>
                <span
                  className={cn(
                    "tabular flex-1 text-[12px] font-medium",
                    m.payload.type === "wall" ? "tracking-wide" : "",
                  )}
                  style={{ color: m.player === "A" ? "var(--qa)" : "var(--qb)" }}
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

      <div className="border-t border-dashed border-ink/35 pt-4">
        <SkinFilmStrip compact />
      </div>
    </aside>
  );
}
