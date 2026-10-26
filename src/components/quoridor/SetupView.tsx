"use client";

/* 01 单人对弈 —— 编辑部四档职位：学徒 / 排字师 / 总编 / 社长。
 * 先选版式规格（棋盘尺寸 + 每方挡板数），再择执子先后手，
 * 最后点选对手即开局：先手执甲（红），后手执乙（蓝）。
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, PenLine, Scissors, Crown, Landmark } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import { AI_PROFILES, configLabel, recommendedWalls, timeLabel, type AiLevel, type Player } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FormatPanel } from "./FormatPanel";
import { ClockPanel } from "./ClockPanel";

const ICONS: Record<AiLevel, React.ReactNode> = {
  1: <PenLine className="h-5 w-5" aria-hidden />,
  2: <Scissors className="h-5 w-5" aria-hidden />,
  3: <Crown className="h-5 w-5" aria-hidden />,
  4: <Landmark className="h-5 w-5" aria-hidden />,
};

const STRENGTH: Record<AiLevel, { bars: number; note: string }> = {
  1: { bars: 1, note: "棋力 · 入门" },
  2: { bars: 2, note: "棋力 · 进阶" },
  3: { bars: 3, note: "棋力 · 高段" },
  4: { bars: 4, note: "棋力 · 终审" },
};

const SEAT_OPTIONS: Array<{ seat: Player; title: string; sub: string; color: string; desc: string }> = [
  {
    seat: "A",
    title: "先手 · 执甲",
    sub: "RED · FIRST",
    color: "var(--qa)",
    desc: "荧光红铅字，自底边出发，先落第一子。",
  },
  {
    seat: "B",
    title: "后手 · 执乙",
    sub: "BLUE · SECOND",
    color: "var(--qb)",
    desc: "钴蓝铅字，自顶边俯冲，后发制人。",
  },
];

export function SetupView() {
  const startGame = useQuoridor((s) => s.startGame);
  const setView = useQuoridor((s) => s.setView);
  const config = useQuoridor((s) => s.config);
  const setConfig = useQuoridor((s) => s.setConfig);
  const [seat, setSeat] = useState<Player>("A");

  const levels: AiLevel[] = [1, 2, 3, 4];

  /* 进入本章即归一为二人规格（防止四人规格残留） */
  useEffect(() => {
    setConfig({ playerCount: 2, wallsPerPlayer: recommendedWalls(config.size, 2) });
     
  }, []);

  return (
    <section aria-label="选择对手" className="mx-auto w-full max-w-5xl px-6 py-16 sm:px-10 sm:py-20">
      <header className="mb-10">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-4">
          <h2 className="font-display text-4xl font-black text-ink sm:text-5xl">
            单人对弈
            <span className="ml-4 font-west text-base font-normal italic text-ink/55">against the desk</span>
          </h2>
          <span className="font-mono text-[10px] tracking-[0.4em] text-ink/50">CH.01</span>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/70">
          编辑部开放四个职位与你对坐。先择一版开本与棋钟、选定执子先后手，再选一位对手，翻开对局页。
        </p>
      </header>

      {/* 版式规格 */}
      <FormatPanel />

      {/* 棋钟规格 */}
      <div className="mt-8">
        <ClockPanel />
      </div>

      {/* 执子先后手 */}
      <div className="mt-8">
        <p className="mb-3 font-mono text-[10px] tracking-[0.3em] text-ink/50">执子先后手 CHOOSE YOUR INK</p>
        <div className="grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="执子先后手">
          {SEAT_OPTIONS.map((o) => {
            const active = seat === o.seat;
            return (
              <button
                key={o.seat}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSeat(o.seat)}
                className={cn(
                  "group flex items-center gap-4 border-2 bg-paper px-5 py-4 text-left transition-all duration-200",
                  "focus-visible:outline-none focus-visible:-translate-y-0.5",
                  active ? "border-ink" : "border-ink/30 hover:border-ink/60",
                )}
                style={{ boxShadow: active ? `4px 4px 0 ${o.color}` : undefined }}
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center border"
                  style={{
                    borderColor: o.color,
                    background: active ? o.color : "transparent",
                    transition: "background 0.2s",
                  }}
                >
                  {active && <span className="h-2.5 w-2.5 bg-paper" />}
                </span>
                <span className="flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-lg font-black text-ink">{o.title}</span>
                    <span className="font-mono text-[9px] tracking-[0.25em] text-ink/45">{o.sub}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink/65">{o.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-5 mt-8 font-mono text-[10px] tracking-[0.3em] text-ink/50">
        对手职位 DESK POSITIONS · 当前开本 {configLabel(config)} · {timeLabel(config.timeControl)}
      </p>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {levels.map((lv, i) => {
          const p = AI_PROFILES[lv];
          const accent = i === 0 ? "var(--qa)" : i === 1 ? "var(--qb)" : "var(--ink)";
          return (
            <motion.button
              key={lv}
              type="button"
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1, duration: 0.5 }}
              onClick={() => startGame("ai", lv, { ...config, playerCount: 2 }, undefined, seat)}
              className={cn(
                "group relative flex min-h-[260px] flex-col border-2 border-ink bg-paper p-6 text-left",
                "transition-transform duration-200 hover:-translate-y-1.5 focus-visible:-translate-y-1.5 focus-visible:outline-none",
              )}
              style={{ boxShadow: "6px 6px 0 var(--ink)" }}
            >
              <span className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center border border-ink" style={{ color: accent }}>
                  {ICONS[lv]}
                </span>
                <span className="font-mono text-[9px] tracking-[0.3em] text-ink/45">{p.title}</span>
              </span>
              <span className="mt-5 font-display text-3xl font-black text-ink">{p.name}</span>
              <span className="mt-3 flex-1 text-sm leading-relaxed text-ink/70">{p.brief}</span>
              <span className="mt-5 flex items-center justify-between border-t border-ink/25 pt-3">
                <span className="flex items-center gap-1.5" aria-label={STRENGTH[lv].note}>
                  {Array.from({ length: 4 }, (_, b) => (
                    <span
                      key={b}
                      aria-hidden
                      className="h-3.5 w-2.5"
                      style={{
                        background: b < STRENGTH[lv].bars ? accent : "transparent",
                        border: `1px solid ${b < STRENGTH[lv].bars ? accent : "var(--ink)"}`,
                        opacity: b < STRENGTH[lv].bars ? 1 : 0.4,
                      }}
                    />
                  ))}
                  <span className="ml-2 font-mono text-[9px] tracking-wider text-ink/50">{STRENGTH[lv].note}</span>
                </span>
                <span className="font-mono text-[10px] text-ink/45 transition-colors group-hover:text-ink">
                  对弈 →
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>

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
          学徒走最短路 · 排字师算路径差 · 总编做深度搜索 · 社长预算全开 · 开本与棋钟随规格生效
        </p>
      </div>
    </section>
  );
}
