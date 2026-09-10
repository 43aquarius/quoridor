"use client";

/* 02 双人同屏 —— 版式与棋钟规格选择页：选定后翻开棋盘。
 * 原目录「点开即开局」改为先选规格，一册棋盘两副活字再落座。
 */

import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import { recommendedWalls } from "@/lib/game/types";
import { FormatPanel } from "./FormatPanel";
import { ClockPanel } from "./ClockPanel";
import { Button } from "@/components/ui/button";
import { configLabel, timeLabel } from "@/lib/game/types";

export function LocalSetupView() {
  const setView = useQuoridor((s) => s.setView);
  const startGame = useQuoridor((s) => s.startGame);
  const config = useQuoridor((s) => s.config);
  const setConfig = useQuoridor((s) => s.setConfig);

  /* 进入本章即归一为二人规格（四人请走第Ⅲ章） */
  useEffect(() => {
    setConfig({ playerCount: 2, wallsPerPlayer: recommendedWalls(config.size, 2) });
     
  }, []);

  return (
    <section aria-label="双人同屏开卷" className="mx-auto w-full max-w-4xl px-6 py-16 sm:px-10 sm:py-20">
      <header className="mb-10">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-4">
          <h2 className="font-display text-4xl font-black text-ink sm:text-5xl">
            双人同屏
            <span className="ml-4 font-west text-base font-normal italic text-ink/55">two readers, one board</span>
          </h2>
          <span className="font-mono text-[10px] tracking-[0.4em] text-ink/50">CH.02</span>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/70">
          一册棋盘，两副活字。回合切换时，纸面会轻轻换页——为甲执红时棋盘自左侧翻入，
          为乙执蓝时自右侧翻入。先选一版开本与棋钟：小盘短打见分晓，大盘绕路藏机锋；
          挂了钟，超时即判负。
        </p>
      </header>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <FormatPanel />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12 }}
        className="mt-8"
      >
        <ClockPanel />
      </motion.div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 font-mono text-xs text-ink/60 hover:text-ink"
          onClick={() => setView("contents")}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          返回目录
        </Button>
        <Button
          size="lg"
          className="gap-2.5 bg-ink px-8 font-mono text-sm font-bold text-paper hover:bg-ink/85"
          onClick={() => startGame("local", undefined, { ...config, playerCount: 2 })}
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          按此开本开局 · {configLabel(config)} · {timeLabel(config.timeControl)}
        </Button>
      </div>

      <p className="mt-6 font-mono text-[10px] tracking-[0.25em] text-ink/40">
        悔棋在双人局撤回一手 · 认输随时可落笔 · 挂钟则超时判负 · 收笔后自动入档
      </p>
    </section>
  );
}
