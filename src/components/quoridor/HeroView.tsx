"use client";

/* 封面：超大宋体「步步为营」动态落位——字块微旋转归正，
 * 「营」字最后压下并晕开一圈墨痕；西文 QUORIDOR 副标 + 刊号式页脚。
 */

import { motion, useReducedMotion } from "framer-motion";
import { useQuoridor } from "@/store/game-store";
import { GithubMark, GITHUB_REPO_URL } from "./GithubMark";

const CHARS = ["步", "步", "为", "营"];

export function HeroView() {
  const setView = useQuoridor((s) => s.setView);
  const reduced = useReducedMotion();

  const settle = (i: number) => ({
    initial: {
      opacity: 0,
      y: -46,
      rotate: i % 2 === 0 ? -7 : 6,
      scale: 1.06,
    },
    animate: {
      opacity: 1,
      y: 0,
      rotate: 0,
      scale: 1,
    },
    transition: {
      delay: 0.28 + i * 0.34,
      duration: 0.6,
      ease: [0.22, 1.2, 0.36, 1] as const,
    },
  });

  return (
    <section
      aria-label="封面"
      className="relative flex min-h-[100svh] w-full flex-col items-center justify-center overflow-hidden px-6"
      onClick={() => setView("contents")}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setView("contents");
      }}
    >
      {/* 版心框 */}
      <div className="pointer-events-none absolute inset-4 border border-ink/70 sm:inset-6" />
      <div className="pointer-events-none absolute inset-[22px] border border-ink/40 sm:inset-[34px]" />

      <div className="relative flex flex-col items-center">
        {/* 刊头小字 */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.8 }}
          className="mb-8 font-mono text-[10px] tracking-[0.5em] text-ink/60 sm:text-xs"
        >
          限量印刷棋谱专著 · A MONOGRAPH THAT PLAYS BACK
        </motion.p>

        {/* 四字动态落位 */}
        <h1
          aria-label="步步为营"
          className="relative flex items-baseline justify-center font-display font-black leading-none text-ink"
          style={{ fontSize: "clamp(4.2rem, 19vw, 15rem)" }}
        >
          {CHARS.map((c, i) => (
            <span key={i} className="relative inline-block">
              <motion.span
                className="relative z-10 inline-block"
                {...(reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : settle(i))}
                style={{ transformOrigin: "50% 78%" }}
              >
                {c}
              </motion.span>
              {/* 套印错位幻影 */}
              {!reduced && (
                <motion.span
                  aria-hidden
                  className="absolute left-[3px] top-[3px] z-0 inline-block opacity-45 mix-blend-multiply"
                  style={{ color: "var(--qa)" }}
                  {...settle(i)}
                >
                  {c}
                </motion.span>
              )}
              {i === 3 && !reduced && (
                <>
                  {/* 「营」压下的墨痕：晕开的圆 */}
                  <motion.span
                    aria-hidden
                    className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-multiply"
                    style={{ background: "var(--ink)", width: "0.9em", height: "0.9em", filter: "blur(10px)" }}
                    initial={{ opacity: 0, scale: 0.3 }}
                    animate={{ opacity: [0, 0.14, 0.02], scale: [0.3, 1.5, 1.8] }}
                    transition={{ delay: 0.28 + 3 * 0.34 + 0.4, duration: 1.4, times: [0, 0.35, 1] }}
                  />
                  {/* 墨圈扩散 */}
                  <motion.span
                    aria-hidden
                    className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] mix-blend-multiply"
                    style={{ borderColor: "var(--ink)", width: "1.15em", height: "1.15em" }}
                    initial={{ opacity: 0, scale: 0.55 }}
                    animate={{ opacity: [0, 0.75, 0], scale: [0.55, 1.28] }}
                    transition={{ delay: 0.28 + 3 * 0.34 + 0.38, duration: 1.1, times: [0, 0.3, 1] }}
                  />
                </>
              )}
            </span>
          ))}
        </h1>

        {/* 西文副标 */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.1, duration: 0.9 }}
          className="mt-6 flex flex-col items-center gap-1"
        >
          <p className="font-west text-[clamp(1.1rem,4vw,2.1rem)] font-bold tracking-[0.42em] text-ink">
            QUORIDOR
          </p>
          <p className="font-mono text-[10px] tracking-[0.34em] text-ink/55">
            EST. 1997 · GIGAMIC PARIS — SET IN TYPE MMXXVI
          </p>
        </motion.div>

        {/* 翻开提示 */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ delay: 2.6, duration: 2.4, repeat: Infinity }}
          className="relative z-10 mt-8 border border-ink px-8 py-2.5 font-mono text-xs tracking-[0.4em] text-ink sm:mt-14"
          onClick={(e) => {
            e.stopPropagation();
            setView("contents");
          }}
        >
          翻开本书 OPEN
        </motion.button>
      </div>

      {/* 刊号式页脚 */}
      <footer className="absolute inset-x-0 bottom-8 px-8 sm:bottom-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-1.5 border-t border-ink/50 pt-4 text-center font-mono text-[9px] leading-relaxed tracking-[0.2em] text-ink/60 sm:text-[10px]">
          <p>第壹卷第壹版 · MMXXVI 限量玖拾玖部</p>
          <p>字体 思源宋体 Noto Serif SC / IBM Plex Mono / Playfair Display · 纸色 草浆纸白 №F5F2EA</p>
          <p>
            双色 RISOGRAPH 套印 <span style={{ color: "var(--qa)" }}>■ 荧光红</span> ×{" "}
            <span style={{ color: "var(--qb)" }}>■ 钴蓝</span> · 步步为营编辑部 出品
          </p>
          <p className="mt-1">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`开源仓库 GitHub（${GITHUB_REPO_URL}）`}
              className="pointer-events-auto inline-flex items-center gap-1.5 text-ink/60 underline decoration-ink/30 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
            >
              <GithubMark className="h-3 w-3" aria-hidden />
              开源仓库 OPEN SOURCE · github.com/43aquarius/quoridor
            </a>
          </p>
        </div>
      </footer>
    </section>
  );
}
