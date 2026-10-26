"use client";

/* 结算：整页高对比翻转为墨黑底纸白字，超大印章字以盖压动画砸下——
 * 观屏者赢则盖「胜」，观屏者输则盖同款样式的「败」；
 * 附战绩排版；可保存此局入档案馆、生成棋谱海报、再来一局。
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Archive, ImageDown, RotateCcw, ListOrdered } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import { AI_PROFILES, PLAYER4_COLORS, PLAYER_CN, skinById } from "@/lib/game/types";
import { playStamp } from "@/lib/game/sounds";
import { clearIdentity } from "@/lib/online/client";
import { Button } from "@/components/ui/button";
import { PosterModal } from "./PosterModal";
import type { ArchiveEntry } from "@/lib/game/archive";

export function VictoryOverlay() {
  const state = useQuoridor((s) => s.state);
  const mode = useQuoridor((s) => s.mode);
  const aiLevel = useQuoridor((s) => s.aiLevel);
  const meta = useQuoridor((s) => s.meta);
  const skin = useQuoridor((s) => s.skin);
  const saveToArchive = useQuoridor((s) => s.saveToArchive);
  const startGame = useQuoridor((s) => s.startGame);
  const setView = useQuoridor((s) => s.setView);
  const setOnline = useQuoridor((s) => s.setOnline);
  const openPoster = useQuoridor((s) => s.openPoster);
  const [saved, setSaved] = useState<ArchiveEntry | null>(null);

  useEffect(() => {
    if (state?.winner) {
      const t = setTimeout(() => playStamp(), 240);
      return () => clearTimeout(t);
    }
  }, [state?.winner]);

  if (!state || !state.winner) return null;

  const winner = state.winner;
  const four = state.playerCount === 4;
  const seatConfig = useQuoridor.getState().seatConfig;
  const online = useQuoridor.getState().online;
  const playerSeat = useQuoridor.getState().playerSeat;
  /* 观屏者视角：败方不再盖「胜」，改盖同款「败」章。
   * 单人对 AI —— 看我执哪席（playerSeat）；
   * 在线对战 —— 看我坐哪席（online.myPlayer，四人房同理）；
   * 本地四人围坐 —— 同屏共享，赢家是真人席则屏上有赢家（胜），赢家是 AI 席则真人均败（败）；
   * 本地双人同屏 —— 一屏共赏，恒以胜者作章。 */
  const iWon =
    mode === "online" && online
      ? online.myPlayer === winner
      : mode === "ai"
        ? (playerSeat ?? "A") === winner
        : four
          ? seatConfig?.[winner]?.kind !== "ai"
          : true;
  const winnerColor = four ? PLAYER4_COLORS[winner] : winner === "A" ? "var(--qa)" : "var(--qb)";
  const sk = skinById(skin);
  const winnerHex = four ? PLAYER4_COLORS[winner] : winner === "A" ? sk.a : sk.b;
  const winnerName = four
    ? (() => {
        const sc = seatConfig?.[winner];
        if (sc?.kind === "ai") return `${AI_PROFILES[sc.level].name}（${PLAYER_CN[winner]}）`;
        const os = online?.seats?.find((s) => s.player === winner);
        if (os?.isAi && os.aiLevel) return `${AI_PROFILES[os.aiLevel as 1 | 2 | 3 | 4].name}（${PLAYER_CN[winner]}）`;
        if (mode === "online" && online) return online.myPlayer === winner ? `你（${PLAYER_CN[winner]}）` : `棋友（${PLAYER_CN[winner]}）`;
        return `真人（${PLAYER_CN[winner]}）`;
      })()
    : winner === "A"
      ? mode === "ai"
        ? "你（甲）"
        : "甲"
      : mode === "ai" && aiLevel
        ? `${AI_PROFILES[aiLevel].name}（乙）`
        : mode === "online"
          ? "对手（乙）"
          : "乙";
  const reason =
    state.winReason === "resign"
      ? four
        ? "众席认输 · 末位收笔"
        : "认输收束"
      : state.winReason === "timeout"
        ? four
          ? "众席超时出局 · 末位收笔"
          : "超时判负"
        : state.winReason === "last"
          ? "众席出局 · 末位收笔"
          : "抵达底线";

  /* 战绩行：四人局逐席展示挡板用量 / 归途峰值 */
  const statItems: Array<{ k: string; v: string }> = [
    { k: "总手数", v: `${state.history.length} 手` },
    { k: "全局用时", v: `${Math.round((Date.now() - meta.startedAt) / 1000)} 秒` },
  ];
  if (four) {
    const wallLine = ["A", "B", "C", "D"]
      .map((p) => {
        const used = state.wallsStart - (p === "A" ? state.wallsA : p === "B" ? state.wallsB : p === "C" ? (state.wallsC ?? 0) : (state.wallsD ?? 0));
        return `${PLAYER_CN[p]} ${used}`;
      })
      .join(" / ");
    const pathLine = ["A", "B", "C", "D"]
      .map((p) => {
        const mp = p === "A" ? meta.maxPathA : p === "B" ? meta.maxPathB : p === "C" ? (meta.maxPathC ?? 0) : (meta.maxPathD ?? 0);
        return `${PLAYER_CN[p]} ${mp}`;
      })
      .join(" / ");
    statItems.push({ k: "挡板用量", v: wallLine }, { k: "最远归途", v: pathLine });
  } else {
    statItems.push(
      { k: "挡板用量", v: `甲 ${state.wallsStart - state.wallsA} / 乙 ${state.wallsStart - state.wallsB}` },
      { k: "最远归途", v: `甲 ${meta.maxPathA} 步 / 乙 ${meta.maxPathB} 步` },
    );
  }

  const handleSave = () => {
    const entry = saveToArchive();
    if (entry) setSaved(entry);
  };

  const handlePoster = () => {
    const entry = saved ?? saveToArchive();
    if (entry) openPoster(entry);
  };

  /* 在线对局收束后的离场清理：清掉凭证与在线会话，
   * 防止重进「在线对战」时凭旧身份回座、被已终的局面直接拉回结算画面。 */
  const leaveEndedOnline = (target: "contents" | "room") => {
    clearIdentity();
    setOnline(null);
    setView(target);
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink text-paper" role="dialog" aria-label="对局结果">
      {/* 反相噪点 */}
      <div className="noise-overlay on-inverse" aria-hidden />
      <div className="page-shake relative mx-auto flex min-h-full w-full max-w-4xl flex-col items-center px-6 py-16">
        {/* 章头 */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="flex w-full items-baseline justify-between border-b border-paper/40 pb-3"
        >
          <span className="font-mono text-[10px] tracking-[0.4em] text-paper/60">
            THE GAME IS SET — FINAL PROOF
          </span>
          <span className="font-mono text-[10px] tracking-[0.3em] text-paper/60">
            第 {state.history.length} 手收笔
          </span>
        </motion.div>

        {/* 印章大字 */}
        <div className="relative mt-12 flex items-center justify-center" aria-hidden>
          <span
            className="stamp-slam block font-display font-black leading-none"
            style={{
              fontSize: "clamp(9rem, 34vmin, 22rem)",
              color: "var(--paper)",
              textShadow: `6px 6px 0 ${winnerHex}`,
            }}
          >
            {iWon ? "胜" : "败"}
          </span>
          {/* 印章框 */}
          <motion.span
            initial={{ opacity: 0, scale: 1.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.55, duration: 0.3 }}
            className="absolute rounded-[6px] border-[5px]"
            style={{
              width: "min(46vmin, 330px)",
              height: "min(46vmin, 330px)",
              borderColor: winnerHex,
              transform: "rotate(-4deg)",
              mixBlendMode: "screen",
            }}
          />
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.7 }}
          className="mt-10 text-center font-display text-2xl font-bold sm:text-3xl"
        >
          {winnerName} 执笔写完了最后一行
          <span className="ml-3 font-mono text-sm font-normal text-paper/60">({reason})</span>
        </motion.p>

        {/* 战绩排版 */}
        <motion.dl
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.7 }}
          className="mt-10 grid w-full max-w-2xl grid-cols-2 gap-x-10 gap-y-5 border-y border-paper/30 py-8 sm:grid-cols-4"
        >
          {statItems.map((it) => (
            <div key={it.k} className="flex flex-col gap-1">
              <dt className="font-mono text-[10px] tracking-[0.3em] text-paper/50">{it.k}</dt>
              <dd className="tabular text-lg font-bold text-paper">{it.v}</dd>
            </div>
          ))}
        </motion.dl>

        {/* 操作 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3, duration: 0.6 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3 pb-8"
        >
          <Button
            size="lg"
            className="gap-2 border-2 border-paper bg-transparent font-mono text-sm text-paper hover:bg-paper hover:text-ink"
            onClick={handleSave}
            disabled={meta.archived}
            style={{ borderColor: "var(--paper)" }}
          >
            <Archive className="h-4 w-4" aria-hidden />
            {meta.archived ? "已收入档案馆" : "保存此局入档"}
          </Button>
          <Button
            size="lg"
            className="gap-2 border-2 font-mono text-sm text-ink hover:opacity-90"
            style={{ background: winnerColor, borderColor: winnerColor, color: "#F5F2EA" }}
            onClick={handlePoster}
          >
            <ImageDown className="h-4 w-4" aria-hidden />
            生成棋谱海报
          </Button>          <Button
            size="lg"
            variant="ghost"
            className="gap-2 font-mono text-sm text-paper/70 hover:bg-paper/10 hover:text-paper"
            onClick={() =>
              mode === "online"
                ? leaveEndedOnline("room")
                : startGame(mode ?? "local", aiLevel ?? undefined)
            }
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {mode === "online" ? "再开一间房" : "再来一局"}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="gap-2 font-mono text-sm text-paper/70 hover:bg-paper/10 hover:text-paper"
            onClick={() => (mode === "online" ? leaveEndedOnline("contents") : setView("contents"))}
          >
            <ListOrdered className="h-4 w-4" aria-hidden />
            返回目录
          </Button>
        </motion.div>

        {/* 棋盘版画注脚：这局棋盘本身就是一张棋谱 */}
        <p className="pb-6 text-center font-mono text-[10px] leading-relaxed tracking-[0.2em] text-paper/40">
          这盘棋留在纸面上的每一道墨迹，此刻正是一张可读的棋谱版画。
        </p>
      </div>

      <PosterModal />
    </div>
  );
}
