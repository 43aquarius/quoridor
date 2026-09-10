"use client";

/* 版式规格面板：棋盘尺寸 + 每方挡板数的预设与自定义。
 * 预设：袖珍 5×5×5 / 沙龙 7×7×8 / 经典 9×9×10（编辑部推荐）/ 大师 11×11×12；
 * 自定义：尺寸 5..13（奇数档位）+ 挡板 0..20 根滑杆，改尺寸自动套用推荐挡板数。
 */

import { motion } from "framer-motion";
import { RotateCcw, Star } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import {
  BOARD_SIZES,
  FORMAT_PRESETS,
  FORMAT_PRESETS_4P,
  MAX_WALLS,
  MIN_WALLS,
  recommendedWalls,
  sameConfig,
  type FormatPreset,
} from "@/lib/game/types";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FormatPanel({ compact = false }: { compact?: boolean }) {
  const config = useQuoridor((s) => s.config);
  const setConfig = useQuoridor((s) => s.setConfig);
  const four = config.playerCount === 4;
  const presets = four ? FORMAT_PRESETS_4P : FORMAT_PRESETS;

  const activePreset = presets.find((p) =>
    sameConfig(config, { size: p.size, wallsPerPlayer: p.wallsPerPlayer }),
  );

  const applyPreset = (p: FormatPreset) => {
    setConfig({ size: p.size, wallsPerPlayer: p.wallsPerPlayer });
  };

  const applySize = (size: number) => {
    // 改尺寸即套用该尺寸的编辑部推荐挡板数（随席位数），随后可手动微调
    setConfig({ size, wallsPerPlayer: recommendedWalls(size, config.playerCount) });
  };

  const recWalls = recommendedWalls(config.size, config.playerCount);

  return (
    <section aria-label="版式规格" className="border-2 border-ink bg-paper" style={{ boxShadow: compact ? "4px 4px 0 var(--ink)" : "6px 6px 0 var(--ink)" }}>
      {/* 章头 */}
      <header className="flex items-baseline justify-between border-b border-ink/30 px-4 py-2.5 sm:px-5">
        <span className="font-mono text-[10px] tracking-[0.3em] text-ink/55">版式规格 FORMAT SPEC</span>
        <span className="tabular font-mono text-[11px] font-bold text-ink">
          {config.size}×{config.size} · 每方 {config.wallsPerPlayer} 板
        </span>
      </header>

      <div className="p-4 sm:p-5">
        {/* 预设四种开本（随席位数：二人对坐 / 四人围坐） */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {presets.map((p, i) => {
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
                    推荐
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
                  {p.size}×{p.size} · {p.wallsPerPlayer} 板
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

        {/* 自定义开卷 */}
        <div className={cn("mt-4 border-t border-dashed border-ink/35 pt-4", !activePreset && "bg-ink/[0.03]")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] tracking-[0.25em] text-ink/55">自定义开卷 CUSTOM</span>
            {activePreset ? (
              <span className="font-mono text-[9px] tracking-wider text-ink/40">正在使用预设「{activePreset.label}」，可随时改为手排</span>
            ) : (
              <span className="font-mono text-[9px] tracking-wider" style={{ color: "var(--riso-red)" }}>
                手排规格生效中
              </span>
            )}
          </div>

          {/* 尺寸档位（奇数 5..13） */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 font-mono text-[10px] tracking-wider text-ink/55">棋盘尺寸</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="棋盘尺寸（路数）">
              {BOARD_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => applySize(n)}
                  aria-pressed={config.size === n}
                  className={cn(
                    "tabular min-w-[52px] border border-ink px-2.5 py-1.5 font-mono text-xs font-bold transition-colors",
                    config.size === n
                      ? "bg-ink text-paper"
                      : "bg-paper text-ink/70 hover:bg-ink/[0.06] hover:text-ink",
                  )}
                >
                  {n}路
                </button>
              ))}
            </div>
          </div>

          {/* 挡板滑杆 */}
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <span className="w-16 shrink-0 font-mono text-[10px] tracking-wider text-ink/55">挡板数</span>
            <div className="flex min-w-[200px] flex-1 items-center gap-3">
              <Slider
                value={[config.wallsPerPlayer]}
                min={MIN_WALLS}
                max={MAX_WALLS}
                step={1}
                onValueChange={(v) => setConfig({ wallsPerPlayer: v[0] })}
                aria-label="每方挡板数"
                className="flex-1"
              />
              <span className="tabular w-24 shrink-0 text-right font-mono text-sm font-bold text-ink">
                {config.wallsPerPlayer} 根
              </span>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[9px] leading-relaxed tracking-wider text-ink/45">
              尺寸 5..13 路（奇数）{four ? " · 四人围坐推荐值减半" : ""} · 改尺寸自动套用推荐值 · 该尺寸推荐 {recWalls} 根
              {config.wallsPerPlayer === 0 && " · 零板纯走子局"}
            </p>
            {config.wallsPerPlayer !== recWalls && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 border-ink bg-transparent px-2.5 font-mono text-[10px] hover:bg-ink hover:text-paper"
                onClick={() => setConfig({ wallsPerPlayer: recWalls })}
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                恢复推荐
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
