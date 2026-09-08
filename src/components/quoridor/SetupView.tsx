"use client";

/* 01 单人对弈 —— 编辑部三档职位：学徒 / 排字师 / 总编。
 * 点选即开局：你执甲（红），先行。
 */

import { motion } from "framer-motion";
import { ArrowLeft, PenLine, Scissors, Crown } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import { AI_PROFILES, type AiLevel } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ICONS: Record<AiLevel, React.ReactNode> = {
  1: <PenLine className="h-5 w-5" aria-hidden />,
  2: <Scissors className="h-5 w-5" aria-hidden />,
  3: <Crown className="h-5 w-5" aria-hidden />,
};

const STRENGTH: Record<AiLevel, { bars: number; note: string }> = {
  1: { bars: 1, note: "棋力 · 入门" },
  2: { bars: 2, note: "棋力 · 进阶" },
  3: { bars: 3, note: "棋力 · 高段" },
};

export function SetupView() {
  const startGame = useQuoridor((s) => s.startGame);
  const setView = useQuoridor((s) => s.setView);

  const levels: AiLevel[] = [1, 2, 3];

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
          编辑部开放三个职位与你对坐。你执甲——荧光红、自底边出发、先行一步；
          对手执乙，自顶边俯瞰你的归途。选择一位对手，翻开对局页。
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-3">
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
              onClick={() => startGame("ai", lv)}
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
                  {Array.from({ length: 3 }, (_, b) => (
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
          学徒走最短路 · 排字师算路径差 · 总编做深度搜索
        </p>
      </div>
    </section>
  );
}
