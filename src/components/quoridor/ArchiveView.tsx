"use client";

/* 05 棋谱档案馆：历史对局每一局是一个垂直滚动的「spread」，
 * 展示双方、步数、胜负与数据小注（最长的绕路、最早耗尽挡板……）。
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ImageDown, Trash2, ChevronDown, ArchiveX } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import { entryFootnotes, type ArchiveEntry } from "@/lib/game/archive";
import { AI_PROFILES, PLAYER_CN, playerColorVar } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Spread({ entry, index }: { entry: ArchiveEntry; index: number }) {
  const [openMoves, setOpenMoves] = useState(false);
  const openPoster = useQuoridor((s) => s.openPoster);
  const deleteEntry = useQuoridor((s) => s.deleteArchiveEntry);

  const four = entry.playerCount === 4;
  const modeStr =
    entry.mode === "ai" && entry.aiLevel
      ? `单人对弈 · ${AI_PROFILES[entry.aiLevel].name}`
      : entry.mode === "local"
        ? four
          ? "四人围坐"
          : "双人同屏"
        : four
          ? "在线四人围桌"
          : "在线对战";
  const winnerColor =
    entry.winner === "A"
      ? "var(--qa)"
      : entry.winner === "B"
        ? "var(--qb)"
        : entry.winner === "C"
          ? "var(--qc)"
          : "var(--qd)";
  const winnerLabel =
    entry.winner === "A"
      ? entry.labelA
      : entry.winner === "B"
        ? entry.labelB
        : entry.winner === "C"
          ? (entry.labelC ?? "丙")
          : entry.winner === "D"
            ? (entry.labelD ?? "丁")
            : "";
  const notes = entryFootnotes(entry);

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.06, 0.4) }}
      className="border-2 border-ink bg-paper"
      style={{ boxShadow: "7px 7px 0 var(--ink)" }}
      aria-label={`对局 ${entry.id}`}
    >
      {/* spread 头 */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b-2 border-ink px-5 py-3 sm:px-7">
        <div className="flex items-baseline gap-4">
          <span className="font-west text-2xl font-black tabular-nums" style={{ color: index % 2 === 0 ? "var(--qa)" : "var(--qb)" }}>
            №{index + 1}
          </span>
          <span className="tabular font-mono text-[11px] text-ink/55">{entry.id}</span>
        </div>
        <div className="flex items-baseline gap-4 font-mono text-[10px] tracking-wider text-ink/50">
          <span>{fmtDate(entry.date)}</span>
          <span>{modeStr}</span>
        </div>
      </header>

      {/* 胜负主版 */}
      <div className="grid gap-6 px-5 py-6 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] sm:px-7">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ink/50">RESULT · 收笔</p>
          <p className="mt-2 font-display text-4xl font-black leading-tight" style={{ color: winnerColor }}>
            {entry.winner ? `${winnerLabel} 胜` : "未分胜负"}
          </p>
          <p className="mt-1 font-mono text-[11px] text-ink/55">
            {entry.winReason === "resign"
              ? four
                ? "众席认输 · 末位收笔"
                : "认输收束"
              : entry.winReason === "timeout"
                ? four
                  ? "众席超时出局 · 末位收笔"
                  : "超时判负"
                : entry.winReason === "last"
                  ? "众席出局 · 末位收笔"
                  : "抵达底线"}{" "}
            · {entry.moveCount} 手{four ? " · 四人围坐" : ""}
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-ink bg-transparent font-mono text-[11px] hover:bg-ink hover:text-paper"
              onClick={() => openPoster(entry)}
            >
              <ImageDown className="h-3.5 w-3.5" aria-hidden />
              棋谱海报
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 font-mono text-[11px] text-ink/45 hover:text-ink"
              onClick={() => deleteEntry(entry.id)}
              aria-label="销毁此卷宗"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              销毁
            </Button>
          </div>
        </div>

        {/* 数据小注 */}
        <div className="border-l-0 pl-0 sm:border-l sm:border-dashed sm:border-ink/35 sm:pl-6">
          <p className="font-mono text-[10px] tracking-[0.3em] text-ink/50">MARGINALIA · 数据小注</p>
          <ul className="mt-3 space-y-2.5">
            {notes.map((n, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink/80">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: i % 2 === 0 ? "var(--qa)" : "var(--qb)" }} aria-hidden />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 着法卷宗（折叠） */}
      <div className="border-t border-ink/30">
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-2.5 font-mono text-[11px] tracking-wider text-ink/60 hover:bg-ink/[0.04] sm:px-7"
          onClick={() => setOpenMoves((v) => !v)}
          aria-expanded={openMoves}
        >
          <span>卷宗着法 · {entry.moves.length} 着</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openMoves && "rotate-180")} aria-hidden />
        </button>
        {openMoves && (
          <ol className="scroll-ink max-h-56 overflow-y-auto border-t border-ink/20 px-5 py-3 sm:px-7">
            {entry.moves.map((m) => (
              <li key={m.n} className="flex items-baseline gap-3 py-[2px]">
                <span className="tabular w-7 shrink-0 text-[11px] text-ink/45">{String(m.n).padStart(2, "0")}</span>
                <span className="w-5 shrink-0 text-[11px] font-bold" style={{ color: playerColorVar(m.player) }}>
                  {PLAYER_CN[m.player]}
                </span>
                <span className="tabular text-[12px]" style={{ color: playerColorVar(m.player) }}>
                  {m.notation}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </motion.article>
  );
}

export function ArchiveView() {
  const archive = useQuoridor((s) => s.archive);
  const setView = useQuoridor((s) => s.setView);

  return (
    <section aria-label="棋谱档案馆" className="mx-auto w-full max-w-5xl px-6 py-16 sm:px-10 sm:py-20">
      <header className="mb-10">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-4">
          <h2 className="font-display text-4xl font-black text-ink sm:text-5xl">
            棋谱档案馆
            <span className="ml-4 font-west text-base font-normal italic text-ink/55">the archive</span>
          </h2>
          <span className="font-mono text-[10px] tracking-[0.4em] text-ink/50">CH.05</span>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/70">
          每一局收笔的棋谱都装订成卷宗，垂直铺开成跨页。卷内记着双方、步数、胜负，
          页边写满数据小注；点开「卷宗着法」可通读全谱，也可随时把某一局印成海报。
        </p>
      </header>

      {archive.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border-2 border-dashed border-ink/40 px-6 py-20 text-center">
          <ArchiveX className="h-10 w-10 text-ink/30" aria-hidden />
          <p className="font-display text-xl font-bold text-ink/60">档案馆尚无卷宗</p>
          <p className="max-w-sm text-sm leading-relaxed text-ink/55">
            空的书脊立在这里等棋谱。去下一局棋，收笔时按「保存此局入档」，
            这一格就会立起第一册卷宗。
          </p>
          <Button
            variant="outline"
            className="mt-2 border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper"
            onClick={() => setView("contents")}
          >
            去开一局
          </Button>
        </div>
      ) : (
        <div className="space-y-10">
          {archive.map((e, i) => (
            <Spread key={e.id} entry={e} index={i} />
          ))}
        </div>
      )}

      <div className="mt-14 border-t-2 border-ink pt-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 font-mono text-xs text-ink/60 hover:text-ink"
          onClick={() => setView("contents")}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          返回目录
        </Button>
      </div>
    </section>
  );
}
