/* 步步为营 —— AI 对手四档（编辑职位命名）· 强化版 v2 快照
 * 本文件是第二轮强化（v3）前的版本快照，仅用于基准对决
 * （scripts/ai-duel-v2.ts）验证新版强度提升，勿在生产代码中引用。
 * 1 学徒：最短路径 + 偶尔随机放板（保留笨拙的可爱）
 * 2 排字师：浅层搜索（深度 2，按路径差增益排序候选）——聪明的贪心
 * 3 总编：α-β + PVS 主变例搜索 + Zobrist 置换表 + 杀手着法/历史启发
 * 4 社长：搜索预算全开（更深度数、更大候选窗、更久预算），终局纯竞速精确判胜
 *
 * 强化要点（相对旧版）：
 * A. 全盘目标距离缓存：以「墙配置 Zobrist」为键缓存甲乙两方的距离场
 *    （Int16Array 全盘数组），评估/探针/路径标记全部 O(1) 查表化——
 *    旧版每个叶子 2 次 BFS、每个挡板候选 2 次 BFS，是深度上不去的根因。
 * B. 墙合法性接触计数快检（grantslatton《Solving Quoridor》技术）：
 *    候选板与既有墙/边界的「连接点」< 2 时数学上不可能封路，直接跳过 BFS。
 * C. PVS（主变例搜索）：首着全窗、其余零宽探针 + 按需重搜。
 * D. 即胜检测前移：行棋方一步可达终点（含直跳/斜跳）在任意深度精确判出。
 * E. 评估函数新增「路径分岔自由度」项；候选生成新增「沿既有墙延伸」战略板。
 * F. 根节点全量着法排序（按上一轮迭代分值），迭代间排序信息不丢失。
 *
 * 全档支持可变棋盘（5..13 路）与可变挡板数；在 Web Worker 中运行，不阻塞 UI。
 */

import {
  AiLevel,
  GameState,
  MovePayload,
  Orientation,
  Player,
  Vec,
  WallPayload,
  goalRow,
  opponent,
} from "./types";
import type { AiDecision } from "./types";
import { computeAiMove4 } from "./ai4";
import {
  buildWallGrids,
  boardSize,
  checkWall,
  edgeBlockedG,
  legalPawnMoves,
  wallConflicts,
} from "./engine";

export type { AiDecision };

/* ============ 档位参数 ============ */

interface LevelParams {
  budgetMs: number; // 搜索时间预算
  maxDepth: number; // 迭代加深深度上限
  wallLimit: number; // 内层节点挡板候选上限
  rootWallLimit: number; // 根节点挡板候选上限（探针验证后保留数）
}

const MAX_PLY = 28;
const EVAL_WIN = 100000;
const MAX_CELLS = 169;
const MAX_ANCHORS = 144;
const MAX_WALL_COUNT = 21;
const WALL_CODE_SPACE = 288; // (144 锚点 × 2 朝向)
const PAWN_CODE_BASE = 0x100000;
const PVS_EPS = 1e-6; // 零宽窗口宽度（分数为浮点，远小于最小分差）

/* 测试辅助：环境变量覆写深度/候选上限（Node 脚本用；浏览器忽略） */
const ENV_DEPTH = typeof process !== "undefined" && process.env?.QUORIDOR_AI_DEPTH ? Number(process.env.QUORIDOR_AI_DEPTH) : null;
const ENV_WALLS = typeof process !== "undefined" && process.env?.QUORIDOR_AI_WALLS ? Number(process.env.QUORIDOR_AI_WALLS) : null;
const ENV_ROOT = typeof process !== "undefined" && process.env?.QUORIDOR_AI_ROOT ? Number(process.env.QUORIDOR_AI_ROOT) : null;

export const AI_DEBUG = typeof process !== "undefined" && !!process.env?.QUORIDOR_AI_DEBUG;

function levelParams(level: AiLevel, size: number): LevelParams {
  /* BFS 开销随 N² 增长：按尺寸缩放预算 */
  const sizeScale = size <= 5 ? 0.55 : size === 7 ? 0.8 : size === 9 ? 1 : size === 11 ? 1.35 : 1.7;
  if (level === 2) {
    return {
      budgetMs: Math.round(280 * sizeScale),
      maxDepth: ENV_DEPTH ?? 2,
      wallLimit: ENV_WALLS ?? 10,
      rootWallLimit: ENV_ROOT ?? 12,
    };
  }
  if (level === 3) {
    return {
      budgetMs: Math.round(1400 * sizeScale),
      maxDepth: ENV_DEPTH ?? (size <= 5 ? 9 : size === 7 ? 8 : size === 9 ? 8 : size === 11 ? 6 : 5),
      wallLimit: ENV_WALLS ?? 15,
      rootWallLimit: ENV_ROOT ?? 22,
    };
  }
  /* level 4 社长 */
  return {
    budgetMs: Math.round(2800 * sizeScale),
    maxDepth: ENV_DEPTH ?? (size <= 5 ? 11 : size === 7 ? 10 : size === 9 ? 9 : size === 11 ? 7 : 6),
    wallLimit: ENV_WALLS ?? 17,
    rootWallLimit: ENV_ROOT ?? 28,
  };
}

/* ============ 可变搜索核心（do/undo，增量 Zobrist） ============ */

interface Core {
  size: number; // 棋盘边长 N
  h: Uint8Array; // (N-1)²
  v: Uint8Array;
  posA: Vec;
  posB: Vec;
  wallsA: number;
  wallsB: number;
  wallsStart: number;
  hashLo: number; // 完整局面哈希（棋子+墙+余板+行棋方）
  hashHi: number;
  gLo: number; // 墙配置哈希（仅墙 + 尺寸盐）——距离缓存键
  gHi: number;
}

/* —— Zobrist 键表（双 32 位，xorshift 确定性生成） —— */

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
}

const rng = makeRng(0x5f3759df);
const zPawnALo = new Int32Array(MAX_CELLS);
const zPawnAHi = new Int32Array(MAX_CELLS);
const zPawnBLo = new Int32Array(MAX_CELLS);
const zPawnBHi = new Int32Array(MAX_CELLS);
const zWallHLo = new Int32Array(MAX_ANCHORS);
const zWallHHi = new Int32Array(MAX_ANCHORS);
const zWallVLo = new Int32Array(MAX_ANCHORS);
const zWallVHi = new Int32Array(MAX_ANCHORS);
const zWallsALo = new Int32Array(MAX_WALL_COUNT + 2);
const zWallsAHi = new Int32Array(MAX_WALL_COUNT + 2);
const zWallsBLo = new Int32Array(MAX_WALL_COUNT + 2);
const zWallsBHi = new Int32Array(MAX_WALL_COUNT + 2);
const zSizeLo = new Int32Array(16);
const zSizeHi = new Int32Array(16);
let zSideLo = 0;
let zSideHi = 0;
(function initZobrist() {
  for (let i = 0; i < MAX_CELLS; i++) {
    zPawnALo[i] = rng();
    zPawnAHi[i] = rng();
    zPawnBLo[i] = rng();
    zPawnBHi[i] = rng();
  }
  for (let i = 0; i < MAX_ANCHORS; i++) {
    zWallHLo[i] = rng();
    zWallHHi[i] = rng();
    zWallVLo[i] = rng();
    zWallVHi[i] = rng();
  }
  for (let i = 0; i <= MAX_WALL_COUNT + 1; i++) {
    zWallsALo[i] = rng();
    zWallsAHi[i] = rng();
    zWallsBLo[i] = rng();
    zWallsBHi[i] = rng();
  }
  for (let i = 0; i < 16; i++) {
    zSizeLo[i] = rng();
    zSizeHi[i] = rng();
  }
  zSideLo = rng();
  zSideHi = rng();
})();

function toCore(state: GameState): Core {
  const size = boardSize(state);
  const g = buildWallGrids(state.walls, size);
  const W = size - 1;
  let lo = 0;
  let hi = 0;
  let glo = zSizeLo[size] ^ 0;
  let ghi = zSizeHi[size] ^ 0;
  const ai = state.posA.y * size + state.posA.x;
  const bi = state.posB.y * size + state.posB.x;
  lo ^= zPawnALo[ai] ^ zPawnBLo[bi];
  hi ^= zPawnAHi[ai] ^ zPawnBHi[bi];
  for (let i = 0; i < W * W; i++) {
    if (g.h[i]) {
      lo ^= zWallHLo[i];
      hi ^= zWallHHi[i];
      glo ^= zWallHLo[i];
      ghi ^= zWallHHi[i];
    }
    if (g.v[i]) {
      lo ^= zWallVLo[i];
      hi ^= zWallVHi[i];
      glo ^= zWallVLo[i];
      ghi ^= zWallVHi[i];
    }
  }
  const wa = Math.min(Math.max(state.wallsA, 0), MAX_WALL_COUNT);
  const wb = Math.min(Math.max(state.wallsB, 0), MAX_WALL_COUNT);
  lo ^= zWallsALo[wa] ^ zWallsBLo[wb];
  hi ^= zWallsAHi[wa] ^ zWallsBHi[wb];
  if (state.turn === "B") {
    lo ^= zSideLo;
    hi ^= zSideHi;
  }
  return {
    size,
    h: g.h,
    v: g.v,
    posA: { ...state.posA },
    posB: { ...state.posB },
    wallsA: state.wallsA,
    wallsB: state.wallsB,
    wallsStart: Number.isFinite(state.wallsStart) ? state.wallsStart : 10,
    hashLo: lo | 0,
    hashHi: hi | 0,
    gLo: glo | 0,
    gHi: ghi | 0,
  };
}

/* ============ 全盘目标距离缓存 ============
 * 以墙配置哈希（gLo, gHi）为键，缓存甲乙两方的「每格到目标行步数」数组。
 * 距离场只依赖墙配置（引擎 BFS 本就忽略对手棋子），与棋子位置无关，
 * 因此 do/undo 搜索中同一墙配置反复出现时全部命中，BFS 只在真正的新配置上执行。
 * 直接映射表：随机替换旧项，无需清理（纯函数，跨搜索持久有效）。 */

const DC_BITS = 13;
const DC_SIZE = 1 << DC_BITS; // 8192 槽
const DC_MASK = DC_SIZE - 1;
const dcKeyLo = new Int32Array(DC_SIZE);
const dcKeyHi = new Int32Array(DC_SIZE);
const dcUsed = new Uint8Array(DC_SIZE);
const dcData: (Int16Array | null)[] = new Array(DC_SIZE).fill(null);
let dcHits = 0;
let dcMisses = 0;

/* 多源 BFS 工作缓冲（goalDists 内独占使用，无重入） */
const _gdQueue = new Int32Array(MAX_CELLS);
const _gdDirs: Array<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

function goalDists(c: Core): Int16Array {
  const slot = (c.gLo >>> 0) & DC_MASK;
  if (dcUsed[slot] && dcKeyLo[slot] === c.gLo && dcKeyHi[slot] === c.gHi) {
    dcHits++;
    return dcData[slot]!;
  }
  dcMisses++;
  let buf = dcData[slot];
  if (!buf) {
    buf = new Int16Array(MAX_CELLS * 2);
    dcData[slot] = buf;
  }
  const N = c.size;
  const NN = N * N;
  const grids = { h: c.h, v: c.v };
  buf.fill(-1, 0, NN);
  buf.fill(-1, MAX_CELLS, MAX_CELLS + NN);
  /* 甲：目标行 0 */
  {
    let head = 0;
    let tail = 0;
    for (let x = 0; x < N; x++) {
      buf[x] = 0;
      _gdQueue[tail++] = x;
    }
    while (head < tail) {
      const cur = _gdQueue[head++];
      const cx = cur % N;
      const cy = (cur - cx) / N;
      const d = buf[cur];
      for (const [dx, dy] of _gdDirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
        if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
        const ni = ny * N + nx;
        if (buf[ni] !== -1) continue;
        buf[ni] = d + 1;
        _gdQueue[tail++] = ni;
      }
    }
  }
  /* 乙：目标行 N-1 */
  {
    const base = MAX_CELLS;
    const goalY = N - 1;
    let head = 0;
    let tail = 0;
    for (let x = 0; x < N; x++) {
      buf[base + goalY * N + x] = 0;
      _gdQueue[tail++] = goalY * N + x;
    }
    while (head < tail) {
      const cur = _gdQueue[head++];
      const cx = cur % N;
      const cy = (cur - cx) / N;
      const d = buf[base + cur];
      for (const [dx, dy] of _gdDirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
        if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
        const ni = ny * N + nx;
        if (buf[base + ni] !== -1) continue;
        buf[base + ni] = d + 1;
        _gdQueue[tail++] = ni;
      }
    }
  }
  dcUsed[slot] = 1;
  dcKeyLo[slot] = c.gLo;
  dcKeyHi[slot] = c.gHi;
  return buf;
}

function coreDist(c: Core, p: Player): number {
  const buf = goalDists(c);
  const pos = p === "A" ? c.posA : c.posB;
  return buf[(p === "A" ? 0 : MAX_CELLS) + pos.y * c.size + pos.x];
}

/* 指定格子的目标距离（评估自由度项用） */
function distAt(c: Core, p: Player, x: number, y: number): number {
  const buf = goalDists(c);
  return buf[(p === "A" ? 0 : MAX_CELLS) + y * c.size + x];
}

/* 试放一块挡板（不落位），返回双方新距离；pathCut 为任一方无路。
 * 距离走缓存，均摊 O(1)。 */
function coreProbeWall(
  c: Core,
  x: number,
  y: number,
  o: Orientation,
): { dA: number; dB: number; pathCut: boolean } {
  const W = c.size - 1;
  const idx = y * W + x;
  const grid = o === "h" ? c.h : c.v;
  const was = grid[idx];
  const zlo = o === "h" ? zWallHLo[idx] : zWallVLo[idx];
  const zhi = o === "h" ? zWallHHi[idx] : zWallVHi[idx];
  grid[idx] = 1;
  c.gLo = (c.gLo ^ zlo) | 0;
  c.gHi = (c.gHi ^ zhi) | 0;
  const buf = goalDists(c);
  const ai = c.posA.y * c.size + c.posA.x;
  const bi = c.posB.y * c.size + c.posB.x;
  const dA = buf[ai];
  const dB = buf[MAX_CELLS + bi];
  grid[idx] = was;
  c.gLo = (c.gLo ^ zlo) | 0;
  c.gHi = (c.gHi ^ zhi) | 0;
  return { dA, dB, pathCut: dA < 0 || dB < 0 };
}

/* ============ 墙合法性接触计数快检 ============
 * 一块候选板有 3 个格点（两端 P1/P2 + 中点 M）。「连接点」= 该格点落在
 * 棋盘侧边，或与既有挡板共享该格点。若连接点 < 2，则该板在拓扑上只是
 * 一条「死端突出」，不可能补全任何左-右贯通栅栏或闭合围栏，无需 BFS 断路
 * 校验（grantslatton《Solving Quoridor》的接触启发，此处推广到中点）。
 * h 板格点：P1=(x,y+1) M=(x+1,y+1) P2=(x+2,y+1)（格点坐标系 0..N）。
 * 与 h(x,y) 共享 P1 的墙：h(x-2,y) 端点；v(x-1, y-1..y+1)（端/中点）。
 * 与其共享 M 的墙：v(x, y-1) 与 v(x, y+1) 的端点（v(x,y) 为十字冲突已排除）。
 * v 板对称同理。 */

function wallDangerous(c: Core, x: number, y: number, o: Orientation): boolean {
  const W = c.size - 1;
  const h = c.h;
  const v = c.v;
  if (o === "h") {
    let conn = 0;
    /* P1 = (x, y+1) */
    if (x === 0) conn++;
    else {
      let t = false;
      if (x >= 2 && h[y * W + (x - 2)]) t = true;
      if (!t && x >= 1) {
        if (y >= 1 && v[(y - 1) * W + (x - 1)]) t = true;
        if (!t && v[y * W + (x - 1)]) t = true;
        if (!t && y <= W - 2 && v[(y + 1) * W + (x - 1)]) t = true;
      }
      if (t) conn++;
    }
    /* M = (x+1, y+1) */
    if (y >= 1 && v[(y - 1) * W + x]) conn++;
    else if (y <= W - 2 && v[(y + 1) * W + x]) conn++;
    /* P2 = (x+2, y+1) */
    if (x === W - 1) conn++;
    else {
      let t = false;
      if (x <= W - 3 && h[y * W + (x + 2)]) t = true;
      if (!t && x <= W - 2) {
        if (y >= 1 && v[(y - 1) * W + (x + 1)]) t = true;
        if (!t && v[y * W + (x + 1)]) t = true;
        if (!t && y <= W - 2 && v[(y + 1) * W + (x + 1)]) t = true;
      }
      if (t) conn++;
    }
    return conn >= 2;
  }
  let conn = 0;
  /* P1 = (x+1, y) */
  if (y === 0) conn++;
  else {
    let t = false;
    if (y >= 2 && v[(y - 2) * W + x]) t = true;
    if (!t && y >= 1) {
      if (x >= 1 && h[(y - 1) * W + (x - 1)]) t = true;
      if (!t && h[(y - 1) * W + x]) t = true;
      if (!t && x <= W - 2 && h[(y - 1) * W + (x + 1)]) t = true;
    }
    if (t) conn++;
  }
  /* M = (x+1, y+1) */
  if (x >= 1 && h[y * W + (x - 1)]) conn++;
  else if (x <= W - 2 && h[y * W + (x + 1)]) conn++;
  /* P2 = (x+1, y+2) */
  if (y === W - 1) conn++;
  else {
    let t = false;
    if (y <= W - 3 && v[(y + 2) * W + x]) t = true;
    if (!t && y <= W - 2) {
      if (x >= 1 && h[(y + 1) * W + (x - 1)]) t = true;
      if (!t && h[(y + 1) * W + x]) t = true;
      if (!t && x <= W - 2 && h[(y + 1) * W + (x + 1)]) t = true;
    }
    if (t) conn++;
  }
  return conn >= 2;
}

/* ============ do/undo（xor 自逆，成对异或即还原；墙操作同步维护 gLo/gHi） ============ */

function applyPawnC(c: Core, p: Player, to: Vec) {
  const size = c.size;
  const zLo = p === "A" ? zPawnALo : zPawnBLo;
  const zHi = p === "A" ? zPawnAHi : zPawnBHi;
  const cur = p === "A" ? c.posA : c.posB;
  const fi = cur.y * size + cur.x;
  const ti = to.y * size + to.x;
  c.hashLo = (c.hashLo ^ zLo[fi] ^ zLo[ti] ^ zSideLo) | 0;
  c.hashHi = (c.hashHi ^ zHi[fi] ^ zHi[ti] ^ zSideHi) | 0;
  if (p === "A") c.posA = { x: to.x, y: to.y };
  else c.posB = { x: to.x, y: to.y };
}

function undoPawnC(c: Core, p: Player, from: Vec) {
  const size = c.size;
  const zLo = p === "A" ? zPawnALo : zPawnBLo;
  const zHi = p === "A" ? zPawnAHi : zPawnBHi;
  const cur = p === "A" ? c.posA : c.posB;
  const fi = from.y * size + from.x;
  const ti = cur.y * size + cur.x;
  c.hashLo = (c.hashLo ^ zLo[fi] ^ zLo[ti] ^ zSideLo) | 0;
  c.hashHi = (c.hashHi ^ zHi[fi] ^ zHi[ti] ^ zSideHi) | 0;
  if (p === "A") c.posA = { x: from.x, y: from.y };
  else c.posB = { x: from.x, y: from.y };
}

function applyWallC(c: Core, p: Player, x: number, y: number, o: Orientation) {
  const W = c.size - 1;
  const idx = y * W + x;
  const zlo = o === "h" ? zWallHLo[idx] : zWallVLo[idx];
  const zhi = o === "h" ? zWallHHi[idx] : zWallVHi[idx];
  c.hashLo = (c.hashLo ^ zlo ^ zSideLo) | 0;
  c.hashHi = (c.hashHi ^ zhi ^ zSideHi) | 0;
  c.gLo = (c.gLo ^ zlo) | 0;
  c.gHi = (c.gHi ^ zhi) | 0;
  if (o === "h") c.h[idx] = 1;
  else c.v[idx] = 1;
  if (p === "A") {
    const k = c.wallsA;
    c.hashLo = (c.hashLo ^ zWallsALo[k] ^ zWallsALo[k - 1]) | 0;
    c.hashHi = (c.hashHi ^ zWallsAHi[k] ^ zWallsAHi[k - 1]) | 0;
    c.wallsA = k - 1;
  } else {
    const k = c.wallsB;
    c.hashLo = (c.hashLo ^ zWallsBLo[k] ^ zWallsBLo[k - 1]) | 0;
    c.hashHi = (c.hashHi ^ zWallsBHi[k] ^ zWallsBHi[k - 1]) | 0;
    c.wallsB = k - 1;
  }
}

function undoWallC(c: Core, p: Player, x: number, y: number, o: Orientation) {
  const W = c.size - 1;
  const idx = y * W + x;
  const zlo = o === "h" ? zWallHLo[idx] : zWallVLo[idx];
  const zhi = o === "h" ? zWallHHi[idx] : zWallVHi[idx];
  c.hashLo = (c.hashLo ^ zlo ^ zSideLo) | 0;
  c.hashHi = (c.hashHi ^ zhi ^ zSideHi) | 0;
  c.gLo = (c.gLo ^ zlo) | 0;
  c.gHi = (c.gHi ^ zhi) | 0;
  if (o === "h") c.h[idx] = 0;
  else c.v[idx] = 0;
  if (p === "A") {
    const k = c.wallsA; // 撤销前 = k-1，撤销后 = k
    c.wallsA = k + 1;
    c.hashLo = (c.hashLo ^ zWallsALo[k + 1] ^ zWallsALo[k]) | 0;
    c.hashHi = (c.hashHi ^ zWallsAHi[k + 1] ^ zWallsAHi[k]) | 0;
  } else {
    const k = c.wallsB;
    c.wallsB = k + 1;
    c.hashLo = (c.hashLo ^ zWallsBLo[k + 1] ^ zWallsBLo[k]) | 0;
    c.hashHi = (c.hashHi ^ zWallsBHi[k + 1] ^ zWallsBHi[k]) | 0;
  }
}

/* 基于 core 的棋子合法着法（含直跳/斜跳） */
function coreLegalPawnMoves(c: Core, p: Player): Vec[] {
  const N = c.size;
  const me = p === "A" ? c.posA : c.posB;
  const op = p === "A" ? c.posB : c.posA;
  const grids = { h: c.h, v: c.v };
  const res: Vec[] = [];
  const dirs: Array<[number, number]> = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  for (const [dx, dy] of dirs) {
    const nx = me.x + dx;
    const ny = me.y + dy;
    if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
    if (edgeBlockedG(grids, me.x, me.y, dx, dy)) continue;
    if (op.x === nx && op.y === ny) {
      const jx = me.x + 2 * dx;
      const jy = me.y + 2 * dy;
      const inB = jx >= 0 && jx <= N - 1 && jy >= 0 && jy <= N - 1;
      const clear = inB && !edgeBlockedG(grids, nx, ny, dx, dy);
      if (clear) {
        res.push({ x: jx, y: jy });
        continue;
      }
      const perps: Array<[number, number]> =
        dx !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      for (const [px, py] of perps) {
        const sx = nx + px;
        const sy = ny + py;
        if (sx < 0 || sx > N - 1 || sy < 0 || sy > N - 1) continue;
        if (edgeBlockedG(grids, nx, ny, px, py)) continue;
        res.push({ x: sx, y: sy });
      }
    } else {
      res.push({ x: nx, y: ny });
    }
  }
  return res;
}

/* 非分配版机动数（评估用，语义与 coreLegalPawnMoves 完全一致） */
function countPawnMoves(c: Core, p: Player): number {
  const N = c.size;
  const me = p === "A" ? c.posA : c.posB;
  const op = p === "A" ? c.posB : c.posA;
  const grids = { h: c.h, v: c.v };
  let cnt = 0;
  const dirs: Array<[number, number]> = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  for (const [dx, dy] of dirs) {
    const nx = me.x + dx;
    const ny = me.y + dy;
    if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
    if (edgeBlockedG(grids, me.x, me.y, dx, dy)) continue;
    if (op.x === nx && op.y === ny) {
      const jx = me.x + 2 * dx;
      const jy = me.y + 2 * dy;
      const inB = jx >= 0 && jx <= N - 1 && jy >= 0 && jy <= N - 1;
      const clear = inB && !edgeBlockedG(grids, nx, ny, dx, dy);
      if (clear) {
        cnt++;
        continue;
      }
      const perps: Array<[number, number]> =
        dx !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      for (const [px, py] of perps) {
        const sx = nx + px;
        const sy = ny + py;
        if (sx < 0 || sx > N - 1 || sy < 0 || sy > N - 1) continue;
        if (edgeBlockedG(grids, nx, ny, px, py)) continue;
        cnt++;
      }
    } else {
      cnt++;
    }
  }
  return cnt;
}

/* 行棋方本手即可达终点（含直跳/斜跳合法性）——任意深度精确判胜 */
function canReachGoalNow(c: Core, p: Player): boolean {
  const N = c.size;
  const me = p === "A" ? c.posA : c.posB;
  const op = p === "A" ? c.posB : c.posA;
  const goal = goalRow(p, N);
  if (me.y === goal) return false;
  const grids = { h: c.h, v: c.v };
  const dirs: Array<[number, number]> = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  for (const [dx, dy] of dirs) {
    const nx = me.x + dx;
    const ny = me.y + dy;
    if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
    if (edgeBlockedG(grids, me.x, me.y, dx, dy)) continue;
    if (op.x === nx && op.y === ny) {
      const jx = me.x + 2 * dx;
      const jy = me.y + 2 * dy;
      const inB = jx >= 0 && jx <= N - 1 && jy >= 0 && jy <= N - 1;
      if (inB && !edgeBlockedG(grids, nx, ny, dx, dy) && jy === goal) return true;
      const perps: Array<[number, number]> =
        dx !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      for (const [px, py] of perps) {
        const sx = nx + px;
        const sy = ny + py;
        if (sx < 0 || sx > N - 1 || sy < 0 || sy > N - 1) continue;
        if (edgeBlockedG(grids, nx, ny, px, py)) continue;
        if (sy === goal) return true;
      }
    } else if (ny === goal) {
      return true;
    }
  }
  return false;
}

/* —— 某方最短路格点标记（排序用；返回共享缓冲，即时消费）。
 * 距离场缓存后 O(路径长)：从棋子沿距离梯度下降即可。 */
const _pcMarks = new Uint8Array(MAX_CELLS);
const _pcDirs: Array<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

function corePathCells(c: Core, p: Player): Uint8Array | null {
  const N = c.size;
  const buf = goalDists(c);
  const base = p === "A" ? 0 : MAX_CELLS;
  const from = p === "A" ? c.posA : c.posB;
  let cur = from.y * N + from.x;
  let dist = buf[base + cur];
  if (dist <= 0) return null;
  _pcMarks.fill(0, 0, N * N);
  _pcMarks[cur] = 1;
  const grids = { h: c.h, v: c.v };
  while (dist > 0) {
    const cx = cur % N;
    const cy = (cur - cx) / N;
    let next = -1;
    for (const [dx, dy] of _pcDirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
      if (buf[base + ny * N + nx] === dist - 1) {
        next = ny * N + nx;
        break;
      }
    }
    if (next < 0) return null; /* 理论不可达（缓存一致时不会发生） */
    _pcMarks[next] = 1;
    cur = next;
    dist--;
  }
  return _pcMarks;
}

/* ============ 置换表与启发 ============ */

const TT_EXACT = 0;
const TT_LOWER = 1; // score ≥ beta 截断（下界）
const TT_UPPER = 2; // score ≤ alpha（上界）

interface TtEntry {
  hi: number;
  depth: number;
  score: number;
  flag: number;
  best: number; // 着法编码（排序用）
}

interface SearchCtx {
  tt: Map<number, TtEntry>;
  killers: Int32Array; // 每层 2 个杀手着法编码
  history: Float64Array; // 挡板历史启发分
  deadline: number;
  start: number;
  nodes: number;
  params: LevelParams;
  wallPly: number[]; // 搜索路径上放板所处的层（断路归责用）
}

class SearchAbort extends Error {}
const ABORT = new SearchAbort();

interface Cand {
  code: number;
  payload: MovePayload;
  score: number;
}

function pawnCode(to: Vec, size: number): number {
  return PAWN_CODE_BASE + to.y * size + to.x;
}

function wallCode(x: number, y: number, o: Orientation, size: number): number {
  return (y * (size - 1) + x) * 2 + (o === "h" ? 0 : 1);
}

/* ============ 候选生成 ============ */

function genCandidates(
  c: Core,
  p: Player,
  ctx: SearchCtx | null,
  ply: number,
  strict: boolean,
  wallLimit: number,
): Cand[] {
  const out: Cand[] = [];
  const N = c.size;
  const W = N - 1;
  const lastA = W - 1;
  const me = p === "A" ? c.posA : c.posB;
  const op = p === "A" ? c.posB : c.posA;
  const goal = goalRow(p, N);

  /* 棋子着法：朝目标优先，跳子加分 */
  for (const to of coreLegalPawnMoves(c, p)) {
    const toward = Math.abs(me.y - goal) - Math.abs(to.y - goal);
    const jump = Math.abs(to.x - me.x) + Math.abs(to.y - me.y) >= 2 ? 1 : 0;
    out.push({
      code: pawnCode(to, N),
      payload: { type: "pawn", from: { x: me.x, y: me.y }, to: { x: to.x, y: to.y } },
      score: toward * 12 + jump * 8,
    });
  }

  const wallsLeft = p === "A" ? c.wallsA : c.wallsB;
  if (wallsLeft <= 0) return out.sort((a, b) => b.score - a.score);

  /* 对手最短路格点标记（贴近即高优先） */
  let pathMarks: Uint8Array | null = null;
  if (ctx) pathMarks = corePathCells(c, opponent(p));

  const seen = new Set<number>();
  const consider = (x: number, y: number, o: Orientation, base: number) => {
    if (x < 0 || y < 0 || x > lastA || y > lastA) return;
    const code = wallCode(x, y, o, N);
    if (seen.has(code)) return;
    seen.add(code);
    /* 冲突快查（重叠/十字交叉） */
    if (o === "h") {
      if (c.h[y * W + x]) return;
      if (x > 0 && c.h[y * W + x - 1]) return;
      if (x < lastA && c.h[y * W + x + 1]) return;
      if (c.v[y * W + x]) return;
    } else {
      if (c.v[y * W + x]) return;
      if (y > 0 && c.v[(y - 1) * W + x]) return;
      if (y < lastA && c.v[(y + 1) * W + x]) return;
      if (c.h[y * W + x]) return;
    }
    let score = base;
    if (pathMarks) {
      let near = false;
      for (let dx = -1; dx <= 1 && !near; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cx = x + dx;
          const cy = y + dy;
          if (cx < 0 || cy < 0 || cx >= N || cy >= N) continue;
          if (pathMarks[cy * N + cx]) {
            near = true;
            break;
          }
        }
      }
      if (near) score += 30;
    }
    if (ctx) {
      if (ply < MAX_PLY && (ctx.killers[ply * 2] === code || ctx.killers[ply * 2 + 1] === code)) {
        score += 55;
      }
      if (code < WALL_CODE_SPACE) score += Math.min(40, ctx.history[code] / 8);
    }
    out.push({ code, payload: { type: "wall", wall: { x, y, o, by: p } }, score });
  };

  /* 对手周边窗口（两种朝向） */
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const bx = op.x + dx;
      const by = op.y + dy;
      const base = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? 6 : 2;
      consider(bx, by, "h", base);
      consider(bx, by, "v", base);
    }
  }
  /* 己方走廊（防贴身封路的自卫板） */
  for (let dx = -1; dx <= 1; dx++) {
    consider(me.x + dx, me.y - 2, "h", 4);
    consider(me.x + dx, me.y + 2, "h", 4);
  }
  /* 对手终点行前沿（常见刀口） */
  const opGoal = goalRow(opponent(p), N);
  for (let dx = -2; dx <= 2; dx++) {
    consider(op.x + dx, opGoal === 0 ? 0 : N - 2, "h", 3);
  }
  /* 沿既有挡板端点延伸（远离棋子的战略连锁板：延长漏斗、加长归途） */
  for (let idx = 0; idx < W * W; idx++) {
    if (c.h[idx]) {
      const hy = (idx / W) | 0;
      const hx = idx - hy * W;
      consider(hx - 2, hy, "h", 3);
      consider(hx + 2, hy, "h", 3);
    }
    if (c.v[idx]) {
      const vy = (idx / W) | 0;
      const vx = idx - vy * W;
      consider(vx, vy - 2, "v", 3);
      consider(vx, vy + 2, "v", 3);
    }
  }

  let walls: Cand[] = [];
  const pawns: Cand[] = [];
  for (const cd of out) {
    if (cd.payload.type === "wall") walls.push(cd);
    else pawns.push(cd);
  }
  walls.sort((a, b) => b.score - a.score);

  if (strict) {
    /* 根节点：探针验证（不断路）+ 真实增益重排 */
    const myD = coreDist(c, p);
    const opD = coreDist(c, opponent(p));
    const probed: Cand[] = [];
    let kept = 0;
    for (const w of walls) {
      if (kept >= wallLimit) break;
      const wl = (w.payload as WallPayload).wall;
      const probe = coreProbeWall(c, wl.x, wl.y, wl.o);
      if (probe.pathCut) continue;
      const newMyD = p === "A" ? probe.dA : probe.dB;
      const newOpD = p === "A" ? probe.dB : probe.dA;
      w.score = w.score + (newOpD - opD) * 6 - (newMyD - myD) * 6;
      probed.push(w);
      kept++;
    }
    probed.sort((a, b) => b.score - a.score);
    walls = probed;
  } else {
    walls = walls.slice(0, wallLimit);
  }

  const all = [...walls, ...pawns];
  all.sort((a, b) => b.score - a.score);
  return all;
}

/* ============ 评估 ============ */

/* 断路局面（搜索内试放所致，真实规则不可达）：断路必由放板造成——
 * 归罪于搜索路径上最后一位放板者（而非可能无事的最后行棋方）。
 * 根局面合法，故断路时 wallPly 栈必非空。 */
function cutBlame(me: Player, ply: number, ctx: SearchCtx): number {
  const lastWallPly = ctx.wallPly.length > 0 ? ctx.wallPly[ctx.wallPly.length - 1] : -1;
  const placer = lastWallPly % 2 === 0 ? me : opponent(me);
  const dist = EVAL_WIN - ply;
  return placer === me ? -dist : dist;
}

/* 对冲跳子节奏（近似修正）：两活字同列对冲（其间无墙、间距 2..6）时，
 * 间距奇偶与行棋权决定谁拿到跳——跳者穿过对方直取后方，被跳者反被
 * 压一步。净效果约 ±2 评估分。无此修正时搜索看不见互冲的节奏陷阱，
 * 会一头撞进对手的跳子（自对弈：直线互冲的先行方反而输掉竞速）。 */
function collisionAdj(c: Core, me: Player, mover: Player): number {
  const yA = c.posA.y;
  const xA = c.posA.x;
  const yB = c.posB.y;
  const xB = c.posB.x;
  /* 头对头：同列、甲在乙下方（甲方上行、乙方下行） */
  if (xA !== xB || yA <= yB) return 0;
  const d = yA - yB;
  if (d < 2 || d > 6) return 0;
  const grids = { h: c.h, v: c.v };
  for (let y = yB; y < yA; y++) {
    if (edgeBlockedG(grids, xA, y, 0, 1)) return 0; // 其间有墙：无跳可谈
  }
  /* D-1 步后成邻；此时行棋者跳。D 奇 → 当前行棋方跳，D 偶 → 对方跳 */
  const jumper = d % 2 === 1 ? mover : opponent(mover);
  if (jumper === me) return 2; // 我跳：我方 -1 步、对方 +1 步
  return -2;
}

/* 路径分岔自由度：棋子邻格中「距目标更近一格」的格子数。
 * 单线走廊（0-1 个前向口）可被一根挡板封死，多岔路径更抗封——
 * 这是文献中 Quoridor 评估的关键增量项（路径鲁棒性）。 */
function forwardChoices(c: Core, buf: Int16Array, p: Player, d: number): number {
  if (d <= 0) return 0;
  const N = c.size;
  const base = p === "A" ? 0 : MAX_CELLS;
  const pos = p === "A" ? c.posA : c.posB;
  const grids = { h: c.h, v: c.v };
  let cnt = 0;
  const dirs: Array<[number, number]> = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  for (const [dx, dy] of dirs) {
    const nx = pos.x + dx;
    const ny = pos.y + dy;
    if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
    if (edgeBlockedG(grids, pos.x, pos.y, dx, dy)) continue;
    if (buf[base + ny * N + nx] === d - 1) cnt++;
  }
  return cnt;
}

function evaluate(c: Core, me: Player, ply: number, ctx0: SearchCtx): number {
  const buf = goalDists(c);
  const N = c.size;
  const ai = c.posA.y * N + c.posA.x;
  const bi = c.posB.y * N + c.posB.x;
  const dA = buf[ai];
  const dB = buf[MAX_CELLS + bi];
  if (dA === 0) return me === "A" ? EVAL_WIN - ply : -(EVAL_WIN - ply);
  if (dB === 0) return me === "B" ? EVAL_WIN - ply : -(EVAL_WIN - ply);
  if (dA < 0 || dB < 0) return cutBlame(me, ply, ctx0);

  const myD = me === "A" ? dA : dB;
  const opD = me === "A" ? dB : dA;
  const myWalls = me === "A" ? c.wallsA : c.wallsB;
  const opWalls = me === "A" ? c.wallsB : c.wallsA;

  /* —— 经典三项：路径差 + 板差 + 机动差（系数全对称，无座位偏向）—— */
  const mobMe = countPawnMoves(c, me);
  const mobOp = countPawnMoves(c, opponent(me));
  let score = (opD - myD) + 0.3 * (myWalls - opWalls) + 0.1 * (mobMe - mobOp);

  /* 余板价值：防守与反击弹药（每板 0.45，上限 6——十板开局在线性区内，
   * 每板边际成本恒定）。交换模型对称：领先方需要板防守对手的反击，
   * 落后方需要板拉长对手归途。自对弈校准：低于 0.3/板时领先方宁可
   * 裸奔也不放板（输给跳子节奏）；高于 0.6/板则诱发“囚笼”挥霍。 */
  score += Math.min(myWalls * 0.45, 6) - Math.min(opWalls * 0.45, 6);

  /* 行棋权节奏：等距竞速时轮到走的一方实质领先半步（跳子先手） */
  const mover = ply % 2 === 0 ? me : opponent(me);
  if (Math.abs(opD - myD) <= 2) score += mover === me ? 0.25 : -0.25;

  /* 对冲跳子节奏修正（同列头对头） */
  score += collisionAdj(c, me, mover);

  /* 陷阱惩罚：只罚自己走进死巷（≤3 着）。不奖励“关押对手”——
   * 围笼对路径的增益已由 opD 计价，额外的机动性奖励会诱发囚笼开局。 */
  const trapPen = (mob: number) => (mob <= 3 ? (4 - mob) * 0.5 : 0);
  score -= trapPen(mobMe);

  /* 路径分岔自由度（对称）：多前向口 = 更抗封；单线走廊易被一板锁喉。
   * 权重 0.15/岔（封顶 3 岔），与路径差同量级但不喧宾夺主。 */
  const fwdMe = Math.min(forwardChoices(c, buf, me, myD), 3);
  const fwdOp = Math.min(forwardChoices(c, buf, opponent(me), opD), 3);
  score += 0.15 * (fwdMe - fwdOp);

  return score;
}

/* 双方挡板耗尽 → 纯竞速，精确判胜（无需搜索） */
function raceEval(c: Core, me: Player, ply: number, ctx0: SearchCtx): number {
  const buf = goalDists(c);
  const N = c.size;
  const ai = c.posA.y * N + c.posA.x;
  const bi = c.posB.y * N + c.posB.x;
  const dA = buf[ai];
  const dB = buf[MAX_CELLS + bi];
  if (dA === 0) return me === "A" ? EVAL_WIN - ply : -(EVAL_WIN - ply);
  if (dB === 0) return me === "B" ? EVAL_WIN - ply : -(EVAL_WIN - ply);
  if (dA < 0 || dB < 0) return cutBlame(me, ply, ctx0);
  const myD = me === "A" ? dA : dB;
  const opD = me === "A" ? dB : dA;
  if (myD !== opD) {
    return myD < opD ? EVAL_WIN - ply - myD : -(EVAL_WIN - ply - opD);
  }
  const mover = ply % 2 === 0 ? me : opponent(me);
  return mover === me ? EVAL_WIN - ply - myD : -(EVAL_WIN - ply - opD);
}

/* ============ α-β 搜索（固定视角 + PVS + TT + 杀手/历史启发） ============ */

function noteCutoff(ctx: SearchCtx, ply: number, code: number, depth: number) {
  if (code >= WALL_CODE_SPACE || ply >= MAX_PLY) return;
  ctx.history[code] += depth * depth;
  if (ctx.history[code] > 1e6) ctx.history[code] = 1e6;
  const k0 = ctx.killers[ply * 2];
  if (k0 !== code) {
    ctx.killers[ply * 2 + 1] = k0;
    ctx.killers[ply * 2] = code;
  }
}

function ttStore(
  ctx: SearchCtx,
  key: number,
  hi: number,
  depth: number,
  score: number,
  alphaOrig: number,
  beta: number,
  bestCode: number,
) {
  if (Math.abs(score) > EVAL_WIN / 2) return; // 杀着分含距离信息，不入表
  if (ctx.tt.size > 400000) ctx.tt.clear();
  const flag = score <= alphaOrig ? TT_UPPER : score >= beta ? TT_LOWER : TT_EXACT;
  ctx.tt.set(key, { hi: hi >>> 0, depth, score, flag, best: bestCode });
}

function alphabeta(
  c: Core,
  ply: number,
  depth: number,
  alpha: number,
  beta: number,
  me: Player,
  ctx: SearchCtx,
): number {
  ctx.nodes++;
  if ((ctx.nodes & 255) === 0 && Date.now() > ctx.deadline) throw ABORT;

  /* 纯竞速终局：任何深度直接精确判胜 */
  if (c.wallsA === 0 && c.wallsB === 0) return raceEval(c, me, ply, ctx);

  /* 即胜检测：行棋方本手可达终点（考虑占位跳子/斜跳）——任意深度精确。
   * 距离场 O(1) 先筛（dist===1 是必要条件），极少数候选才做全着法核验。 */
  const mover0 = ply % 2 === 0 ? me : opponent(me);
  if (coreDist(c, mover0) === 1 && canReachGoalNow(c, mover0)) {
    return mover0 === me ? EVAL_WIN - ply - 1 : -(EVAL_WIN - ply - 1);
  }

  const alphaOrig = alpha;
  const key = c.hashLo >>> 0;
  let ttBestCode = -1;
  const entry = ctx.tt.get(key);
  if (entry && entry.hi === (c.hashHi >>> 0)) {
    ttBestCode = entry.best;
    if (entry.depth >= depth) {
      if (entry.flag === TT_EXACT) return entry.score;
      if (entry.flag === TT_LOWER && entry.score >= beta) return entry.score;
      if (entry.flag === TT_UPPER && entry.score <= alpha) return entry.score;
    }
  }

  if (depth <= 0) return evaluate(c, me, ply, ctx);

  const p = ply % 2 === 0 ? me : opponent(me);
  let cands = genCandidates(c, p, ctx, ply, false, ctx.params.wallLimit);
  if (cands.length === 0) return evaluate(c, me, ply, ctx);

  if (ttBestCode >= 0) {
    const i = cands.findIndex((cd) => cd.code === ttBestCode);
    if (i > 0) {
      const pick = cands[i];
      cands.splice(i, 1);
      cands.unshift(pick);
    }
  }

  if (p === me) {
    /* MAX 节点：首着全窗，其余零宽探针 + 按需重搜（PVS） */
    let best = -Infinity;
    let bestCode = -1;
    let first = true;
    for (const cand of cands) {
      let val: number;
      if (cand.payload.type === "pawn") {
        const from = p === "A" ? { ...c.posA } : { ...c.posB };
        applyPawnC(c, p, cand.payload.to);
        if (first) {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
          first = false;
        } else if (beta - alpha > PVS_EPS * 8) {
          const probe = alphabeta(c, ply + 1, depth - 1, alpha, alpha + PVS_EPS, me, ctx);
          if (probe > alpha && probe < beta) {
            val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
          } else if (probe >= beta) {
            val = probe; // 置信下界 ≥ beta：直接引发截断
          } else {
            undoPawnC(c, p, from);
            continue; // ≤ alpha：不可能是更优
          }
        } else {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
        }
        undoPawnC(c, p, from);
      } else if (cand.payload.type === "wall") {
        const w = cand.payload.wall;
        /* 内层放板合法性：接触计数快检（<2 连接点拓扑上不可能封路），
         * 危险板才做全 BFS 断路探针——真实规则里封路的板不得入树。 */
        if (wallDangerous(c, w.x, w.y, w.o) && coreProbeWall(c, w.x, w.y, w.o).pathCut) {
          continue;
        }
        ctx.wallPly.push(ply);
        applyWallC(c, p, w.x, w.y, w.o);
        if (first) {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
          first = false;
        } else if (beta - alpha > PVS_EPS * 8) {
          const probe = alphabeta(c, ply + 1, depth - 1, alpha, alpha + PVS_EPS, me, ctx);
          if (probe > alpha && probe < beta) {
            val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
          } else if (probe >= beta) {
            val = probe;
          } else {
            undoWallC(c, p, w.x, w.y, w.o);
            ctx.wallPly.pop();
            continue;
          }
        } else {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
        }
        undoWallC(c, p, w.x, w.y, w.o);
        ctx.wallPly.pop();
      } else {
        continue; // 候选只含棋子/挡板；防御性跳过
      }
      if (val > best) {
        best = val;
        bestCode = cand.code;
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        if (cand.payload.type === "wall") noteCutoff(ctx, ply, cand.code, depth);
        break;
      }
    }
    ttStore(ctx, key, c.hashHi, depth, best, alphaOrig, beta, bestCode);
    return best;
  } else {
    /* MIN 节点：PVS 镜像（零宽窗围绕 beta） */
    let best = Infinity;
    let bestCode = -1;
    let first = true;
    for (const cand of cands) {
      let val: number;
      if (cand.payload.type === "pawn") {
        const from = p === "A" ? { ...c.posA } : { ...c.posB };
        applyPawnC(c, p, cand.payload.to);
        if (first) {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
          first = false;
        } else if (beta - alpha > PVS_EPS * 8) {
          const probe = alphabeta(c, ply + 1, depth - 1, beta - PVS_EPS, beta, me, ctx);
          if (probe < beta && probe > alpha) {
            val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
          } else {
            undoPawnC(c, p, from);
            continue; // ≥ beta 于 min 无益；≤ alpha 不可能更优
          }
        } else {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
        }
        undoPawnC(c, p, from);
      } else if (cand.payload.type === "wall") {
        const w = cand.payload.wall;
        if (wallDangerous(c, w.x, w.y, w.o) && coreProbeWall(c, w.x, w.y, w.o).pathCut) {
          continue;
        }
        ctx.wallPly.push(ply);
        applyWallC(c, p, w.x, w.y, w.o);
        if (first) {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
          first = false;
        } else if (beta - alpha > PVS_EPS * 8) {
          const probe = alphabeta(c, ply + 1, depth - 1, beta - PVS_EPS, beta, me, ctx);
          if (probe < beta && probe > alpha) {
            val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
          } else {
            undoWallC(c, p, w.x, w.y, w.o);
            ctx.wallPly.pop();
            continue;
          }
        } else {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
        }
        undoWallC(c, p, w.x, w.y, w.o);
        ctx.wallPly.pop();
      } else {
        continue;
      }
      if (val < best) {
        best = val;
        bestCode = cand.code;
      }
      if (best < beta) beta = best;
      if (alpha >= beta) {
        if (cand.payload.type === "wall") noteCutoff(ctx, ply, cand.code, depth);
        break;
      }
    }
    ttStore(ctx, key, c.hashHi, depth, best, alphaOrig, beta, bestCode);
    return best;
  }
}

/* ============ 搜索入口 ============ */

function searchMove(state: GameState, params: LevelParams): MovePayload | null {
  const me = state.turn;
  const c = toCore(state);
  const ctx: SearchCtx = {
    tt: new Map(),
    killers: new Int32Array(MAX_PLY * 2),
    history: new Float64Array(WALL_CODE_SPACE),
    deadline: Date.now() + params.budgetMs,
    start: Date.now(),
    nodes: 0,
    params,
    wallPly: [],
  };

  let cands = genCandidates(c, me, ctx, 0, true, params.rootWallLimit);
  if (cands.length === 0) return null;

  let bestPayload: MovePayload = cands[0].payload;
  let bestScore = -Infinity;
  let completedDepth = 0;

  for (let depth = 2; depth <= params.maxDepth; depth++) {
    /* 迭代加深：按上一轮各着法分值全量重排（上轮最优自然居首） */
    cands.sort((a, b) => b.score - a.score);
    let localBest: MovePayload | null = null;
    let localScore = -Infinity;
    let alpha = -Infinity;
    let searched = 0;
    let first = true;
    try {
      for (const cand of cands) {
        let val: number;
        if (cand.payload.type === "pawn") {
          const from = me === "A" ? { ...c.posA } : { ...c.posB };
          applyPawnC(c, me, cand.payload.to);
          if (first) {
            val = alphabeta(c, 1, depth - 1, alpha, Infinity, me, ctx);
            first = false;
          } else {
            /* 根节点 PVS：零宽探针，失败低即弃（界值留作排序信号） */
            const probe = alphabeta(c, 1, depth - 1, alpha, alpha + PVS_EPS, me, ctx);
            val = probe > alpha ? alphabeta(c, 1, depth - 1, alpha, Infinity, me, ctx) : probe;
          }
          /* 根节点平分破局（着法生效中计价）：同分时优先推进，
           * 否则领先方会原地振荡（自对弈：胜势下 d6↔e6 徘徊不肯走向终点）。
           * 败势时折价加倍——仍选离终点最近的抵抗。 */
          val -= coreDist(c, me) * 0.001;
          if (val < -EVAL_WIN / 2) val -= coreDist(c, me) * 0.01;
          undoPawnC(c, me, from);
        } else if (cand.payload.type === "wall") {
          const w = cand.payload.wall;
          ctx.wallPly.push(0);
          applyWallC(c, me, w.x, w.y, w.o);
          if (first) {
            val = alphabeta(c, 1, depth - 1, alpha, Infinity, me, ctx);
            first = false;
          } else {
            const probe = alphabeta(c, 1, depth - 1, alpha, alpha + PVS_EPS, me, ctx);
            val = probe > alpha ? alphabeta(c, 1, depth - 1, alpha, Infinity, me, ctx) : probe;
          }
          val -= coreDist(c, me) * 0.001;
          if (val < -EVAL_WIN / 2) val -= coreDist(c, me) * 0.01;
          undoWallC(c, me, w.x, w.y, w.o);
          ctx.wallPly.pop();
        } else {
          continue; // 候选只含棋子/挡板；防御性跳过
        }
        searched++;
        cand.score = val; /* 记入排序分供下轮迭代 */
        if (val > localScore) {
          localScore = val;
          localBest = cand.payload;
        }
        if (localScore > alpha) alpha = localScore;
      }
    } catch (e) {
      if (e instanceof SearchAbort) {
        /* 深度未完成：仅首层（depth 2）采信部分结果 */
        if (depth === 2 && searched > 0 && localBest) {
          bestPayload = localBest;
          bestScore = localScore;
        }
        break;
      }
      throw e;
    }
    if (localBest) {
      bestPayload = localBest;
      bestScore = localScore;
      completedDepth = depth;
    }
    if (bestScore > EVAL_WIN / 2) {
      if (AI_DEBUG) console.log(`[ai] 早停必胜 depth=${depth} score=${bestScore.toFixed(1)} nodes=${ctx.nodes} move=${JSON.stringify(bestPayload)}`);
      break; // 已见必胜
    }
    const elapsed = Date.now() - ctx.start;
    if (elapsed > params.budgetMs) break;
    /* 时间外推：下一层开销约 3-5 倍，已用近半即收笔 */
    if (elapsed > params.budgetMs * 0.45) break;
  }

  _lastStats.nodes = ctx.nodes;
  _lastStats.ttSize = ctx.tt.size;
  _lastStats.elapsedMs = Date.now() - ctx.start;
  _lastStats.depth = completedDepth;
  return bestPayload;
}

/* ============ 一档：学徒（启发式，保留笨拙的可爱） ============ */

function inBoundsAnchor(x: number, y: number, size: number): boolean {
  return x >= 0 && x <= size - 2 && y >= 0 && y <= size - 2;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    posA: { ...state.posA },
    posB: { ...state.posB },
    walls: state.walls.map((w) => ({ ...w })),
    history: state.history.slice(),
  };
}

function apprenticeMove(state: GameState): AiDecision {
  const N = boardSize(state);
  const me = state.turn;
  const op = opponent(me);
  const opPos = op === "A" ? state.posA : state.posB;
  const core = toCore(state);
  const myD = coreDist(core, me);
  const wallsLeft = me === "A" ? state.wallsA : state.wallsB;

  /* 偶尔放板（16%）：在对手附近随机挑一块合法且不伤己路的挡板 */
  if (wallsLeft > 0 && Math.random() < 0.16) {
    for (let attempt = 0; attempt < 14; attempt++) {
      const x = opPos.x + Math.floor(Math.random() * 5) - 2;
      const y = opPos.y + Math.floor(Math.random() * 5) - 2;
      if (!inBoundsAnchor(x, y, N)) continue;
      const o: Orientation = Math.random() < 0.5 ? "h" : "v";
      if (wallConflicts(state.walls, x, y, o)) continue;
      const probe = coreProbeWall(core, x, y, o);
      if (probe.pathCut) continue;
      const newMyD = me === "A" ? probe.dA : probe.dB;
      if (newMyD > myD) continue; /* 学徒虽笨，不至于自断 */
      return {
        payload: { type: "wall", wall: { x, y, o, by: me } },
        label: "学徒随手排了一根铅条",
      };
    }
  }

  /* 即胜优先 */
  const goal = goalRow(me, N);
  const legal = legalPawnMoves(state, me);
  const winStep = legal.find((v) => v.y === goal);
  if (winStep) {
    return {
      payload: {
        type: "pawn",
        from: me === "A" ? state.posA : state.posB,
        to: winStep,
      },
      label: "学徒摸到了终点",
    };
  }
  /* 最短路下一步（对手占位时交给合法跳子表兜底） */
  const step = shortestStepOnGrids(state, me);
  const from = from0(state, me);
  const target =
    step && legal.some((v) => v.x === step.x && v.y === step.y)
      ? step
      : pickToward(legal, from, goal) ?? legal[0];
  if (target) {
    return {
      payload: {
        type: "pawn",
        from: me === "A" ? state.posA : state.posB,
        to: { ...target },
      },
      label: "学徒循最短路径捡字",
    };
  }
  return fallbackDecision(state, me);
}

/* 学徒用：在位图上求最短路首步（忽略对手占位的近似） */
function shortestStepOnGrids(state: GameState, p: Player): Vec | null {
  const N = boardSize(state);
  const grids = buildWallGrids(state.walls, N);
  const from = p === "A" ? state.posA : state.posB;
  const goal = goalRow(p, N);
  if (from.y === goal) return null;
  const dist = new Int16Array(N * N).fill(-1);
  const parent = new Int16Array(N * N).fill(-1);
  const start = from.y * N + from.x;
  dist[start] = 0;
  const queue: number[] = [start];
  let goalIdx = -1;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const cx = cur % N;
    const cy = (cur - cx) / N;
    if (cy === goal) {
      goalIdx = cur;
      break;
    }
    const dirs: Array<[number, number]> = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
      const ni = ny * N + nx;
      if (dist[ni] >= 0) continue;
      dist[ni] = dist[cur] + 1;
      parent[ni] = cur;
      queue.push(ni);
    }
  }
  if (goalIdx < 0) return null;
  let cur = goalIdx;
  while (parent[cur] !== start && parent[cur] !== -1) cur = parent[cur];
  if (parent[cur] !== start) return null;
  const x = cur % N;
  const y = (cur - x) / N;
  return { x, y };
}

function from0(state: GameState, p: Player): Vec {
  return p === "A" ? state.posA : state.posB;
}

/* 朝目标推进的首个合法步（兜底） */
function pickToward(legal: Vec[], from: Vec, goal: number): Vec | null {
  let best: Vec | null = null;
  let bestD = Infinity;
  for (const v of legal) {
    const d = Math.abs(v.y - goal);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  void from;
  return best;
}

/* ============ 兜底 ============ */

function fallbackDecision(state: GameState, me: Player): AiDecision {
  const N = boardSize(state);
  const moves = legalPawnMoves(state, me);
  if (moves.length > 0) {
    return {
      payload: {
        type: "pawn",
        from: me === "A" ? state.posA : state.posB,
        to: moves[0],
      },
      label: "落子",
    };
  }
  const wallsLeft = me === "A" ? state.wallsA : state.wallsB;
  if (wallsLeft > 0) {
    for (let x = 0; x <= N - 2; x++) {
      for (let y = 0; y <= N - 2; y++) {
        for (const o of ["h", "v"] as Orientation[]) {
          if (checkWall(state, x, y, o, me).ok) {
            return {
              payload: { type: "wall", wall: { x, y, o, by: me } },
              label: "放板",
            };
          }
        }
      }
    }
  }
  return {
    payload: { type: "pawn", from: state.posA, to: state.posA },
    label: "无着可行",
  };
}

/* ============ 入口 ============ */

const WALL_LABEL: Record<AiLevel, string> = {
  1: "学徒随手排了一根铅条",
  2: "排字师延长了你的归途",
  3: "总编落下一道版式",
  4: "社长批下一道终审版式",
};

const PAWN_LABEL: Record<AiLevel, string> = {
  1: "学徒循最短路径捡字",
  2: "排字师沿最短路赶稿",
  3: "总编审定了去路",
  4: "社长亲自排定了去路",
};

const WIN_LABEL: Record<AiLevel, string> = {
  1: "学徒摸到了终点",
  2: "排字师一步定版",
  3: "总编拍板收官",
  4: "社长落锤定音",
};

export function computeAiMoveV2(
  state: GameState,
  level: AiLevel,
  opts?: { budgetMs?: number },
): AiDecision | null {
  if (state.winner) return null;
  /* 四人围坐局：策略族不同（竞速 + 拦截），分流到 ai4 */
  if (state.playerCount === 4) {
    return computeAiMove4(state, level, opts);
  }
  const s = cloneState(state);
  const me = s.turn;
  try {
    /* 即胜着：任何档位都不放过 */
    const N = boardSize(s);
    const goal = goalRow(me, N);
    const winNow = legalPawnMoves(s, me).find((v) => v.y === goal);
    if (winNow) {
      return {
        payload: {
          type: "pawn",
          from: me === "A" ? s.posA : s.posB,
          to: { ...winNow },
        },
        label: WIN_LABEL[level],
      };
    }
    if (level === 1) return apprenticeMove(s);

    const params = levelParams(level, N);
    const cap = opts?.budgetMs;
    const effective = cap != null ? Math.min(params.budgetMs, cap) : params.budgetMs;
    const payload = searchMove(s, { ...params, budgetMs: effective });
    if (payload) {
      const label =
        payload.type === "wall" ? WALL_LABEL[level] : PAWN_LABEL[level];
      return { payload, label };
    }
    return fallbackDecision(s, me);
  } catch (e) {
    console.error("AI 计算异常，使用兜底", e);
    return fallbackDecision(s, s.turn);
  }
}

/* 供测试与调试：上一次搜索的规模统计 */
const _lastStats = { nodes: 0, ttSize: 0, depth: 0, elapsedMs: 0, dcHits: 0, dcMisses: 0 };
export function lastSearchStatsV2() {
  return { ..._lastStats, dcHits, dcMisses };
}
