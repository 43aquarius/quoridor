"use client";

/* 棋盘：0.5pt 极细格线 + 书页边框 + 等宽坐标 + 活字铅块棋子 + 铅条挡板。
 * 交互：校对标记 hover、压印动画、挡板预览/滑入、非法放板红色细线划过、
 * 步数墨迹、触屏两步放板（先选方向再确认）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GameState, Orientation, Player, Vec } from "@/lib/game/types";
import { PLAYER_CN, cellName, colLetter, playerColorVar } from "@/lib/game/types";
import { checkWall, legalPawnMoves, playersOf } from "@/lib/game/engine";
import type { RejectReason } from "@/lib/game/engine";
import { useQuoridor } from "@/store/game-store";
import { cn } from "@/lib/utils";

const CELL = 100;
const TH = 15; // 挡板厚度
const INSET = 6; // 挡板端头让位
const PAWN_R = 30;

const REJECT_TEXT: Record<string, string> = {
  overlap: "重叠 OVERLAP",
  cross: "交叉 CROSS",
  "no-path": "断路 NO PATH",
  "no-walls": "无板 NO WALL",
  "not-your-turn": "未轮到你",
  "game-over": "对局已收束",
  "illegal-pawn": "不可行",
};

/* 触屏判定：粗指针或「有触点且无悬停」 */
function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches)
  );
}

interface BoardProps {
  state: GameState;
  interactive: boolean;
}

export function Board({ state, interactive }: BoardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tryPawnMove = useQuoridor((s) => s.tryPawnMove);
  const tryWallPlace = useQuoridor((s) => s.tryWallPlace);
  const animMove = useQuoridor((s) => s.meta.animMove);
  const lastReject = useQuoridor((s) => s.meta.lastReject);

  /* 动态开本：N 路 × N 路（旧档回填 9） */
  const N = Math.max(5, Math.min(13, Number.isFinite(state.size) ? state.size : 9));
  const SIDE = N * CELL; // 格面边长
  const DIM = SIDE + 68; // viewBox 总长（含坐标边距）

  const [hoverCell, setHoverCell] = useState<Vec | null>(null);
  const [hoverWall, setHoverWall] = useState<{ x: number; y: number; o: Orientation } | null>(null);
  const [flip, setFlip] = useState(false); // R 键翻转预览方向
  const [touchWall, setTouchWall] = useState<{ x: number; y: number; o: Orientation } | null>(null);
  const [ripple, setRipple] = useState<{ cx: number; cy: number; color: string; k: number } | null>(null);
  const [strike, setStrike] = useState<{ x: number; y: number; o: Orientation; k: number } | null>(null);

  const legal = useMemo<Vec[]>(
    () => (interactive ? legalPawnMoves(state, state.turn) : []),
    [state, interactive],
  );

  const trace = useMemo(() => {
    const m = new Map<string, number>();
    for (const mv of state.history) {
      if (mv.payload.type === "pawn") m.set(`${mv.payload.to.x},${mv.payload.to.y}`, mv.n);
    }
    return m;
  }, [state.history]);

  /* 最新一手（持续高亮到下一手为止）：回座 / 回放 / 对手行棋后一眼可辨 */
  const lastMove = useMemo(() => {
    const h = state.history;
    if (h.length === 0) return null;
    const mv = h[h.length - 1];
    if (mv.payload.type === "pawn") {
      return { kind: "pawn" as const, n: mv.n, player: mv.player, from: mv.payload.from, to: mv.payload.to };
    }
    if (mv.payload.type === "wall") {
      return { kind: "wall" as const, n: mv.n, player: mv.payload.wall.by, wall: mv.payload.wall };
    }
    return null;
  }, [state.history]);

  const wallPreviewCheck = useMemo(() => {
    const target = touchWall ?? hoverWall;
    if (!target || !interactive) return null;
    const chk = checkWall(state, target.x, target.y, target.o, state.turn);
    return { ...target, valid: chk.ok, reason: chk.reason };
  }, [touchWall, hoverWall, state, interactive]);

  /* 压印涟漪：每手棋后触发（rAF 异步入帧，避免级联渲染） */
  useEffect(() => {
    if (animMove === 0) return;
    const hist = state.history;
    for (let i = hist.length - 1; i >= 0; i--) {
      const mv = hist[i];
      if (mv.payload.type === "pawn") {
        const toX = mv.payload.to.x;
        const toY = mv.payload.to.y;
        const pl = mv.player;
        const t0 = requestAnimationFrame(() => {
          setRipple({
            cx: toX * CELL + CELL / 2,
            cy: toY * CELL + CELL / 2,
            color: playerColorVar(pl),
            k: animMove,
          });
        });
        const t = setTimeout(() => setRipple(null), 850);
        return () => {
          cancelAnimationFrame(t0);
          clearTimeout(t);
        };
      }
    }
  }, [animMove, state.history]);

  /* 校对式驳回：红色细线划过 */
  useEffect(() => {
    if (!lastReject) return;
    const t0 = requestAnimationFrame(() => {
      setStrike({ x: lastReject.x, y: lastReject.y, o: lastReject.o, k: lastReject.t });
    });
    const t = setTimeout(() => setStrike(null), 1100);
    return () => {
      cancelAnimationFrame(t0);
      clearTimeout(t);
    };
  }, [lastReject]);

  /* R 键 / 右键：翻转预览方向 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") setFlip((f) => !f);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toBoard = (e: React.PointerEvent | React.MouseEvent): { bx: number; by: number } => {
    const svg = svgRef.current;
    if (!svg) return { bx: -999, by: -999 };
    const rect = svg.getBoundingClientRect();
    const scale = DIM / rect.width;
    const x = (e.clientX - rect.left) * scale - 34;
    const y = (e.clientY - rect.top) * scale - 34;
    return { bx: x, by: y };
  };

  const computeZone = (bx: number, by: number) => {
    // 最近的内部格点（挡板中心）：i,j ∈ 1..N-1
    const i = Math.round(bx / CELL);
    const j = Math.round(by / CELL);
    if (i >= 1 && i <= N - 1 && j >= 1 && j <= N - 1) {
      const dx = bx - i * CELL;
      const dy = by - j * CELL;
      const dist = Math.hypot(dx, dy);
      if (dist <= 46) {
        const baseO: Orientation = Math.abs(dx) > Math.abs(dy) ? "v" : "h";
        const o: Orientation = flip ? (baseO === "v" ? "h" : "v") : baseO;
        return { kind: "wall" as const, x: i - 1, y: j - 1, o };
      }
    }
    const cx = Math.floor(bx / CELL);
    const cy = Math.floor(by / CELL);
    if (cx >= 0 && cx <= N - 1 && cy >= 0 && cy <= N - 1) return { kind: "cell" as const, x: cx, y: cy };
    return null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const { bx, by } = toBoard(e);
    const zone = computeZone(bx, by);
    if (zone?.kind === "wall") {
      setHoverWall({ x: zone.x, y: zone.y, o: zone.o });
      setHoverCell(null);
    } else {
      setHoverWall(null);
      if (zone?.kind === "cell") setHoverCell({ x: zone.x, y: zone.y });
      else setHoverCell(null);
    }
  };

  const onPointerLeave = () => {
    setHoverWall(null);
    setHoverCell(null);
  };

  const commitWall = (x: number, y: number, o: Orientation) => {
    tryWallPlace(x, y, o);
    setTouchWall(null);
  };

  const onClick = (e: React.MouseEvent) => {
    if (!interactive) return;
    const { bx, by } = toBoard(e);
    const zone = computeZone(bx, by);
    if (!zone) return;
    if (zone.kind === "cell") {
      setTouchWall(null);
      tryPawnMove({ x: zone.x, y: zone.y });
    } else {
      // 触屏两步：先出预览，再在浮条上确认；鼠标用户直接落板
      if (isCoarsePointer()) {
        setTouchWall({ x: zone.x, y: zone.y, o: zone.o });
      } else {
        tryWallPlace(zone.x, zone.y, zone.o);
      }
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setFlip((f) => !f);
  };

  const four = state.playerCount === 4;
  const preview = wallPreviewCheck;
  const showPreview = !!preview;
  const lastMover =
    state.history.length > 0 ? state.history[state.history.length - 1].player : null;
  const turnColor = playerColorVar(state.turn);

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`-34 -34 ${DIM} ${DIM}`}
        role="application"
        aria-label={`步步为营棋盘（${N}×${N}）`}
        className={cn(
          "block w-full touch-manipulation select-none",
          interactive ? "cursor-pointer" : "cursor-default",
        )}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {/* 书页边框 */}
        <rect x={-26} y={-26} width={DIM - 16} height={DIM - 16} fill="none" stroke="var(--ink)" strokeWidth={2.6} />
        <rect x={-19} y={-19} width={DIM - 30} height={DIM - 30} fill="none" stroke="var(--ink)" strokeWidth={1} opacity={0.75} />

        {/* 坐标（四周小号等宽） */}
        <g className="tabular" fill="var(--ink)" opacity={0.62} fontSize={N > 11 ? 17 : 19}>
          {Array.from({ length: N }, (_, i) => (
            <g key={`c${i}`}>
              <text x={i * CELL + CELL / 2 - 6} y={SIDE + 32} textAnchor="middle">{colLetter(i, N)}</text>
              <text x={i * CELL + CELL / 2 - 6} y={-8} textAnchor="middle">{colLetter(i, N)}</text>
              <text x={-28} y={i * CELL + CELL / 2 + 6} textAnchor="middle">{N - i}</text>
              <text x={SIDE + 22} y={i * CELL + CELL / 2 + 6} textAnchor="middle">{N - i}</text>
            </g>
          ))}
        </g>

        {/* 极细格线 0.5pt */}
        <g stroke="var(--ink)" strokeWidth={1.15} opacity={0.9}>
          {Array.from({ length: N + 1 }, (_, i) => (
            <g key={`g${i}`}>
              <line x1={i * CELL} y1={0} x2={i * CELL} y2={SIDE} />
              <line x1={0} y1={i * CELL} x2={SIDE} y2={i * CELL} />
            </g>
          ))}
        </g>

        {/* 终线提示：各席的目标线（细密点线；四人局四边皆为某席归途，加中点色标） */}
        <g stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="2 7" opacity={0.5}>
          <line x1={2} y1={1} x2={SIDE - 2} y2={1} />
          <line x1={2} y1={SIDE - 1} x2={SIDE - 2} y2={SIDE - 1} />
          {four && <line x1={1} y1={2} x2={1} y2={SIDE - 2} />}
          {four && <line x1={SIDE - 1} y1={2} x2={SIDE - 1} y2={SIDE - 2} />}
        </g>
        {four && (
          <g className="pointer-events-none" aria-hidden>
            {/* 目标线中点色标：顶=甲的归途 · 底=乙 · 右=丙 · 左=丁 */}
            <rect x={SIDE / 2 - 26} y={-11} width={52} height={7} rx={3.5} fill={playerColorVar("A")} opacity={0.8} />
            <rect x={SIDE / 2 - 26} y={SIDE + 4} width={52} height={7} rx={3.5} fill={playerColorVar("B")} opacity={0.8} />
            <rect x={SIDE + 4} y={SIDE / 2 - 26} width={7} height={52} rx={3.5} fill={playerColorVar("C")} opacity={0.8} />
            <rect x={-11} y={SIDE / 2 - 26} width={7} height={52} rx={3.5} fill={playerColorVar("D")} opacity={0.8} />
          </g>
        )}

        {/* 步数墨迹 */}
        <g className="tabular" fill="var(--ink)" opacity={0.24} fontSize={15}>
          {Array.from(trace.entries()).map(([k, n]) => {
            const [x, y] = k.split(",").map(Number);
            return (
              <text key={k} x={x * CELL + 9} y={y * CELL + 24}>
                {n}
              </text>
            );
          })}
        </g>

        {/* 可走格：小墨点 + hover 校对虚线圈 */}
        {legal.map((v) => {
          const hovered = hoverCell?.x === v.x && hoverCell?.y === v.y;
          return (
            <g key={`l${v.x}-${v.y}`}>
              <circle
                cx={v.x * CELL + CELL / 2}
                cy={v.y * CELL + CELL / 2}
                r={4.5}
                fill={turnColor}
                opacity={0.42}
              />
              {hovered && (
                <circle
                  cx={v.x * CELL + CELL / 2}
                  cy={v.y * CELL + CELL / 2}
                  r={26}
                  fill="none"
                  stroke={turnColor}
                  strokeWidth={2.4}
                  strokeDasharray="5 6"
                  opacity={0.9}
                  className="pointer-events-none"
                />
              )}
            </g>
          );
        })}

        {/* 已落位的挡板（铅条，滑入归位） */}
        {state.walls.map((w, i) => {
          const color = playerColorVar(w.by);
          const isH = w.o === "h";
          const geom = isH
            ? { x: w.x * CELL + INSET, y: (w.y + 1) * CELL - TH / 2, w: 2 * CELL - 2 * INSET, h: TH }
            : { x: (w.x + 1) * CELL - TH / 2, y: w.y * CELL + INSET, w: TH, h: 2 * CELL - 2 * INSET };
          const shadow = { x: geom.x + 3, y: geom.y + 3 };
          return (
            <g key={`w${i}`}>
              <rect x={shadow.x} y={shadow.y} width={geom.w} height={geom.h} rx={TH / 2} fill={color} opacity={0.42} style={{ mixBlendMode: "multiply" }} />
              <motion.rect
                x={geom.x}
                y={geom.y}
                width={geom.w}
                height={geom.h}
                rx={TH / 2}
                fill={color}
                initial={{ scaleX: 0.12, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  transformBox: "fill-box",
                  transformOrigin: isH ? "left center" : "center top",
                }}
              />
            </g>
          );
        })}

        {/* 最新一手高亮：裁切角标 + 起讫校对线 / 挡板校对圈（持续至下一手） */}
        {lastMove && <LastMoveMark move={lastMove} />}

        {/* 挡板预览（半透明铅条 + 中心十字标） */}
        {showPreview && preview && (
          <g className="pointer-events-none">
            {(() => {
              const isH = preview.o === "h";
              const geom = isH
                ? { x: preview.x * CELL + INSET, y: (preview.y + 1) * CELL - TH / 2, w: 2 * CELL - 2 * INSET, h: TH }
                : { x: (preview.x + 1) * CELL - TH / 2, y: preview.y * CELL + INSET, w: TH, h: 2 * CELL - 2 * INSET };
              const c = preview.valid ? turnColor : "var(--riso-red)";
              const cx = (preview.x + 1) * CELL;
              const cy = (preview.y + 1) * CELL;
              return (
                <>
                  <rect
                    x={geom.x}
                    y={geom.y}
                    width={geom.w}
                    height={geom.h}
                    rx={TH / 2}
                    fill={c}
                    opacity={0.4}
                    stroke={c}
                    strokeWidth={1.6}
                    strokeDasharray="6 5"
                  />
                  {!preview.valid && (
                    <text
                      x={cx}
                      y={cy + (isH ? 30 : 0) + (isH ? 0 : 42)}
                      textAnchor="middle"
                      fill="var(--riso-red)"
                      fontSize={16}
                      className="tabular"
                    >
                      {REJECT_TEXT[preview.reason ?? ""] ?? "非法"}
                    </text>
                  )}
                  <g stroke={c} strokeWidth={1.4}>
                    <line x1={cx - 7} y1={cy} x2={cx + 7} y2={cy} />
                    <line x1={cx} y1={cy - 7} x2={cx} y2={cy + 7} />
                  </g>
                </>
              );
            })()}
          </g>
        )}

        {/* 驳回：校对式红色细线划过 */}
        <AnimatePresence>
          {strike && (
            <motion.line
              key={strike.k}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              x1={strike.o === "h" ? strike.x * CELL - 4 : (strike.x + 1) * CELL}
              y1={strike.o === "h" ? (strike.y + 1) * CELL : strike.y * CELL - 4}
              x2={strike.o === "h" ? (strike.x + 2) * CELL + 4 : (strike.x + 1) * CELL}
              y2={strike.o === "h" ? (strike.y + 1) * CELL : (strike.y + 2) * CELL + 4}
              stroke="var(--riso-red)"
              strokeWidth={4}
              strokeLinecap="round"
              style={{
                animation: "strike-line 1.05s ease-out both",
                transformBox: "fill-box",
                transformOrigin: strike.o === "h" ? "left center" : "center top",
              }}
              className="pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* 压印涟漪 */}
        <AnimatePresence>
          {ripple && (
            <g key={ripple.k} className="pointer-events-none">
              <motion.circle
                cx={ripple.cx}
                cy={ripple.cy}
                fill="none"
                stroke={ripple.color}
                strokeWidth={2.6}
                initial={{ r: PAWN_R, opacity: 0.6 }}
                animate={{ r: PAWN_R + 30, opacity: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
              <motion.circle
                cx={ripple.cx}
                cy={ripple.cy}
                fill="var(--ink)"
                initial={{ r: PAWN_R * 0.8, opacity: 0.16 }}
                animate={{ r: PAWN_R * 1.05, opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                style={{ mixBlendMode: "multiply" }}
              />
            </g>
          )}
        </AnimatePresence>

        {/* 棋子：圆形活字铅块（套印错位 + 压印微动画；四人局四色四席） */}
        <PawnGlyph player="A" pos={state.posA} pressKey={lastMover === "A" ? animMove : 0} />
        <PawnGlyph player="B" pos={state.posB} pressKey={lastMover === "B" ? animMove : 0} />
        {four && state.posC && <PawnGlyph player="C" pos={state.posC} pressKey={lastMover === "C" ? animMove : 0} eliminated={!!state.eliminated?.includes("C")} />}
        {four && state.posD && <PawnGlyph player="D" pos={state.posD} pressKey={lastMover === "D" ? animMove : 0} eliminated={!!state.eliminated?.includes("D")} />}

        {/* hover 到自己棋子：无操作提示 */}
        {interactive && hoverCell && !legal.some((v) => v.x === hoverCell.x && v.y === hoverCell.y) && (
          <circle
            cx={hoverCell.x * CELL + CELL / 2}
            cy={hoverCell.y * CELL + CELL / 2}
            r={34}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={1.2}
            opacity={0.28}
            strokeDasharray="3 6"
            className="pointer-events-none"
          />
        )}
      </svg>

      {/* 触屏两步放板：方向选择 + 确认浮条 */}
      {touchWall && (
        <div className="touch-only absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-2">
          <div className="flex items-center gap-1.5 border border-ink bg-paper/95 px-2.5 py-2 shadow-[4px_4px_0_var(--ink)]">
            <span className="font-mono text-[10px] tracking-wider text-ink/60">
              {cellName({ x: touchWall.x + 1, y: touchWall.y }, N)}
            </span>
            <button
              type="button"
              className={cn(
                "border border-ink px-3 py-1.5 font-mono text-xs",
                touchWall.o === "h" ? "bg-ink text-paper" : "bg-transparent text-ink",
              )}
              onClick={() => setTouchWall({ ...touchWall, o: "h" })}
            >
              横 H
            </button>
            <button
              type="button"
              className={cn(
                "border border-ink px-3 py-1.5 font-mono text-xs",
                touchWall.o === "v" ? "bg-ink text-paper" : "bg-transparent text-ink",
              )}
              onClick={() => setTouchWall({ ...touchWall, o: "v" })}
            >
              竖 V
            </button>
            <span className="mx-1 h-4 w-px bg-ink/40" aria-hidden />
            <button
              type="button"
              className="border border-qa bg-qa px-3 py-1.5 font-mono text-xs font-bold text-paper"
              style={{ background: "var(--qa)", borderColor: "var(--qa)" }}
              onClick={() => commitWall(touchWall.x, touchWall.y, touchWall.o)}
            >
              落板 ✓
            </button>
            <button
              type="button"
              className="px-2 py-1.5 font-mono text-xs text-ink/55"
              onClick={() => setTouchWall(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 触屏提示：放板方式 */}
      {interactive && !touchWall && (
        <p className="touch-only mt-2 text-center font-mono text-[10px] tracking-wider text-ink/45">
          点击格线附近选板位 · 点击棋格行棋
        </p>
      )}
    </div>
  );
}

/* 最新一手标记：编辑部「校对中」的视觉语言 ——
 * 行棋：落点四角裁切角标 + 起点空圈 + 点状行棋轨迹（斜跳 / 直跳皆可读）；
 * 落板：铅条外的虚线校对圈。以手数 n 为 key，每手重新绘制一次，随后常驻。 */
function LastMoveMark({
  move,
}: {
  move:
    | { kind: "pawn"; n: number; player: Player; from: Vec; to: Vec }
    | { kind: "wall"; n: number; player: Player; wall: { x: number; y: number; o: Orientation } };
}) {
  const color = playerColorVar(move.player);

  if (move.kind === "pawn") {
    const fx = move.from.x * CELL + CELL / 2;
    const fy = move.from.y * CELL + CELL / 2;
    const tx = move.to.x * CELL + CELL / 2;
    const ty = move.to.y * CELL + CELL / 2;
    const x0 = move.to.x * CELL;
    const y0 = move.to.y * CELL;
    const m = 7; // 角标内缩（避开左上步数墨迹）
    const L = 18; // 角标臂长
    const c = CELL;
    const brackets = [
      `M ${x0 + m + L} ${y0 + m} L ${x0 + m} ${y0 + m} L ${x0 + m} ${y0 + m + L}`,
      `M ${x0 + c - m - L} ${y0 + m} L ${x0 + c - m} ${y0 + m} L ${x0 + c - m} ${y0 + m + L}`,
      `M ${x0 + m} ${y0 + c - m - L} L ${x0 + m} ${y0 + c - m} L ${x0 + m + L} ${y0 + c - m}`,
      `M ${x0 + c - m} ${y0 + c - m - L} L ${x0 + c - m} ${y0 + c - m} L ${x0 + c - m - L} ${y0 + c - m}`,
    ].join(" ");
    return (
      <g key={move.n} className="pointer-events-none">
        {/* 起点空圈（棋子从哪里来） */}
        <motion.circle
          cx={fx}
          cy={fy}
          r={9}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0.5}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.5 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        {/* 起讫点状轨迹（仅透明度渐入：pathLength 动画会覆写点状 dasharray） */}
        <motion.line
          x1={fx}
          y1={fy}
          x2={tx}
          y2={ty}
          stroke={color}
          strokeWidth={2.2}
          strokeDasharray="2 9"
          strokeLinecap="round"
          opacity={0.55}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
        {/* 落点四角裁切角标 */}
        <motion.path
          d={brackets}
          fill="none"
          stroke={color}
          strokeWidth={2.6}
          strokeLinecap="square"
          opacity={0.9}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.9 }}
          transition={{ duration: 0.42, ease: "easeOut", delay: 0.08 }}
        />
      </g>
    );
  }

  /* 落板：铅条外一圈虚线校对圈 */
  const w = move.wall;
  const isH = w.o === "h";
  const geom = isH
    ? { x: w.x * CELL + INSET, y: (w.y + 1) * CELL - TH / 2, w: 2 * CELL - 2 * INSET, h: TH }
    : { x: (w.x + 1) * CELL - TH / 2, y: w.y * CELL + INSET, w: TH, h: 2 * CELL - 2 * INSET };
  const pad = 7;
  return (
    <g key={move.n} className="pointer-events-none">
      <motion.rect
        x={geom.x - pad}
        y={geom.y - pad}
        width={geom.w + 2 * pad}
        height={geom.h + 2 * pad}
        rx={(TH + 2 * pad) / 2}
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeDasharray="9 7"
        opacity={0.85}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.85 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
      />
    </g>
  );
}

/* 棋子铅块（甲乙丙丁四色活字；出局者半透明并加叉线） */
function PawnGlyph({
  player,
  pos,
  pressKey,
  eliminated = false,
}: {
  player: Player;
  pos: Vec;
  pressKey: number;
  eliminated?: boolean;
}) {
  const color = playerColorVar(player);
  const ch = PLAYER_CN[player];
  const cx = pos.x * CELL + CELL / 2;
  const cy = pos.y * CELL + CELL / 2;
  return (
    <motion.g
      animate={{ x: cx - CELL / 2, y: cy - CELL / 2 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: "transform", opacity: eliminated ? 0.42 : 1 }}
    >
      <motion.g
        key={pressKey}
        initial={pressKey ? { scale: 1.22 } : false}
        animate={{ scale: 1 }}
        transition={{ duration: 0.26, ease: [0.22, 1.4, 0.36, 1] }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        {/* 套印错位 */}
        <circle cx={CELL / 2 + 3.5} cy={CELL / 2 + 3.5} r={PAWN_R} fill={color} opacity={0.45} style={{ mixBlendMode: "multiply" }} />
        {/* 铅块主体 */}
        <circle cx={CELL / 2} cy={CELL / 2} r={PAWN_R} fill={color} />
        <circle cx={CELL / 2} cy={CELL / 2} r={PAWN_R - 4} fill="none" stroke="var(--paper)" strokeWidth={1.4} opacity={0.85} />
        {/* 活字字符（反向错位） */}
        <text
          x={CELL / 2 + 1.4}
          y={CELL / 2 + 1.4}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={34}
          fontWeight={900}
          fill="var(--ink)"
          opacity={0.5}
          style={{ fontFamily: "var(--font-sans)", mixBlendMode: "multiply" }}
        >
          {ch}
        </text>
        <text
          x={CELL / 2}
          y={CELL / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={34}
          fontWeight={900}
          fill="var(--paper)"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {ch}
        </text>
        {/* 出局者：斜杠叉线 */}
        {eliminated && (
          <g stroke="var(--ink)" strokeWidth={3.4} strokeLinecap="round" opacity={0.75}>
            <line x1={CELL / 2 - 18} y1={CELL / 2 - 18} x2={CELL / 2 + 18} y2={CELL / 2 + 18} />
            <line x1={CELL / 2 + 18} y1={CELL / 2 - 18} x2={CELL / 2 - 18} y2={CELL / 2 + 18} />
          </g>
        )}
      </motion.g>
    </motion.g>
  );
}
