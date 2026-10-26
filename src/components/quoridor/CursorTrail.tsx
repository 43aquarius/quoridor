"use client";

/* 淡淡的 riso 圆点拖尾（仅精确指针设备） */

import { useEffect, useRef } from "react";

interface Dot {
  x: number;
  y: number;
  born: number;
  color: string;
}

export function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dotsRef = useRef<Dot[]>([]);
  const lastAdd = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastAdd.current < 34) return;
      lastAdd.current = now;
      // 直接读取 CSS 变量（随皮肤实时变化）
      const qa = getComputedStyle(document.documentElement).getPropertyValue("--qa").trim() || "#FF4D2E";
      const qb = getComputedStyle(document.documentElement).getPropertyValue("--qb").trim() || "#2440B3";
      dotsRef.current.push({
        x: e.clientX,
        y: e.clientY,
        born: now,
        color: dotsRef.current.length % 2 === 1 ? qa : qb,
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const loop = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const alive: Dot[] = [];
      ctx.globalCompositeOperation = "multiply";
      for (const d of dotsRef.current) {
        const age = (now - d.born) / 650;
        if (age >= 1) continue;
        alive.push(d);
        ctx.globalAlpha = 0.3 * (1 - age);
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 5.5 * (1 - age * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      dotsRef.current = alive.slice(-40);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[70] hidden [@media(pointer:fine)]:block"
    />
  );
}
