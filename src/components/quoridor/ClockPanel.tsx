"use client";

/* 棋钟规格面板：总时长 + 单步时限的预设与自定义。
 * 预设：悠然不限时（编辑部默认）/ 快棋 3 分 + 15 秒 / 标准 5 分 + 30 秒 / 长卷 10 分 + 60 秒；
 * 自定义：总时长与单步时限各自的档位按钮。任一超时即判负。
 * 在线对局中，计时以服务器为最终裁判（防时钟漂移与掉线争议）。
 */

import { motion } from "framer-motion";
import { AlarmClock, Star } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import {
  TIME_MOVE_STEPS,
  TIME_PRESETS,
  TIME_TOTAL_STEPS,
  sameTimeControl,
  timeLabel,
  type TimePreset,
} from "@/lib/game/types";
import { cn } from "@/lib/utils";

function stepLabel(sec: number): string {
  if (sec === 0) return "不限";
  if (sec >= 60) {
    const m = sec / 60;
    return `${m} 分`;
  }
  return `${sec} 秒`;
}

export function ClockPanel({ compact = false }: { compact?: boolean }) {
  const config = useQuoridor((s) => s.config);
  const setConfig = useQuoridor((s) => s.setConfig);

  const activePreset = TIME_PRESETS.find((p) =>
    sameTimeControl(config.timeControl, { totalSec: p.totalSec, perMoveSec: p.perMoveSec }),
  );

  const applyPreset = (p: TimePreset) => {
    setConfig({ timeControl: { totalSec: p.totalSec, perMoveSec: p.perMoveSec } });
  };

  const applyTotal = (sec: number) => {
    setConfig({ timeControl: { ...config.timeControl, totalSec: sec } });
  };

  const applyMove = (sec: number) => {
    setConfig({ timeControl: { ...config.timeControl, perMoveSec: sec } });
  };

  return (
    <section
      aria-label="棋钟规格"
      className="border-2 border-ink bg-paper"
      style={{ boxShadow: compact ? "4px 4px 0 var(--ink)" : "6px 6px 0 var(--ink)" }}
    >
      <header className="flex items-baseline justify-between border-b border-ink/30 px-4 py-2.5 sm:px-5">
        <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-ink/55">
          <AlarmClock className="h-3 w-3" aria-hidden />
          棋钟规格 CLOCK SPEC
        </span>
        <span className="tabular font-mono text-[11px] font-bold text-ink">
          {timeLabel(config.timeControl)}
        </span>
      </header>

      <div className="p-4 sm:p-5">
        {/* 预设四种棋钟 */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {TIME_PRESETS.map((p, i) => {
            const active = activePreset?.id === p.id;
            const accent = i % 2 === 0 ? "var(--qa)" : "var(--qb)";
            return (
              <motion.button
                key={p.id}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.06, duration: 0.35 }}
                onClick={() => applyPreset(p)}
                aria-pressed={active}
                className={cn(
                  "group relative border-2 p-3 text-left transition-transform duration-150",
                  "hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none",
                  active ? "border-ink bg-ink text-paper" : "border-ink/45 bg-paper text-ink hover:border-ink",
                )}
              >
                {p.recommended && (
                  <span
                    className="absolute -top-2.5 right-2 flex items-center gap-1 border border-ink bg-paper px-1.5 py-0.5 font-mono text-[8px] tracking-[0.12em]"
                    style={{ color: "var(--riso-red)", borderColor: "var(--riso-red)" }}
                  >
                    <Star className="h-2.5 w-2.5" aria-hidden />
                    默认
                  </span>
                )}
                <span className="flex items-baseline justify-between">
                  <span className={cn("font-display text-lg font-black", active && "text-paper")}>{p.label}</span>
                  <span
                    className={cn("font-mono text-[9px] tracking-[0.18em]", active ? "text-paper/70" : "text-ink/45")}
                  >
                    {p.en}
                  </span>
                </span>
                <span
                  className={cn("tabular mt-1.5 block font-mono text-[13px] font-bold", active ? "text-paper" : "text-ink")}
                  style={!active ? { color: accent } : undefined}
                >
                  {p.totalSec === 0 ? "不限时" : `总 ${stepLabel(p.totalSec)}`}
                  {p.perMoveSec > 0 && ` · 步 ${stepLabel(p.perMoveSec)}`}
                </span>
                {!compact && (
                  <span className={cn("mt-1.5 block text-[11px] leading-relaxed", active ? "text-paper/75" : "text-ink/60")}>
                    {p.sub}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* 自定义档位 */}
        <div className={cn("mt-4 border-t border-dashed border-ink/35 pt-4", !activePreset && "bg-ink/[0.03]")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] tracking-[0.25em] text-ink/55">自定钟点 CUSTOM</span>
            {activePreset ? (
              <span className="font-mono text-[9px] tracking-wider text-ink/40">
                正在使用预设「{activePreset.label}」，可改为手调
              </span>
            ) : (
              <span className="font-mono text-[9px] tracking-wider" style={{ color: "var(--riso-red)" }}>
                手调钟点生效中
              </span>
            )}
          </div>

          {/* 总时长档位 */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 font-mono text-[10px] tracking-wider text-ink/55">总时长</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="每方总时长">
              {TIME_TOTAL_STEPS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => applyTotal(sec)}
                  aria-pressed={config.timeControl.totalSec === sec}
                  className={cn(
                    "tabular min-w-[52px] border border-ink px-2.5 py-1.5 font-mono text-xs font-bold transition-colors",
                    config.timeControl.totalSec === sec
                      ? "bg-ink text-paper"
                      : "bg-paper text-ink/70 hover:bg-ink/[0.06] hover:text-ink",
                  )}
                >
                  {stepLabel(sec)}
                </button>
              ))}
            </div>
          </div>

          {/* 单步时限档位 */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 font-mono text-[10px] tracking-wider text-ink/55">单步时限</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="单步时限">
              {TIME_MOVE_STEPS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => applyMove(sec)}
                  aria-pressed={config.timeControl.perMoveSec === sec}
                  className={cn(
                    "tabular min-w-[52px] border border-ink px-2.5 py-1.5 font-mono text-xs font-bold transition-colors",
                    config.timeControl.perMoveSec === sec
                      ? "bg-ink text-paper"
                      : "bg-paper text-ink/70 hover:bg-ink/[0.06] hover:text-ink",
                  )}
                >
                  {stepLabel(sec)}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-3 font-mono text-[9px] leading-relaxed tracking-wider text-ink/45">
            总时长耗尽或单步超时即判负 · 在线对局以服务器计时为准 · 不限时则沿用本手用时记录
          </p>
        </div>
      </div>
    </section>
  );
}
