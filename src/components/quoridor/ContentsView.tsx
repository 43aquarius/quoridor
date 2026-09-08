"use client";

/* 目录页：Contents 排版 —— 章节条目 + 点线引导 + 续读入口 + 色版与音效 */

import { motion } from "framer-motion";
import { Volume2, VolumeX, BookOpen } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import { SkinFilmStrip } from "./SkinFilmStrip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { View } from "@/store/game-store";

interface TocItem {
  idx: string;
  title: string;
  en: string;
  desc: string;
  view: View;
  page: string;
}

const TOC: TocItem[] = [
  {
    idx: "01",
    title: "单人对弈",
    en: "SOLO — AGAINST THE DESK",
    desc: "与编辑部过招：学徒 · 排字师 · 总编，三档职位任选。",
    view: "setup",
    page: "Ⅰ",
  },
  {
    idx: "02",
    title: "双人同屏",
    en: "TWO READERS, ONE BOARD",
    desc: "一册棋盘，两副活字。回合切换时，纸面轻轻换页。",
    view: "game",
    page: "Ⅱ",
  },
  {
    idx: "03",
    title: "在线对战",
    en: "PLAY ACROSS THE MARGIN",
    desc: "四位房间码开房对坐，实时同步；断线五分钟内可回座。",
    view: "room",
    page: "Ⅲ",
  },
  {
    idx: "04",
    title: "规则",
    en: "EDITOR’S NOTE ON THE RULES",
    desc: "编者按：关于行棋、挡板与跳子的全部排版纪律。",
    view: "rules",
    page: "Ⅳ",
  },
  {
    idx: "05",
    title: "棋谱档案馆",
    en: "THE ARCHIVE OF GAMES",
    desc: "历史对局的全宗卷宗，每一局是一页可翻的 spread。",
    view: "archive",
    page: "Ⅴ",
  },
];

export function ContentsView() {
  const setView = useQuoridor((s) => s.setView);
  const startGame = useQuoridor((s) => s.startGame);
  const hasSaved = useQuoridor((s) => s.hasSavedGame);
  const resumeSaved = useQuoridor((s) => s.resumeSaved);
  const discardSaved = useQuoridor((s) => s.discardSaved);
  const soundOn = useQuoridor((s) => s.soundOn);
  const toggleSound = useQuoridor((s) => s.toggleSound);
  const archive = useQuoridor((s) => s.archive);

  const go = (item: TocItem) => {
    if (item.view === "game") startGame("local");
    else setView(item.view);
  };

  return (
    <section aria-label="目录" className="relative mx-auto flex min-h-[100svh] w-full max-w-5xl flex-col px-6 py-16 sm:px-10 sm:py-20">
      {/* 章头 */}
      <header className="mb-10 sm:mb-14">
        <p className="mb-2 font-mono text-[10px] tracking-[0.5em] text-ink/55">TABLE OF CONTENTS</p>
        <div className="flex items-end justify-between border-b-2 border-ink pb-4">
          <h2 className="font-display text-5xl font-black leading-none text-ink sm:text-6xl">目 录</h2>
          <p className="hidden font-west text-sm italic text-ink/60 sm:block">five chapters, one game</p>
        </div>
      </header>

      {/* 续读上一局 */}
      {hasSaved && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-wrap items-center justify-between gap-3 border-l-4 border-qa bg-ink/[0.04] px-5 py-3.5"
        >
          <div className="flex items-center gap-3">
            <BookOpen className="h-4 w-4 shrink-0" style={{ color: "var(--qa)" }} aria-hidden />
            <p className="text-sm text-ink">
              书签还夹在上一局：纸面存有未完的棋局，可续读。
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-ink bg-transparent font-mono text-xs"
              onClick={() => resumeSaved()}
            >
              续读 RESUME
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 font-mono text-xs text-ink/50"
              onClick={discardSaved}
            >
              抽掉书签
            </Button>
          </div>
        </motion.div>
      )}

      {/* 目录条目 */}
      <nav aria-label="章节导航" className="flex flex-1 flex-col">
        {TOC.map((item, i) => (
          <motion.button
            key={item.idx}
            type="button"
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.12 + i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => go(item)}
            className={cn(
              "group flex w-full items-baseline gap-4 border-b border-ink/25 py-5 text-left sm:gap-6 sm:py-6",
              "transition-colors hover:bg-ink/[0.035] focus-visible:bg-ink/[0.035] focus-visible:outline-none",
            )}
          >
            <span
              className="font-west text-3xl font-black tabular-nums leading-none transition-transform duration-300 group-hover:-translate-y-0.5 sm:text-5xl"
              style={{ color: i % 2 === 0 ? "var(--qa)" : "var(--qb)" }}
            >
              {item.idx}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-baseline gap-3">
                <span className="font-display text-xl font-bold text-ink sm:text-2xl">{item.title}</span>
                <span className="hidden font-mono text-[10px] tracking-[0.22em] text-ink/45 sm:inline">{item.en}</span>
              </span>
              <span className="text-sm leading-relaxed text-ink/65">{item.desc}</span>
              {item.view === "archive" && archive.length > 0 && (
                <span className="font-mono text-[10px] tracking-wider text-ink/40">
                  现存 {archive.length} 局卷宗
                </span>
              )}
            </span>
            <span className="mx-2 hidden flex-1 self-end border-b border-dotted border-ink/45 sm:block" aria-hidden />
            <span
              className="shrink-0 self-end font-west text-lg italic text-ink/55 transition-transform duration-300 group-hover:-translate-x-1 sm:text-xl"
              aria-hidden
            >
              {item.page}
            </span>
          </motion.button>
        ))}
      </nav>

      {/* 页脚：色版 + 音效 */}
      <footer className="mt-12 flex flex-wrap items-end justify-between gap-6 border-t border-ink/50 pt-6">
        <SkinFilmStrip />
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? "关闭音效" : "开启音效"}
          className="flex items-center gap-2 border border-ink px-4 py-2 font-mono text-[11px] tracking-[0.2em] text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          {soundOn ? <Volume2 className="h-3.5 w-3.5" aria-hidden /> : <VolumeX className="h-3.5 w-3.5" aria-hidden />}
          活版音效 {soundOn ? "ON" : "OFF"}
        </button>
      </footer>
    </section>
  );
}
