"use client";

/* 棋盘皮肤：横向色卡胶片条，可拖拽刮选（红黑 / 蓝黑 / 墨绿三套 + 初版红蓝）
 * 拖动胶片，指针划过哪一格色卡即选中哪一套套印色。
 */

import { useRef, useState } from "react";
import { SKINS, type SkinId } from "@/lib/game/types";
import { useQuoridor } from "@/store/game-store";
import { cn } from "@/lib/utils";

const FRAME_W = 58;
const FRAME_H = 40;

export function SkinFilmStrip({ compact = false }: { compact?: boolean }) {
  const skin = useQuoridor((s) => s.skin);
  const setSkin = useQuoridor((s) => s.setSkin);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const select = (id: SkinId) => setSkin(id);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const idx = Math.floor((e.clientX - rect.left) / FRAME_W);
    setHoverIdx(Math.max(0, Math.min(SKINS.length - 1, idx)));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const idx = Math.floor((e.clientX - rect.left) / FRAME_W);
    setDragging(false);
    setHoverIdx(null);
    const i = Math.max(0, Math.min(SKINS.length - 1, idx));
    select(SKINS[i].id);
  };

  return (
    <div
      className={cn("inline-block select-none", compact ? "scale-90 origin-left" : "")}
      role="group"
      aria-label="棋盘皮肤色卡"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.18em] text-ink/60">
          套印色版 RISO PALETTE
        </span>
      </div>
      <div
        ref={trackRef}
        className="relative mt-1 cursor-ew-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDragging(false);
          setHoverIdx(null);
        }}
        role="listbox"
        aria-label="拖动选择套印配色"
      >
        {/* 上齿孔 */}
        <div className="film-strip h-[6px] w-full opacity-80" />
        <div className="flex">
          {SKINS.map((s, i) => {
            const active = skin === s.id;
            const passing = hoverIdx === i && dragging;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={active}
                aria-label={`${s.label} ${s.sub}`}
                onClick={() => select(s.id)}
                className={cn(
                  "relative block border border-ink/80",
                  active ? "z-10 outline outline-2 outline-offset-2 outline-ink" : "",
                  passing ? "z-10 outline outline-2 outline-offset-2 outline-qa" : "",
                )}
                style={{ width: FRAME_W, height: FRAME_H }}
              >
                <span className="absolute inset-0 flex">
                  <span className="h-full w-1/2" style={{ background: s.a }} />
                  <span className="h-full w-1/2" style={{ background: s.b }} />
                </span>
                <span className="absolute inset-0 mix-blend-multiply bg-[transparent]" />
                {active && (
                  <span className="absolute -bottom-[1px] right-[2px] font-mono text-[9px] text-paper leading-none mix-blend-normal" style={{ color: "#F5F2EA" }}>
                    ●
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* 下齿孔 */}
        <div className="film-strip h-[6px] w-full opacity-80" />
        <div className="mt-1.5 flex justify-between" style={{ width: FRAME_W * SKINS.length }}>
          {SKINS.map((s) => (
            <span
              key={s.id}
              className={cn(
                "font-mono text-[9px] tracking-wider whitespace-nowrap",
                skin === s.id ? "text-ink font-bold" : "text-ink/45",
              )}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-1 font-mono text-[10px] text-ink/50 leading-relaxed">
        {dragging ? "松开即选定 —— " : "横向拖拽刮选 · "}
        {SKINS.find((s) => s.id === skin)?.sub}
      </p>
    </div>
  );
}
