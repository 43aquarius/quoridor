"use client";

/* 对局页：棋盘居中偏左，右侧杂志边栏。
 * 双人同屏：回合切换时视角轻微 cross-fade + 水平滑动。
 * AI 模式：0.6–1.5 秒「思考」延迟后经 Web Worker 计算落子，不阻塞 UI。
 */

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuoridor } from "@/store/game-store";
import { AI_PROFILES } from "@/lib/game/types";
import { stateFromHistory } from "@/lib/game/engine";
import { requestAiMove } from "@/lib/game/ai-client";
import { useOnlineSync } from "@/hooks/use-online-sync";
import { useToast } from "@/hooks/use-toast";
import { Board } from "./Board";
import { Sidebar } from "./Sidebar";
import { VictoryOverlay } from "./VictoryOverlay";

const REJECT_MSG: Record<string, string> = {
  overlap: "挡板与已有铅条重叠，同一条格线凹槽容不下两块板。",
  cross: "挡板与已有挡板十字交叉，印刷规矩不允许。",
  "no-path": "此路不通——这根板会封死一方去往底线的全部路径。",
  "no-walls": "挡板已经用尽，只能行棋。",
  "not-your-turn": "还未轮到你落子。",
  "illegal-pawn": "这步棋不可行：不可穿墙，也不可走入对方格。",
};

export function GameView() {
  const state = useQuoridor((s) => s.state);
  const mode = useQuoridor((s) => s.mode);
  const aiLevel = useQuoridor((s) => s.aiLevel);
  const meta = useQuoridor((s) => s.meta);
  const online = useQuoridor((s) => s.online);
  const setAiThinking = useQuoridor((s) => s.setAiThinking);
  const applyAiMove = useQuoridor((s) => s.applyAiMove);
  const { toast } = useToast();

  useOnlineSync(mode === "online");

  /* 回放态：展示至第 replayIndex 手 */
  const displayState = useMemo(() => {
    if (!state) return null;
    if (meta.replayIndex == null) return state;
    return stateFromHistory(state.history, meta.replayIndex);
  }, [state, meta.replayIndex]);

  /* AI 回合：思考延迟 + Worker 计算 */
  useEffect(() => {
    if (mode !== "ai" || !state || !aiLevel) return;
    if (state.winner || state.turn !== "B" || meta.replayIndex != null) return;
    let cancelled = false;
    const delay = 600 + Math.random() * 900;
    setAiThinking(true, AI_PROFILES[aiLevel].thinking);
    const timer = setTimeout(async () => {
      const decision = await requestAiMove(state, aiLevel);
      if (cancelled) return;
      if (decision) {
        applyAiMove(decision.payload, decision.label);
      } else {
        setAiThinking(false);
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setAiThinking(false);
    };
  }, [mode, aiLevel, state, meta.replayIndex, setAiThinking, applyAiMove]);

  /* 校对退回提示 */
  const rejectT = meta.lastReject?.t;
  const rejectReason = meta.lastReject?.reason;
  useEffect(() => {
    if (!rejectT || !rejectReason) return;
    toast({
      title: "校对退回 PROOF REJECTED",
      description: REJECT_MSG[rejectReason] ?? "着法未获通过。",
    });
  }, [rejectT, rejectReason, toast]);

  if (!state || !displayState) return null;

  const interactive =
    !state.winner &&
    meta.replayIndex == null &&
    !meta.aiThinking &&
    (mode === "local"
      ? true
      : mode === "ai"
        ? state.turn === "A"
        : mode === "online" && online
          ? online.phase === "playing" && state.turn === online.myPlayer
          : false);

  const modeLabel =
    mode === "ai" && aiLevel
      ? `单人对弈 · 对手：${AI_PROFILES[aiLevel].name}`
      : mode === "local"
        ? "双人同屏"
        : "在线对战";

  return (
    <section aria-label="对局" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      {/* 章头 */}
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b-2 border-ink pb-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-2xl font-black text-ink sm:text-3xl">对 局</h2>
          <span className="font-mono text-[10px] tracking-[0.25em] text-ink/50">{modeLabel}</span>
          {meta.replayIndex != null && (
            <span className="border border-qa px-2 py-0.5 font-mono text-[10px]" style={{ borderColor: "var(--qa)", color: "var(--qa)" }}>
              回放中 · 第 {meta.replayIndex} 手
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-4 font-mono text-[10px] tracking-wider text-ink/50">
          <span>第 {Math.max(1, state.history.length + (state.winner ? 0 : 1))} 手</span>
          {mode === "online" && online && <span>房间 {online.roomCode} · 你执{online.myPlayer === "A" ? "红先行" : "蓝后行"}</span>}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_390px]">
        {/* 棋盘：双人模式回合切换时轻微换页 */}
        <div className="flex items-start justify-center lg:justify-start">
          <motion.div
            key={mode === "local" ? `turn-${displayState.turn}` : "board"}
            initial={mode === "local" ? { x: displayState.turn === "A" ? 20 : -20, opacity: 0.5 } : false}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[min(94vw,72vh,640px)]"
          >
            <Board state={displayState} interactive={interactive} />
          </motion.div>
        </div>

        <Sidebar />
      </div>

      <VictoryOverlay />
    </section>
  );
}
