"use client";

/* 03 四人围坐 —— 本地四人局开卷页：席位配置（真人 / 编辑部 AI 代打）+ 版式 + 棋钟。
 * 四席分列四边中点：甲（南·红·向顶行）→ 丙（西·苔绿·向右列）→ 乙（北·蓝·向底行）→ 丁（东·墨黑·向左列），
 * 顺时针行棋；认输/超时为出局（铅字留盘），仅存一席时末位胜。
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Users, PenLine, Scissors, Crown, Landmark, User, Globe } from "lucide-react";
import { useQuoridor, type SeatConfig, type SeatKind } from "@/store/game-store";
import { AI_PROFILES, PLAYER_CN, PLAYER4_COLORS, playerColorVar, recommendedWalls, timeLabel, type AiLevel, type Player } from "@/lib/game/types";
import { FormatPanel } from "./FormatPanel";
import { ClockPanel } from "./ClockPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SEAT_META: Array<{ player: Player; pos: string; goal: string; goalEn: string }> = [
  { player: "A", pos: "南 · 底边中列", goal: "抵达顶行", goalEn: "NORTH" },
  { player: "C", pos: "西 · 左边中行", goal: "抵达右列", goalEn: "EAST" },
  { player: "B", pos: "北 · 顶边中列", goal: "抵达底行", goalEn: "SOUTH" },
  { player: "D", pos: "东 · 右边中行", goal: "抵达左列", goalEn: "WEST" },
];

const LEVEL_ICONS: Record<AiLevel, React.ReactNode> = {
  1: <PenLine className="h-4 w-4" aria-hidden />,
  2: <Scissors className="h-4 w-4" aria-hidden />,
  3: <Crown className="h-4 w-4" aria-hidden />,
  4: <Landmark className="h-4 w-4" aria-hidden />,
};

const DEFAULT_SEATS: SeatConfig = {
  A: { kind: "human" },
  B: { kind: "ai", level: 1 },
  C: { kind: "ai", level: 1 },
  D: { kind: "ai", level: 1 },
};

export function QuadSetupView() {
  const setView = useQuoridor((s) => s.setView);
  const startGame = useQuoridor((s) => s.startGame);
  const config = useQuoridor((s) => s.config);
  const setConfig = useQuoridor((s) => s.setConfig);
  const [seats, setSeats] = useState<SeatConfig>(DEFAULT_SEATS);

  /* 进入本章即切换为四人规格（挡板套用四人推荐值，页内可再自定义） */
  useEffect(() => {
    setConfig({ playerCount: 4, wallsPerPlayer: recommendedWalls(config.size, 4) });
     
  }, []);

  const setSeat = (p: Player, kind: SeatKind) => {
    setSeats((s) => ({ ...s, [p]: kind }));
  };

  const cycleSeat = (p: Player) => {
    const cur = seats[p];
    if (cur.kind === "human") setSeat(p, { kind: "ai", level: 1 });
    else if (cur.level < 4) setSeat(p, { kind: "ai", level: (cur.level + 1) as AiLevel });
    else setSeat(p, { kind: "human" });
  };

  const humanCount = (["A", "B", "C", "D"] as Player[]).filter((p) => seats[p].kind === "human").length;

  return (
    <section aria-label="四人围坐开卷" className="mx-auto w-full max-w-5xl px-6 py-16 sm:px-10 sm:py-20">
      <header className="mb-10">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-4">
          <h2 className="font-display text-4xl font-black text-ink sm:text-5xl">
            四人围坐
            <span className="ml-4 font-west text-base font-normal italic text-ink/55">four seats, one table</span>
          </h2>
          <span className="font-mono text-[10px] tracking-[0.4em] text-ink/50">CH.03</span>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/70">
          四副活字围一册棋盘：甲南·丙西·乙北·丁东，各据一边中点，顺时针行棋（甲→丙→乙→丁）。
          每人挡板减半（九路经典围坐为五根），先抵对岸者胜；认输与超时不再是终局——
          出局者的铅字留在盘上作障碍，仅存一席时末位收笔。空座可交给编辑部 AI 代打。
        </p>
      </header>

      {/* 席位配置 */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <section aria-label="席位配置" className="border-2 border-ink bg-paper" style={{ boxShadow: "6px 6px 0 var(--ink)" }}>
          <header className="flex items-center justify-between border-b border-ink/30 px-4 py-2.5 sm:px-5">
            <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-ink/55">
              <Users className="h-3.5 w-3.5" aria-hidden />
              席位配置 SEATS · 顺时针
            </span>
            <span className="font-mono text-[10px] text-ink/45">
              {humanCount} 位真人 · {4 - humanCount} 位编辑部代打 · 点击席位卡切换
            </span>
          </header>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
            {SEAT_META.map((meta, i) => {
              const seat = seats[meta.player];
              const color = playerColorVar(meta.player);
              const isHuman = seat.kind === "human";
              return (
                <motion.button
                  key={meta.player}
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06, duration: 0.4 }}
                  onClick={() => cycleSeat(meta.player)}
                  aria-label={`席位${PLAYER_CN[meta.player]}：${isHuman ? "真人" : `${AI_PROFILES[seat.level].name}代打`}，点击切换`}
                  className={cn(
                    "group relative flex min-h-[210px] flex-col border-2 p-4 text-left transition-transform duration-150",
                    "hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none",
                    isHuman ? "border-ink" : "border-ink/55",
                  )}
                  style={{ boxShadow: `4px 4px 0 ${isHuman ? "var(--ink)" : "rgba(26,26,26,0.35)"}` }}
                >
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 rounded-full" style={{ background: color }} aria-hidden />
                      <span className="font-display text-2xl font-black text-ink">
                        {PLAYER_CN[meta.player]}
                      </span>
                    </span>
                    <span className="font-mono text-[9px] tracking-[0.25em] text-ink/40">{meta.goalEn}</span>
                  </span>
                  <span className="mt-1.5 font-mono text-[10px] leading-relaxed text-ink/55">
                    {meta.pos} · {meta.goal}
                  </span>
                  <span className="mt-auto pt-3">
                    <span
                      className={cn(
                        "flex items-center gap-2 border px-2.5 py-1.5 font-mono text-[11px]",
                        isHuman ? "border-ink bg-ink text-paper" : "border-ink/45 bg-paper text-ink",
                      )}
                    >
                      {isHuman ? (
                        <>
                          <User className="h-3.5 w-3.5" aria-hidden />
                          真人执子
                        </>
                      ) : (
                        <>
                          <span style={{ color }}>{LEVEL_ICONS[seat.level]}</span>
                          {AI_PROFILES[seat.level].name}代打
                        </>
                      )}
                    </span>
                    <span className="mt-1.5 block font-mono text-[9px] leading-relaxed text-ink/40 group-hover:text-ink/60">
                      {isHuman ? "点击换成编辑部 AI 代打" : `点击换档 · 当前 ${AI_PROFILES[seat.level].title} · 点击至社长后再点回真人`}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
          <p className="border-t border-dashed border-ink/30 px-4 py-2.5 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-ink/40 sm:px-5">
            悔棋会撤回到最近一次轮到真人的局面 · 四人局四色套印固定（红/蓝/苔绿/墨黑），皮肤双色不生效
          </p>
        </section>
      </motion.div>

      {/* 版式规格（四人预设） */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12 }}
        className="mt-8"
      >
        <FormatPanel />
      </motion.div>

      {/* 棋钟规格 */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2 }}
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
          onClick={() =>
            startGame("local", undefined, { ...config, playerCount: 4 }, seats)
          }
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          按此开本开局 · {config.size}×{config.size} · 每方 {config.wallsPerPlayer} 板 · {timeLabel(config.timeControl)}
        </Button>
      </div>

      {/* 去在线四人围桌 */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.28 }}
        className="mt-10 flex flex-wrap items-center justify-between gap-4 border-2 border-dashed border-ink/45 px-6 py-5"
      >
        <div className="flex items-start gap-3">
          <Globe className="mt-1 h-5 w-5 shrink-0" style={{ color: PLAYER4_COLORS.B }} aria-hidden />
          <div>
            <p className="font-display text-lg font-bold text-ink">远程围桌 · 在线四人房</p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink/65">
              四位棋友各执一席在线对决；没凑齐人时，房主可把空座交给编辑部 AI 代打，凑齐即开局。
              断线五分钟未回判出局（棋局继续），不必因一人掉线而散桌。
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="gap-2 bg-qb px-6 font-mono text-sm font-bold text-paper hover:opacity-90"
          style={{ background: "var(--qb)" }}
          onClick={() => setView("room")}
        >
          <Globe className="h-4 w-4" aria-hidden />
          去在线对战开四人房
        </Button>
      </motion.div>

      <p className="mt-6 font-mono text-[10px] tracking-[0.25em] text-ink/40">
        出局制 · 四向归途 · 挡板人均减半 · AI 代打不耗时 · 收笔后自动入档
      </p>
    </section>
  );
}
