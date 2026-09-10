"use client";

/* 对局页：棋盘居中偏左，右侧杂志边栏。
 * 双人同屏：回合切换时视角轻微 cross-fade + 水平滑动。
 * AI 模式：0.6–1.5 秒「思考」延迟后经 Web Worker 计算落子，不阻塞 UI。
 */

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuoridor, isSeatAi } from "@/store/game-store";
import { AI_PROFILES, PLAYER_CN, configLabel, playerColorVar } from "@/lib/game/types";
import { stateFromHistory } from "@/lib/game/engine";
import { requestAiMove } from "@/lib/game/ai-client";
import { useOnlineSync } from "@/hooks/use-online-sync";
import { useClockWatch } from "@/hooks/use-clock";
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
  const seatConfig = useQuoridor((s) => s.seatConfig);
  const setAiThinking = useQuoridor((s) => s.setAiThinking);
  const applyAiMove = useQuoridor((s) => s.applyAiMove);
  const { toast } = useToast();

  const { requestResync } = useOnlineSync(mode === "online");
  useClockWatch(true);

  const four = state?.playerCount === 4;

  /* 回放态：展示至第 replayIndex 手 */
  const displayState = useMemo(() => {
    if (!state) return null;
    if (meta.replayIndex == null) return state;
    return stateFromHistory(state.history, meta.replayIndex, {
      size: state.size,
      wallsPerPlayer: state.wallsStart,
      playerCount: state.playerCount,
    });
  }, [state, meta.replayIndex]);

  /* AI 回合：思考延迟 + Worker 计算（高档位搜索耗时长，延迟相应缩短）
   * 二人单机（ai）：对手乙；本地四人（local + seatConfig）：当前 AI 席位 */
  const aiSeatLevel = useMemo(() => {
    if (mode === "ai" && aiLevel && state && state.turn === "B" && state.playerCount === 2) return aiLevel;
    if (mode === "local" && four && state && seatConfig) {
      const sc = seatConfig[state.turn];
      if (sc?.kind === "ai") return sc.level;
    }
    return null;
  }, [mode, aiLevel, state, four, seatConfig]);

  useEffect(() => {
    if (!aiSeatLevel || !state || meta.replayIndex != null) return;
    if (state.winner) return;
    let cancelled = false;
    const lv = aiSeatLevel;
    const delay =
      lv >= 4 ? 150 + Math.random() * 250 : lv === 3 ? 300 + Math.random() * 300 : 600 + Math.random() * 900;
    setAiThinking(true, AI_PROFILES[lv].thinking);
    const timer = setTimeout(async () => {
      const decision = await requestAiMove(state, lv);
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
  }, [aiSeatLevel, state, meta.replayIndex, setAiThinking, applyAiMove]);

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

  /* 当前行棋席位是否由本端操控（双人同屏=全真人；四人本地=该席非 AI；在线=轮到你且你未出局） */
  const humanControlsTurn =
    mode === "local"
      ? four
        ? !isSeatAi(seatConfig, state.turn)
        : true
      : mode === "ai"
        ? state.turn === "A"
        : mode === "online" && online
          ? online.phase === "playing" && state.turn === online.myPlayer
          : false;

  const interactive =
    !state.winner &&
    meta.replayIndex == null &&
    !meta.aiThinking &&
    humanControlsTurn;

  const modeLabel =
    mode === "ai" && aiLevel
      ? `单人对弈 · 对手：${AI_PROFILES[aiLevel].name}`
      : mode === "local"
        ? four
          ? "四人围坐"
          : "双人同屏"
        : four
          ? "在线四人围桌"
          : "在线对战";

  const reconnecting = mode === "online" && online?.phase === "reconnecting";

  return (
    <section aria-label="对局" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      {/* 章头 */}
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b-2 border-ink pb-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-2xl font-black text-ink sm:text-3xl">对 局</h2>
          <span className="font-mono text-[10px] tracking-[0.25em] text-ink/50">{modeLabel}</span>
          {state && (
            <span className="tabular border border-ink/45 px-2 py-0.5 font-mono text-[10px] text-ink/60">
              {configLabel({ size: state.size, wallsPerPlayer: state.wallsStart, playerCount: state.playerCount })}
            </span>
          )}
          {meta.replayIndex != null && (
            <span className="border border-qa px-2 py-0.5 font-mono text-[10px]" style={{ borderColor: "var(--qa)", color: "var(--qa)" }}>
              回放中 · 第 {meta.replayIndex} 手
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-4 font-mono text-[10px] tracking-wider text-ink/50">
          <span>第 {Math.max(1, state.history.length + (state.winner ? 0 : 1))} 手</span>
          {mode === "online" && online && (
            four ? (
              <span>
                房间 {online.roomCode} · 你执{PLAYER_CN[online.myPlayer]}（<span style={{ color: playerColorVar(online.myPlayer) }}>■</span>）
                {state.eliminated?.includes(online.myPlayer) ? " · 你已出局（可旁观）" : ""}
              </span>
            ) : (
              <span>房间 {online.roomCode} · 你执{online.myPlayer === "A" ? "红先行" : "蓝后行"}</span>
            )
          )}
        </div>
      </header>

      {/* 断线重连横幅（仅在线） */}
      {reconnecting && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex flex-wrap items-center justify-between gap-3 border-2 px-4 py-2.5"
          style={{ borderColor: "var(--riso-red)", background: "rgba(255, 77, 46, 0.05)" }}
        >
          <p className="thinking-dots font-mono text-xs" style={{ color: "var(--riso-red)" }}>
            信道中断 · 正在重连（第 {online?.reconnectAttempt ?? 0} 次尝试）…… 棋面已存，不会丢失
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="border border-ink bg-paper px-3 py-1.5 font-mono text-[11px] text-ink transition-colors hover:bg-ink hover:text-paper"
              onClick={requestResync}
            >
              立即重连 RETRY
            </button>
            <span className="font-mono text-[10px] text-ink/45">网络恢复后自动回座</span>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_390px]">
        {/* 棋盘：双人模式回合切换时轻微换页（四人局不换页） */}
        <div className="flex items-start justify-center lg:justify-start">
          <motion.div
            key={mode === "local" && !four ? `turn-${displayState.turn}` : "board"}
            initial={mode === "local" && !four ? { x: displayState.turn === "A" ? 20 : -20, opacity: 0.5 } : false}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[min(94vw,72vh,640px)]"
          >
            <Board state={displayState} interactive={interactive} />
          </motion.div>
        </div>

        <Sidebar onRefresh={mode === "online" ? requestResync : undefined} />
      </div>

      <VictoryOverlay />
    </section>
  );
}
