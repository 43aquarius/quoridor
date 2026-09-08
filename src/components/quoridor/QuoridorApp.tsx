"use client";

/* 全书装帧：纸面噪点、刊头 running head、页码 folio、
 * 视图切换 cross-fade + 水平滑动（翻页语言），riso 光标拖尾。
 */

import { AnimatePresence, motion } from "framer-motion";
import { useQuoridor } from "@/store/game-store";
import { skinById } from "@/lib/game/types";
import { HeroView } from "./HeroView";
import { ContentsView } from "./ContentsView";
import { SetupView } from "./SetupView";
import { RoomView } from "./RoomView";
import { GameView } from "./GameView";
import { RulesView } from "./RulesView";
import { ArchiveView } from "./ArchiveView";
import { CursorTrail } from "./CursorTrail";
import { PosterModal } from "./PosterModal";

const PAGE_LABEL: Record<string, string> = {
  hero: "封面",
  contents: "目 录",
  setup: "第Ⅰ章 · 单人对弈",
  room: "第Ⅲ章 · 在线对战",
  game: "对局页",
  rules: "第Ⅳ章 · 规则",
  archive: "第Ⅴ章 · 棋谱档案馆",
};

const FOLIO: Record<string, string> = {
  hero: "F",
  contents: "i",
  setup: "1",
  room: "3",
  game: "∞",
  rules: "4",
  archive: "5",
};

const variants = {
  enter: { opacity: 0, x: 56 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -56 },
};

export function QuoridorApp() {
  const view = useQuoridor((s) => s.view);
  const skin = useQuoridor((s) => s.skin);
  const posterOpen = useQuoridor((s) => s.posterOpen);

  return (
    <div
      className={`skin-${skin} relative min-h-[100svh] w-full overflow-x-clip bg-paper text-ink`}
    >
      {/* 纸面噪点 */}
      <div className="noise-overlay" aria-hidden />
      {/* riso 光标拖尾 */}
      <CursorTrail />

      {/* 刊头（非封面时显示） */}
      {view !== "hero" && (
        <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-2.5 mix-blend-multiply sm:px-8">
          <span className="font-mono text-[9px] tracking-[0.35em] text-ink/50">
            步步为营 · QUORIDOR — 限量印刷棋谱专著
          </span>
          <span className="font-mono text-[9px] tracking-[0.35em] text-ink/50">
            {skinById(skin).label} 套印
          </span>
        </header>
      )}

      {/* 页码（非封面、非对局时显示） */}
      {view !== "hero" && view !== "game" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-30 text-center font-mono text-[10px] tracking-[0.4em] text-ink/45">
          — {FOLIO[view] ?? "·"} —
        </div>
      )}

      <main className="relative z-10 flex min-h-[100svh] flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-1 flex-col"
          >
            {view === "hero" && <HeroView />}
            {view === "contents" && <ContentsView />}
            {view === "setup" && <SetupView />}
            {view === "room" && <RoomView />}
            {view === "game" && <GameView />}
            {view === "rules" && <RulesView />}
            {view === "archive" && <ArchiveView />}
          </motion.div>
        </AnimatePresence>
      </main>

      <span className="sr-only" aria-live="polite">
        {PAGE_LABEL[view]}
      </span>

      {posterOpen && <PosterModal />}
    </div>
  );
}
