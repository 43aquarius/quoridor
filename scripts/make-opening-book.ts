/* 开局库编译器：合并 gen-opening-book.ts 的两份 raw 输出 → 生成
 * src/lib/game/opening-book.ts（常量 BOOK + 查询函数 bookMove）。
 * 运行：bun scripts/make-opening-book.ts
 */
import type { MovePayload, Player } from "../src/lib/game/types";

interface RawMove { mv: string; n: number; avgSig: number }
interface RawPos { key: string; samples: number; moves: RawMove[] }

const allFiles = ["scripts/book-raw-a.json", "scripts/book-raw-b.json"];
const files: string[] = [];
for (const f of allFiles) {
  try {
    await Bun.file(f).text();
    files.push(f);
  } catch {
    /* 文件不存在：跳过 */
  }
}
const agg = new Map<string, Map<string, { n: number; sigSum: number }>>();
let totalGames = 0;
for (const f of files) {
  const raw = JSON.parse(await Bun.file(f).text()) as { meta: { games: number }; positions: RawPos[] };
  totalGames += raw.meta.games;
  for (const p of raw.positions) {
    let m = agg.get(p.key);
    if (!m) { m = new Map(); agg.set(p.key, m); }
    for (const mv of p.moves) {
      const e = m.get(mv.mv) ?? { n: 0, sigSum: 0 };
      e.n += mv.n;
      e.sigSum += mv.n * mv.avgSig;
      m.set(mv.mv, e);
    }
  }
}

/* —— 过滤 + 权重 —— */
const entries: Array<{ key: string; moves: Array<{ mv: string; w: number }> }> = [];
for (const [key, moves] of agg) {
  const total = Array.from(moves.values()).reduce((a, e) => a + e.n, 0);
  if (total < 4) continue; /* 局面样本过少：噪声，不入库 */
  const kept: Array<{ mv: string; w: number }> = [];
  for (const [mv, e] of moves) {
    if (e.n < 2) continue; /* 单次着法可能是切片偏差 */
    const avg = e.sigSum / e.n;
    if (avg < -2) continue; /* 明显劣势着法不入库 */
    const w = Math.max(1, Math.round(e.n * Math.min(1.5, Math.max(0.55, 0.55 + avg / 10))));
    kept.push({ mv, w });
  }
  if (kept.length > 0) entries.push({ key, moves: kept });
}
entries.sort((a, b) => a.key.localeCompare(b.key));

/* —— raw key（base36 BigInt 位图）→ 新 key（位索引列表，无 BigInt，
 *    兼容项目 target）转译。生成端 gen-opening-book.ts 的 bookKeyRaw
 *    已同步改为索引列表编码，未来增量无需转译。—— */
const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
function unpackBits(s: string): number[] {
  if (s === "0") return [];
  let n = 0n;
  for (const ch of s) n = n * 36n + BigInt(B36.indexOf(ch));
  const idxs: number[] = [];
  let i = 0;
  while (n > 0n) { if (n & 1n) idxs.push(i); n >>= 1n; i++; }
  return idxs;
}
function rekey(rawKey: string): string {
  const parts = rawKey.split(".");
  const h = unpackBits(parts[0]);
  const v = unpackBits(parts[1]);
  return `${h.length ? h.join(",") : "0"}.${v.length ? v.join(",") : "0"}.${parts[2]}.${parts[3]}.${parts[4]}`;
}
for (const e of entries) e.key = rekey(e.key);

const bookLiteral =
  "{" +
  entries.map((e) => `"${e.key}":"${e.moves.map((m) => `${m.mv}:${m.w}`).join("|")}"`).join(",") +
  "}";

const depthHist = new Map<string, number>();
console.log(`[book] ${totalGames} 局 · 唯一局面 ${agg.size} · 入库 ${entries.length} · 条目 ${entries.reduce((a, e) => a + e.moves.length, 0)}`);

/* —— 生成 TS 模块 —— */
const code = `/* 步步为营 —— 自博弈开局库（v8 第六轮强化）
 * 思路对标 claustrophobia.dev 的 "opening theory via engine self-play"：
 * ${totalGames} 局社长引擎自博弈（每手预算抖动 550~950ms + 25% 概率根切片
 * 随机保证多样性），开局 10 手后以 1200ms 社长级深度评估收局势信号；
 * 按局面聚合「着法 × 次数 × 平均信号」，n≥2 且均分 > -2 方可入库。
 *
 * 作用：二人局 9×9×10、前 10 手内，命中即秒出（QUORIDOR_AI_BOOK=1 启用，
 * 默认关：实测 480 局库对档位为净负资产，详见 ai.ts USE_BOOK 注释）。
 * 生成脚本：scripts/gen-opening-book.ts + scripts/make-opening-book.ts
 */

import type { GameState, MovePayload } from "./types";

/* key = hIdxs.vIdxs.axay.bxby.turn —— h/v 为 8×8 墙格中已占用锚点的
 * 索引列表（逗号分隔；"0" = 空）——无 BigInt，兼容项目 target */
function bookKey(s: GameState): string {
  const N = 9;
  const h: number[] = [];
  const v: number[] = [];
  for (const w of s.walls) {
    const idx = w.y * (N - 1) + w.x;
    if (w.o === "h") h.push(idx);
    else v.push(idx);
  }
  return (
    (h.length ? h.join(",") : "0") + "." + (v.length ? v.join(",") : "0") +
    "." + s.posA.x + s.posA.y + "." + s.posB.x + s.posB.y +
    "." + (s.turn === "A" ? "0" : "1")
  );
}

/* ${entries.length} 局面 · ${entries.reduce((a, e) => a + e.moves.length, 0)} 着法条目 */
export const BOOK: Record<string, string> = ${bookLiteral};

function decodeMove(s: string, turn: "A" | "B"): MovePayload {
  if (s[0] === "P") {
    const [x1, y1, x2, y2] = s.slice(1).split(",").map(Number);
    return { type: "pawn", from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
  }
  const [x, y, o] = [Number(s[1]), Number(s[3]), s[5] as "h" | "v"];
  return { type: "wall", wall: { x, y, o, by: turn } };
}

/** 开局库查询：命中返回带权随机的着法；不命中返回 null（回落全量搜索） */
export function bookMove(state: GameState): MovePayload | null {
  if (state.playerCount !== 2) return null;
  if (state.size !== 9 || state.wallsStart !== 10) return null;
  if (state.history.length >= 10) return null;
  const entry = BOOK[bookKey(state)];
  if (!entry) return null;
  /* mv:weight|mv:weight… 带权随机 */
  const parts = entry.split("|");
  let total = 0;
  const ws: number[] = [];
  for (const p of parts) {
    const w = Number(p.slice(p.lastIndexOf(":") + 1));
    ws.push(w);
    total += w;
  }
  let r = Math.random() * total;
  const who = state.turn as "A" | "B";
  for (let i = 0; i < parts.length; i++) {
    r -= ws[i];
    if (r <= 0) {
      const mv = parts[i].slice(0, parts[i].lastIndexOf(":"));
      return decodeMove(mv, who);
    }
  }
  return decodeMove(parts[0].slice(0, parts[0].lastIndexOf(":")), who);
}
`;
await Bun.write("src/lib/game/opening-book.ts", code);
console.log("[book] → src/lib/game/opening-book.ts");
/* 首局面自检 */
const first = entries.find((e) => e.key === "0.0.48.40.0");
if (first) console.log(`[book] 初始局面条目: ${first.moves.map((m) => m.mv + ":" + m.w).join(" | ")}`);
else console.log("[book][warn] 初始局面（0.0.48.40.0）不在库中！");
