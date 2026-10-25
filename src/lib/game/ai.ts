/* 步步为营 —— AI 对手四档（编辑职位命名）· 强化版
 * 1 学徒：最短路径 + 偶尔随机放板（保留笨拙的可爱）
 * 2 排字师：浅层搜索（深度 2，按路径差增益排序候选）——聪明的贪心
 * 3 总编：α-β + PVS 主变例搜索 + Zobrist 置换表 + 杀手着法/历史启发
 * 4 社长：搜索预算全开（更深度数、更大候选窗、更久预算），终局纯竞速精确判胜
 *
 * 强化要点（相对旧版）：
 * A. 全盘目标距离缓存：以「墙配置 Zobrist」为键缓存甲乙两方的距离场
 *    （Int16Array 全盘数组），评估/探针/路径标记全部 O(1) 查表化——
 *    旧版每个叶子 2 次 BFS、每个挡板候选 2 次 BFS，是深度上不去的根因。
 * B. 墙合法性：内层候选一律经 coreProbeWall 精确判定断路（并顺带取得双方
 *    新距离，BFS 结果摊还进距离缓存，成本近似为零）。
 * C. PVS（主变例搜索）：首着全窗、其余零宽探针 + 按需重搜。
 * D. 即胜检测前移：行棋方一步可达终点（含直跳/斜跳）在任意深度精确判出。
 * E. 评估函数新增「路径分岔自由度」项；候选生成新增「沿既有墙延伸」战略板。
 * F. 根节点全量着法排序（按上一轮迭代分值），迭代间排序信息不丢失。
 *
 * 第二轮强化（v3）：
 * G. 终局精确化：①「上一手已抵终点」核验前移——双方均差一步时旧版会把
 *    已赢的一手误判为输；②无板终局改用受限精确竞速搜索（只搜推进着法），
 *    修复跳子对冲下的奇偶误判——近距离对冲局旧近似会判反胜负。
 * H. 战术延展：重击板（受害者净增 ≥2 且距终点 ≤6）不减深，
 *    墙陷阱的应手必被看清——地平线盲区的主源。
 * I. LMR 晚序降深 + 反向后手剪枝 + 根期望窗口：同预算多搜约 1.5-2 层。
 * J. 置换表跨回合持久化（全哈希补尺寸盐，防跨规格碰撞），根着法带 TT 推荐。
 * K. 候选生成补自卫侧板（列向 v 板），防侧向挤压。
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
  /** 墙威胁静止搜索：仅预算充裕的社长档启用（消融：L4 +37%，
   * L3 短预算下深度损失大于战术收益） */
  qs: boolean;
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

/* 消融开关（诊断用）：1 = 禁用对应 v3 组件 */
const ENV = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
const OFF_RF = !!ENV.QUORIDOR_AI_OFF_RF; // 反向后手剪枝
const OFF_LMR = !!ENV.QUORIDOR_AI_OFF_LMR; // 晚序降深
const OFF_EXT = !!ENV.QUORIDOR_AI_OFF_EXT; // 战术延展
const OFF_ASP = !!ENV.QUORIDOR_AI_OFF_ASP; // 根期望窗口
const OFF_PTT = !!ENV.QUORIDOR_AI_OFF_PTT; // 持久置换表（退回每回合新建）
const OFF_RW = !!ENV.QUORIDOR_AI_OFF_RW; // 板尾降深
const OFF_NMP = !!ENV.QUORIDOR_AI_OFF_NMP; // 空着剪枝（v4）
const OFF_QS = !!ENV.QUORIDOR_AI_OFF_QS; // 墙威胁静止搜索（v4）
const OFF_WP = !!ENV.QUORIDOR_AI_OFF_WP; // 评估板压项（v4）

export const AI_DEBUG = typeof process !== "undefined" && !!process.env?.QUORIDOR_AI_DEBUG;

function levelParams(level: AiLevel, size: number): LevelParams {
  /* BFS 开销随 N² 增长：按尺寸缩放预算 */
  const sizeScale = size <= 5 ? 0.55 : size === 7 ? 0.8 : size === 9 ? 1 : size === 11 ? 1.2 : 1.55;
  if (level === 2) {
    return {
      budgetMs: Math.round(280 * sizeScale),
      maxDepth: ENV_DEPTH ?? 2,
      wallLimit: ENV_WALLS ?? 10,
      rootWallLimit: ENV_ROOT ?? 12,
      qs: false,
    };
  }
  if (level === 3) {
    return {
      budgetMs: Math.round(1600 * sizeScale),
      maxDepth: ENV_DEPTH ?? (size <= 5 ? 10 : size === 7 ? 9 : size === 9 ? 10 : size === 11 ? 7 : 6),
      wallLimit: ENV_WALLS ?? 16,
      rootWallLimit: ENV_ROOT ?? 24,
      qs: false, /* 消融：短预算下 QS 深度损失 > 战术收益，关 */
    };
  }
  /* level 4 社长：最强档全预算（用户要求棋力优先，应手最长约 4.8s，
   * 外推早停后典型 2.5-3s；尺寸缩放限制大开本的上限） */
  return {
    budgetMs: Math.round(4800 * sizeScale),
    maxDepth: ENV_DEPTH ?? (size <= 5 ? 14 : size === 7 ? 13 : size === 9 ? 13 : size === 11 ? 9 : 7),
    wallLimit: ENV_WALLS ?? 18,
    rootWallLimit: ENV_ROOT ?? 32,
    qs: true, /* 预算充裕：QS 战术解析净增益 +37%（对决 75% vs 38%） */
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
  /* 全哈希含尺寸盐：不同规格同布局不会碰撞——跨回合持久置换表的前提 */
  let lo = zSizeLo[size];
  let hi = zSizeHi[size];
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

const DC_BITS = 14;
const DC_SIZE = 1 << DC_BITS; // 16384 槽（v4：静止搜索的探针配置多样性翻倍）
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

/* ============ 墙合法性接触计数快检（grantslatton《Solving Quoridor》） ============
 * 一块候选板有 3 个格点（两端 P1/P2 + 中点 M）。「连接点」= 该格点落在
 * 棋盘侧边，或与既有挡板共享该格点。若连接点 < 2，则该板在拓扑上只是
 * 一条「死端突出」，不可能封死任何玩家——无需 BFS 断路探针。
 * v3 用法：危险板必探（断路判定精确化）；安全板仅在受害者近终点
 * （延展判据需要新距离）时才探，其余直接免探。 */

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
  qnodes: number; // 静止搜索节点数（v4）
  inNull: boolean; // 空着搜索中（禁连续空着，v4）
  params: LevelParams;
  wallPly: number[]; // 搜索路径上放板所处的层（断路归责用）
  exts: number; // 当前路径上的战术延展配额（≤ 2）
}

/* 跨回合持久置换表：全哈希含棋子/墙/余板/行棋方/尺寸盐，条目与回合无关，
 * 迭代加深在连续回合间复用深层结果（上一手搜索多半已展开过本局面）。
 * 超限整表清空（罕见；260k 条目约 25MB）。 */
const P_TT = new Map<number, TtEntry>();
const P_TT_CAP = 260000;

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

/* 锚点冲突快检（网格版 O(1)：重叠/十字交叉；越界视为冲突）——
 * 威胁墙枚举用（engine 的 wallConflicts 是 Wall[] 版，热路径上更慢） */
function wallFits(c: Core, x: number, y: number, o: Orientation): boolean {
  const W = c.size - 1;
  const lastA = W - 1;
  if (x < 0 || y < 0 || x > lastA || y > lastA) return true;
  if (o === "h") {
    if (c.h[y * W + x]) return true;
    if (x > 0 && c.h[y * W + x - 1]) return true;
    if (x < lastA && c.h[y * W + x + 1]) return true;
    if (c.v[y * W + x]) return true;
  } else {
    if (c.v[y * W + x]) return true;
    if (y > 0 && c.v[(y - 1) * W + x]) return true;
    if (y < lastA && c.v[(y + 1) * W + x]) return true;
    if (c.h[y * W + x]) return true;
  }
  return false;
}

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
  /* 己方列侧卫（防侧向挤压的自卫 v 板，与走廊 h 板轴对称） */
  for (let dy = -1; dy <= 1; dy++) {
    consider(me.x - 2, me.y + dy, "v", 4);
    consider(me.x + 2, me.y + dy, "v", 4);
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

  /* 板压项（v4）：弹药 × 对手路径长度的交叉项。我的余板多且对手
   * 路径长 → 我还能把对手的长路拉得更长（表面领先要放大）；镜像，
   * 对手余板多且我路径长 → 我的表面路径领先是虚的（随时可被封）。
   * 与余板交换项的分工：交换项计「弹药存量」，板压项计「弹药的目标
   * 定向」。系数 0.04：极端 10 板 × 12 步 ≈ ±4.8，与交换项同量级
   * 而不叠加过度。单边缺板时凸显（开局对称抵消）。 */
  if (!OFF_WP) {
    const pressMe = Math.min(myWalls, 10) * Math.min(opD, 12);
    const pressOp = Math.min(opWalls, 10) * Math.min(myD, 12);
    score += 0.04 * (pressMe - pressOp);
  }

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

/* ============ 无板终局精确竞速（v3） ============
 * 双方挡板耗尽后，胜负只余行棋与跳子。上面的 raceEval 以距离奇偶近似判胜，
 * 但忽略相邻跳子——直线对冲时行棋方一跳跨两格，奇偶立刻翻转：
 * 近距离对冲局面会被误判（距离 5:4 且对冲方行棋，近似判负、实胜）。
 * 此处以「仅推进着法」的受限搜索精确求解：
 * - 候选 = 一切使自身距离严格下降的合法着法。无墙时距离 = |y-终点|，
 *   故 y 严格单调推进；跳子含 -2 与斜跳边界着陆，天然包含。
 * - 横移/回撤（停滞着法）剪除：让先一步在无板竞速中从不获益
 *   （等距时停滞方立即输掉奇偶先手）。
 * - 两子纵向错开 ≥ 2 后永不再相邻（各自只朝目标推进），
 *   此时奇偶近似精确成立，直接 raceEval 收尾。
 * 节点上限保护：超限回退近似（罕见；分离判据把交互区限制在
 * 交叉前后数手，典型 < 1k 节点）。 */

const RACE_NODE_CAP = 24000;
let raceNodes = 0;

function raceSearch(c: Core, me: Player, ply: number, ctx: SearchCtx): number {
  raceNodes = 0;
  return raceRec(c, me, ply, -Infinity, Infinity, ctx);
}

function raceRec(c: Core, me: Player, ply: number, alpha: number, beta: number, ctx: SearchCtx): number {
  if (++raceNodes > RACE_NODE_CAP || ply >= MAX_PLY - 1) return raceEval(c, me, ply, ctx);
  const mover = ply % 2 === 0 ? me : opponent(me);
  /* 终局核验：上一手已抵终点 */
  const just = opponent(mover);
  const justPos = just === "A" ? c.posA : c.posB;
  if (justPos.y === goalRow(just, c.size)) {
    return just === me ? EVAL_WIN - ply + 1 : -(EVAL_WIN - ply + 1);
  }
  /* 本手可达终点（含跳子）：直捷判胜 */
  if (coreDist(c, mover) === 1 && canReachGoalNow(c, mover)) {
    return mover === me ? EVAL_WIN - ply - 1 : -(EVAL_WIN - ply - 1);
  }
  /* 纵向分离 ≥ 2：此后永不相遇，奇偶近似即精确 */
  if (Math.abs(c.posA.y - c.posB.y) >= 2) return raceEval(c, me, ply, ctx);

  const buf = goalDists(c);
  const N = c.size;
  const base = mover === "A" ? 0 : MAX_CELLS;
  const myD = coreDist(c, mover);
  const moves = coreLegalPawnMoves(c, mover);
  const cands: Array<{ to: Vec; drop: number }> = [];
  for (const to of moves) {
    const nd = buf[base + to.y * N + to.x];
    if (nd >= 0 && nd < myD) cands.push({ to, drop: myD - nd });
  }
  if (cands.length === 0) return raceEval(c, me, ply, ctx); /* 理论不达（防御） */
  cands.sort((a, b) => b.drop - a.drop);

  const isMax = mover === me;
  let best = isMax ? -Infinity : Infinity;
  for (const cd of cands) {
    const from = mover === "A" ? { x: c.posA.x, y: c.posA.y } : { x: c.posB.x, y: c.posB.y };
    applyPawnC(c, mover, cd.to);
    const val = raceRec(c, me, ply + 1, alpha, beta, ctx);
    undoPawnC(c, mover, from);
    if (isMax) {
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (best > EVAL_WIN / 2) break; /* 已见必胜：足够 */
    } else {
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (best < -EVAL_WIN / 2) break;
    }
    if (alpha >= beta) break;
  }
  return best;
}

/* ============ 墙威胁静止搜索（v4） ============
 * 地平线效应的最后一洞：depth 耗尽处旧版直接静态评估，但行棋方可能
 * 手握重击板（把对手距离 +3 以上）——静态分对此视而不见，导致领先方
 * 在地平线前一步「看不见即将到来的封锁」而误判安全。
 * 静止搜索只展开「威胁板」：封锁受害者当前最短路下降边的墙，经
 * probe 验证净增益 ≥1 且受害者增益 ≥2。棋子步是安静着法（±1），
 * 无需展开；墙是本游戏中的「吃子/将军」。
 *
 * 威胁枚举算法：沿受害者距离场做下降边 BFS（多路并集），每条
 * (u→w) 下降边恰可被两面墙封锁（锚点由边方向导出，见 edgeBlockedG
 * 约定）。锚点去重 + 冲突快检 + probe 增益筛选 → 威胁集合。
 * probe 走 gLo 键控的距离缓存：同一墙配置的重复 probe 为 O(1) 命中。 */

const QT_EDGE_CAP = 14; // 收录下降边上限（BFS 展开宽度）
const QT_WALL_CAP = 5; // 每节点展开威胁墙上限
const QT_QGAIN_MIN = 2; // 受害者增益阈值（净增 ≥2 步才算重击）
const QT_NET_MIN = 1; // 净增益阈值（受害者增益 − 自伤）
const QT_MARGIN = 4; // stand-pat 距窗口多远即免展开（典型重击板摆动 ≤4）
const QPLY_CAP = 5; // 静止递归深度（≈ 两轮半板交换）
const Q_D0_MAX = 15; // 受害者距离超此值时威胁稀疏，免枚举

const _qtVisited = new Uint8Array(MAX_CELLS);
const _qtQueueX = new Int16Array(MAX_CELLS);
const _qtQueueY = new Int16Array(MAX_CELLS);
const _qtAnchorX = new Int16Array(QT_EDGE_CAP * 2);
const _qtAnchorY = new Int16Array(QT_EDGE_CAP * 2);
const _qtAnchorO = new Uint8Array(QT_EDGE_CAP * 2);
const _qtSeen = new Uint16Array(WALL_CODE_SPACE); // 代际戳去重（免清零）
let _qtGen = 0;
/* 威胁墙输出（按 qply 分槽的结构数组，避免对象churn与重入踩踏） */
const _qtOutX = new Int16Array((QPLY_CAP + 1) * QT_WALL_CAP);
const _qtOutY = new Int16Array((QPLY_CAP + 1) * QT_WALL_CAP);
const _qtOutO = new Uint8Array((QPLY_CAP + 1) * QT_WALL_CAP);
const _qtOutG = new Int16Array((QPLY_CAP + 1) * QT_WALL_CAP);
const _qtOutC = new Int32Array((QPLY_CAP + 1) * QT_WALL_CAP);

/* 威胁墙枚举：行棋方 mover 封锁受害者（对手）路径的重击板集合。
 * 返回（写入 qply 槽的结构数组）：数量。按增益降序。 */
function qThreatWalls(c: Core, mover: Player, qply: number): number {
  const slot = qply * QT_WALL_CAP;
  const wallsLeft = mover === "A" ? c.wallsA : c.wallsB;
  if (wallsLeft <= 0 || qply > QPLY_CAP) return 0;
  const victim = opponent(mover);
  const buf = goalDists(c);
  const N = c.size;
  const W = N - 1;
  const base = victim === "A" ? 0 : MAX_CELLS;
  const vpos = victim === "A" ? c.posA : c.posB;
  const d0 = buf[base + vpos.y * N + vpos.x];
  if (d0 < 2 || d0 > Q_D0_MAX) return 0;
  const moverD0 = coreDist(c, mover);
  if (moverD0 < 0) return 0;

  /* 下降边 BFS（多路并集），导出可封锁锚点 */
  _qtVisited.fill(0, 0, N * N);
  let qh = 0;
  let qt = 0;
  _qtQueueX[qt] = vpos.x;
  _qtQueueY[qt] = vpos.y;
  qt++;
  _qtVisited[vpos.y * N + vpos.x] = 1;
  let nAnchors = 0;
  const cap = QT_EDGE_CAP * 2;
  const grids = { h: c.h, v: c.v };
  while (qh < qt && nAnchors < cap) {
    const ux = _qtQueueX[qh];
    const uy = _qtQueueY[qh];
    qh++;
    const du = buf[base + uy * N + ux];
    for (let k = 0; k < 4 && nAnchors < cap; k++) {
      const dx = k === 2 ? -1 : k === 3 ? 1 : 0;
      const dy = k === 0 ? -1 : k === 1 ? 1 : 0;
      const nx = ux + dx;
      const ny = uy + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      if (edgeBlockedG(grids, ux, uy, dx, dy)) continue;
      if (buf[base + ny * N + nx] !== du - 1) continue;
      /* u→w 下降边的两面封锁墙锚（edgeBlockedG 约定） */
      if (dy !== 0) {
        const ay = dy === -1 ? uy - 1 : uy;
        _qtAnchorX[nAnchors] = ux;
        _qtAnchorY[nAnchors] = ay;
        _qtAnchorO[nAnchors] = 0; /* h */
        nAnchors++;
        if (nAnchors >= cap) break;
        _qtAnchorX[nAnchors] = ux - 1;
        _qtAnchorY[nAnchors] = ay;
        _qtAnchorO[nAnchors] = 0;
        nAnchors++;
      } else {
        const ax = dx === 1 ? ux : ux - 1;
        _qtAnchorX[nAnchors] = ax;
        _qtAnchorY[nAnchors] = uy;
        _qtAnchorO[nAnchors] = 1; /* v */
        nAnchors++;
        if (nAnchors >= cap) break;
        _qtAnchorX[nAnchors] = ax;
        _qtAnchorY[nAnchors] = uy - 1;
        _qtAnchorO[nAnchors] = 1;
        nAnchors++;
      }
      if (!_qtVisited[ny * N + nx]) {
        _qtVisited[ny * N + nx] = 1;
        _qtQueueX[qt] = nx;
        _qtQueueY[qt] = ny;
        qt++;
      }
    }
  }

  /* 锚点 → 冲突快检 + 代际去重 + probe 增益筛选 */
  if (++_qtGen >= 65535) {
    _qtSeen.fill(0);
    _qtGen = 1;
  }
  let nOut = 0;
  for (let i = 0; i < nAnchors && nOut < QT_WALL_CAP; i++) {
    const ax = _qtAnchorX[i];
    const ay = _qtAnchorY[i];
    const ao = _qtAnchorO[i] === 0 ? "h" : "v";
    if (wallFits(c, ax, ay, ao)) continue;
    const code = wallCode(ax, ay, ao, N);
    if (_qtSeen[code] === _qtGen) continue;
    _qtSeen[code] = _qtGen;
    const wp = coreProbeWall(c, ax, ay, ao);
    if (wp.pathCut) continue; /* 断路墙非法 */
    const newVicD = victim === "A" ? wp.dA : wp.dB;
    const newMovD = mover === "A" ? wp.dA : wp.dB;
    const gain = newVicD - d0;
    const net = gain - (newMovD - moverD0);
    if (gain < QT_QGAIN_MIN || net < QT_NET_MIN) continue;
    /* 增益降序插入（≤5 项，插入排序） */
    let j = nOut;
    while (j > 0 && _qtOutG[slot + j - 1] < gain) {
      _qtOutX[slot + j] = _qtOutX[slot + j - 1];
      _qtOutY[slot + j] = _qtOutY[slot + j - 1];
      _qtOutO[slot + j] = _qtOutO[slot + j - 1];
      _qtOutG[slot + j] = _qtOutG[slot + j - 1];
      _qtOutC[slot + j] = _qtOutC[slot + j - 1];
      j--;
    }
    _qtOutX[slot + j] = ax;
    _qtOutY[slot + j] = ay;
    _qtOutO[slot + j] = ao === "h" ? 0 : 1;
    _qtOutG[slot + j] = gain;
    _qtOutC[slot + j] = code;
    nOut++;
  }
  return nOut;
}

/* 静止搜索：stand-pat + 仅威胁板展开。
 * 固定视角下的正确性：max 节点（我行棋）真值 ≥ stand（我总有安静步
 * 保底），stand ≥ beta 即剪；min 节点（对手行棋）真值 ≤ stand，
 * stand ≤ alpha 即剪。远离窗口（±QT_MARGIN）的节点免展开——典型
 * 重击板摆动 ≤4，追不回窗口差。 */
function qsearch(
  c: Core,
  ply: number,
  qply: number,
  alpha: number,
  beta: number,
  me: Player,
  ctx: SearchCtx,
): number {
  ctx.qnodes++;
  if ((ctx.qnodes & 127) === 0 && Date.now() > ctx.deadline) throw ABORT;
  const stand = evaluate(c, me, ply, ctx);
  if (OFF_QS || !ctx.params.qs || qply >= QPLY_CAP) return stand;
  const mover = ply % 2 === 0 ? me : opponent(me);
  /* 窗口检查前置：窗外节点（占叶子大多数）免去威胁枚举的 probe 开销 */
  if (mover === me) {
    if (stand >= beta) return stand;
    if (stand <= alpha - QT_MARGIN) return stand;
    const nT = qThreatWalls(c, mover, qply);
    if (nT === 0) return stand;
    const slot = qply * QT_WALL_CAP;
    let best = stand;
    for (let i = 0; i < nT; i++) {
      const wx = _qtOutX[slot + i];
      const wy = _qtOutY[slot + i];
      const wo = _qtOutO[slot + i] === 0 ? "h" : "v";
      const code = _qtOutC[slot + i];
      ctx.wallPly.push(ply);
      applyWallC(c, mover, wx, wy, wo);
      const v = qsearch(c, ply + 1, qply + 1, alpha, beta, me, ctx);
      undoWallC(c, mover, wx, wy, wo);
      ctx.wallPly.pop();
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        if (code < WALL_CODE_SPACE && ply < MAX_PLY) noteCutoff(ctx, ply, code, 1);
        break;
      }
    }
    return best;
  }
  if (stand <= alpha) return stand;
  if (stand >= beta + QT_MARGIN) return stand;
  const nT = qThreatWalls(c, mover, qply);
  if (nT === 0) return stand;
  const slot = qply * QT_WALL_CAP;
  let best = stand;
  for (let i = 0; i < nT; i++) {
    const wx = _qtOutX[slot + i];
    const wy = _qtOutY[slot + i];
    const wo = _qtOutO[slot + i] === 0 ? "h" : "v";
    const code = _qtOutC[slot + i];
    ctx.wallPly.push(ply);
    applyWallC(c, mover, wx, wy, wo);
    const v = qsearch(c, ply + 1, qply + 1, alpha, beta, me, ctx);
    undoWallC(c, mover, wx, wy, wo);
    ctx.wallPly.pop();
    if (v < best) best = v;
    if (best < beta) beta = best;
    if (alpha >= beta) {
      if (code < WALL_CODE_SPACE && ply < MAX_PLY) noteCutoff(ctx, ply, code, 1);
      break;
    }
  }
  return best;
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
  if (ctx.tt.size > P_TT_CAP) ctx.tt.clear();
  const flag = score <= alphaOrig ? TT_UPPER : score >= beta ? TT_LOWER : TT_EXACT;
  ctx.tt.set(key, { hi: hi >>> 0, depth, score, flag, best: bestCode });
}

/* LMR 判定（v3）：晚序（idx ≥ 4）、深够（≥ 3）、非跳子、非 TT 推荐、
 * 非杀手、且行棋方距终点 > 2（竞速精度区不降深）→ 降 1 层。
 * 失败高时先全深零宽复核再开全窗，不漏战术。 */
function lmrR(
  c: Core,
  p: Player,
  ctx: SearchCtx,
  ply: number,
  idx: number,
  depth: number,
  code: number,
  ttBest: number,
  jump: boolean,
): number {
  if (idx < 5 || depth < 4 || jump || OFF_LMR) return 0;
  if (code === ttBest) return 0;
  if (ply < MAX_PLY && (ctx.killers[ply * 2] === code || ctx.killers[ply * 2 + 1] === code)) return 0;
  if (coreDist(c, p) <= 2) return 0;
  return 1;
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

  const mover0 = ply % 2 === 0 ? me : opponent(me);

  /* 终局核验（v3）：上一手行棋方已抵达终点，对局已结束——必须先于
   * 即胜检测：双方均差一步时，旧版会把「已赢下的一手」误判为输。 */
  const just = opponent(mover0);
  const justPos = just === "A" ? c.posA : c.posB;
  if (justPos.y === goalRow(just, c.size)) {
    return just === me ? EVAL_WIN - ply + 1 : -(EVAL_WIN - ply + 1);
  }

  /* 纯竞速终局（板尽）：受限精确搜索求解跳子几何（v3） */
  if (c.wallsA === 0 && c.wallsB === 0) return raceSearch(c, me, ply, ctx);

  /* 即胜检测：行棋方本手可达终点（考虑占位跳子/斜跳）——任意深度精确。
   * 距离场 O(1) 先筛（dist===1 是必要条件），极少数候选才做全着法核验。 */
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

  /* 空着剪枝（v4）：非 PV 窄窗、深 ≥3，且行棋方不在竞速精度区
   * （距终点 > 3、余板 ≥ 2）时，先让行棋方「弃权」搜一层缩深树——
   * 若弃权后仍達 beta（max 视角）/ ≤ alpha（min 视角），则真着法
   * 更不会更差，直接剪。Quoridor 无真空着，但「弃权 + 对手最佳
   * 回应」是行棋方局势的下界近似；竞速末段弃权即损失节奏
   * （zugzwang 风险），双重守卫规避。不连续空着。 */
  if (
    !OFF_NMP &&
    depth >= 3 &&
    !ctx.inNull &&
    beta - alpha < PVS_EPS * 8 &&
    Math.abs(beta) < EVAL_WIN / 2 &&
    coreDist(c, mover0) > 3 &&
    (mover0 === "A" ? c.wallsA : c.wallsB) >= 2
  ) {
    const R = depth >= 7 ? 3 : 2;
    c.hashLo = (c.hashLo ^ zSideLo) | 0;
    c.hashHi = (c.hashHi ^ zSideHi) | 0;
    ctx.inNull = true;
    let nv: number;
    if (mover0 === me) {
      nv = alphabeta(c, ply + 1, depth - 1 - R, beta - PVS_EPS, beta, me, ctx);
    } else {
      nv = alphabeta(c, ply + 1, depth - 1 - R, alpha, alpha + PVS_EPS, me, ctx);
    }
    ctx.inNull = false;
    c.hashLo = (c.hashLo ^ zSideLo) | 0;
    c.hashHi = (c.hashHi ^ zSideHi) | 0;
    if (mover0 === me ? nv >= beta : nv <= alpha) return nv;
  }

  /* 反向后手剪枝（v3）：浅层且静态分大幅越界时免展开（近终局精度区除外）。
   * 边际 5.5/层：一块重击板对路径差的摆动可达 4-8，窄边际会误剪
   * 对手的墙陷阱（消融实测：3.5/层时 L3 对 v2 胜率崩至 17%）。 */
  if (!OFF_RF && depth <= 2 && beta - alpha > PVS_EPS * 8 && coreDist(c, mover0) > 2) {
    const ev0 = evaluate(c, me, ply, ctx);
    const margin = 5.5 * depth + 1;
    if (mover0 === me) {
      if (ev0 - margin >= beta) return ev0;
    } else if (ev0 + margin <= alpha) {
      return ev0;
    }
  }

  if (depth <= 0) return qsearch(c, ply, 0, alpha, beta, me, ctx);

  const p = mover0;
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
    /* MAX 节点：首着全窗，其余零宽探针 + 按需重搜（PVS）；
     * 晚序安静着法降深试探（LMR），失败高即全深复核。 */
    let best = -Infinity;
    let bestCode = -1;
    let first = true;
    let idx = 0;
    for (const cand of cands) {
      const moveIdx = idx++;
      let val: number;
      if (cand.payload.type === "pawn") {
        const from = p === "A" ? { ...c.posA } : { ...c.posB };
        const jump = Math.abs(cand.payload.to.x - from.x) + Math.abs(cand.payload.to.y - from.y) >= 2;
        const R = lmrR(c, p, ctx, ply, moveIdx, depth, cand.code, ttBestCode, jump);
        applyPawnC(c, p, cand.payload.to);
        if (first) {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
          first = false;
        } else if (beta - alpha > PVS_EPS * 8) {
          const probe = alphabeta(c, ply + 1, depth - 1 - R, alpha, alpha + PVS_EPS, me, ctx);
          if (probe <= alpha) {
            undoPawnC(c, p, from);
            continue; // ≤ alpha：不可能是更优
          }
          if (R > 0) {
            const verify = alphabeta(c, ply + 1, depth - 1, alpha, alpha + PVS_EPS, me, ctx);
            if (verify <= alpha) {
              undoPawnC(c, p, from);
              continue;
            }
            val = verify;
          } else {
            val = probe;
          }
          if (val < beta) val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
        } else {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
        }
        undoPawnC(c, p, from);
      } else if (cand.payload.type === "wall") {
        const w = cand.payload.wall;
        /* 条件探针（v3.1）：危险板必探（断路判定精确化）；受害者距终点
         * ≤ 5 时也探（延展判据需新距离）。其余板拓扑上不可能断路、
         * 延展亦不可能（newOpD ≥ opD0 > 5）——直接免探，找回节点率
         * （无条件全探针实测把节点率压低 21%，L3 对 v2 胜率崩至 17%）。 */
        const opD0 = coreDist(c, opponent(p));
        const dangerous = wallDangerous(c, w.x, w.y, w.o);
        let wp: { dA: number; dB: number; pathCut: boolean } | null = null;
        if (dangerous || opD0 <= 5) {
          wp = coreProbeWall(c, w.x, w.y, w.o);
          if (wp.pathCut) continue;
        }
        const newOpD = wp ? (p === "A" ? wp.dB : wp.dA) : opD0;
        /* 战术延展（v3）：重击板（受害者净增 ≥ 2 且距终点 ≤ 5）不减深——
         * 但仅限预算早段（elapsed < 40%）：延展耗预算，晚段迭代反正会被
         * 中止，早段近似免费；消融实测无条件延展会把 L3 完成深度压低一整层。 */
        const early = Date.now() - ctx.start < ctx.params.budgetMs * 0.4;
        const extend = !OFF_EXT && early && ctx.exts < 2 && newOpD - opD0 >= 2 && newOpD <= 5;
        /* 板尾 LMR（v3.1）：晚序（idx ≥ 10）、深够（≥ 5）、低分（远离
         * 对手路径、无杀手/历史加分）的板降 1 层，失败高即全深零宽复核。 */
        const isKiller =
          ply < MAX_PLY && (ctx.killers[ply * 2] === cand.code || ctx.killers[ply * 2 + 1] === cand.code);
        const rw =
          !OFF_RW &&
          !extend &&
          moveIdx >= 10 &&
          depth >= 5 &&
          cand.code !== ttBestCode &&
          !isKiller &&
          cand.score < 20
            ? 1
            : 0;
        const nd = depth - (extend ? 0 : 1) - rw;
        const ndFull = depth - (extend ? 0 : 1);
        ctx.wallPly.push(ply);
        applyWallC(c, p, w.x, w.y, w.o);
        if (extend) ctx.exts++;
        if (first) {
          val = alphabeta(c, ply + 1, nd, alpha, beta, me, ctx);
          first = false;
        } else if (beta - alpha > PVS_EPS * 8) {
          const probe = alphabeta(c, ply + 1, nd, alpha, alpha + PVS_EPS, me, ctx);
          if (probe <= alpha) {
            if (extend) ctx.exts--;
            undoWallC(c, p, w.x, w.y, w.o);
            ctx.wallPly.pop();
            continue;
          }
          if (rw > 0) {
            const verify = alphabeta(c, ply + 1, ndFull, alpha, alpha + PVS_EPS, me, ctx);
            if (verify <= alpha) {
              if (extend) ctx.exts--;
              undoWallC(c, p, w.x, w.y, w.o);
              ctx.wallPly.pop();
              continue;
            }
            val = verify;
          } else {
            val = probe;
          }
          if (val < beta) val = alphabeta(c, ply + 1, ndFull, alpha, beta, me, ctx);
        } else {
          val = alphabeta(c, ply + 1, nd, alpha, beta, me, ctx);
        }
        if (extend) ctx.exts--;
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
    /* MIN 节点：PVS 镜像（零宽窗围绕 beta）+ LMR */
    let best = Infinity;
    let bestCode = -1;
    let first = true;
    let idx = 0;
    for (const cand of cands) {
      const moveIdx = idx++;
      let val: number;
      if (cand.payload.type === "pawn") {
        const from = p === "A" ? { ...c.posA } : { ...c.posB };
        const jump = Math.abs(cand.payload.to.x - from.x) + Math.abs(cand.payload.to.y - from.y) >= 2;
        const R = lmrR(c, p, ctx, ply, moveIdx, depth, cand.code, ttBestCode, jump);
        applyPawnC(c, p, cand.payload.to);
        if (first) {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
          first = false;
        } else if (beta - alpha > PVS_EPS * 8) {
          const probe = alphabeta(c, ply + 1, depth - 1 - R, beta - PVS_EPS, beta, me, ctx);
          if (probe >= beta) {
            undoPawnC(c, p, from);
            continue; // ≥ beta 于 min 无益
          }
          if (R > 0) {
            const verify = alphabeta(c, ply + 1, depth - 1, beta - PVS_EPS, beta, me, ctx);
            if (verify >= beta) {
              undoPawnC(c, p, from);
              continue;
            }
            val = verify;
          } else {
            val = probe;
          }
          if (val > alpha) val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
        } else {
          val = alphabeta(c, ply + 1, depth - 1, alpha, beta, me, ctx);
        }
        undoPawnC(c, p, from);
      } else if (cand.payload.type === "wall") {
        const w = cand.payload.wall;
        const opD0 = coreDist(c, opponent(p));
        const dangerous = wallDangerous(c, w.x, w.y, w.o);
        let wp: { dA: number; dB: number; pathCut: boolean } | null = null;
        if (dangerous || opD0 <= 5) {
          wp = coreProbeWall(c, w.x, w.y, w.o);
          if (wp.pathCut) continue;
        }
        const newOpD = wp ? (p === "A" ? wp.dB : wp.dA) : opD0;
        const early = Date.now() - ctx.start < ctx.params.budgetMs * 0.4;
        const extend = !OFF_EXT && early && ctx.exts < 2 && newOpD - opD0 >= 2 && newOpD <= 5;
        const isKiller =
          ply < MAX_PLY && (ctx.killers[ply * 2] === cand.code || ctx.killers[ply * 2 + 1] === cand.code);
        const rw =
          !OFF_RW &&
          !extend &&
          moveIdx >= 10 &&
          depth >= 5 &&
          cand.code !== ttBestCode &&
          !isKiller &&
          cand.score < 20
            ? 1
            : 0;
        const nd = depth - (extend ? 0 : 1) - rw;
        const ndFull = depth - (extend ? 0 : 1);
        ctx.wallPly.push(ply);
        applyWallC(c, p, w.x, w.y, w.o);
        if (extend) ctx.exts++;
        if (first) {
          val = alphabeta(c, ply + 1, nd, alpha, beta, me, ctx);
          first = false;
        } else if (beta - alpha > PVS_EPS * 8) {
          const probe = alphabeta(c, ply + 1, nd, beta - PVS_EPS, beta, me, ctx);
          if (probe >= beta) {
            if (extend) ctx.exts--;
            undoWallC(c, p, w.x, w.y, w.o);
            ctx.wallPly.pop();
            continue;
          }
          if (rw > 0) {
            const verify = alphabeta(c, ply + 1, ndFull, beta - PVS_EPS, beta, me, ctx);
            if (verify >= beta) {
              if (extend) ctx.exts--;
              undoWallC(c, p, w.x, w.y, w.o);
              ctx.wallPly.pop();
              continue;
            }
            val = verify;
          } else {
            val = probe;
          }
          if (val > alpha) val = alphabeta(c, ply + 1, ndFull, alpha, beta, me, ctx);
        } else {
          val = alphabeta(c, ply + 1, nd, alpha, beta, me, ctx);
        }
        if (extend) ctx.exts--;
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

const ASP_DELTA = 3.5; // 根期望窗口半宽（路径差 ±3.5 内的波动由窄窗覆盖）

function searchMove(
  state: GameState,
  params: LevelParams,
  rootPick?: { mod: number; rem: number },
  report?: (depth: number, payload: MovePayload, score: number) => void,
): { payload: MovePayload; score: number } | null {
  const me = state.turn;
  const c = toCore(state);
  const ctx: SearchCtx = {
    tt: OFF_PTT ? new Map() : P_TT, /* v3：跨回合持久置换表（可消融退回每回合新建） */
    killers: new Int32Array(MAX_PLY * 2),
    history: new Float64Array(WALL_CODE_SPACE),
    deadline: Date.now() + params.budgetMs,
    start: Date.now(),
    nodes: 0,
    qnodes: 0,
    inNull: false,
    params,
    wallPly: [],
    exts: 0,
  };

  let cands = genCandidates(c, me, ctx, 0, true, params.rootWallLimit);
  if (cands.length === 0) return null;

  /* 持久置换表的根推荐：上一手搜索多半已展开过本局面，其最佳着法最值得先搜 */
  {
    const re = P_TT.get(c.hashLo >>> 0);
    if (re && re.hi === (c.hashHi >>> 0)) {
      const i = cands.findIndex((cd) => cd.code === re.best);
      if (i > 0) {
        const pick = cands[i];
        cands.splice(i, 1);
        cands.unshift(pick);
      }
    }
  }

  /* 并行根分裂（v3）：按交织切片保留本 worker 负责的根候选。
   * 切片在启发式排序 + TT 推荐之后进行——各 worker 确定性同序，
   * 互不重叠且扢满全候选集；每个候选被搜索的深度远深于串行。 */
  if (rootPick && rootPick.mod > 1) {
    cands = cands.filter((_, i) => i % rootPick.mod === rootPick.rem);
    if (cands.length === 0) return null;
  }

  let bestPayload: MovePayload = cands[0].payload;
  let bestScore = -Infinity;
  let completedDepth = 0;
  let prevScore = -Infinity;

  /* 根扫描：给定 alpha 下界跑一轮全候选（beta = ∞）。
   * 每轮开始重置延展配额与放板层栈——上轮若被中止，异常展开会
   * 跳过逐帧清理（exts--/wallPly.pop/undo），在此处集中归零。 */
  const rootScan = (
    depth: number,
    alphaStart: number,
  ): { localBest: MovePayload | null; localScore: number; searched: number; aborted: boolean } => {
    ctx.exts = 0;
    ctx.wallPly.length = 0;
    ctx.inNull = false; /* 异常展开防御：ABORT 跳过清理时集中归零 */
    let localBest: MovePayload | null = null;
    let localScore = -Infinity;
    let alpha = alphaStart;
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
        return { localBest, localScore, searched, aborted: true };
      }
      throw e;
    }
    return { localBest, localScore, searched, aborted: false };
  };

  for (let depth = 2; depth <= params.maxDepth; depth++) {
    /* 迭代加深：按上一轮各着法分值全量重排（上轮最优自然居首） */
    cands.sort((a, b) => b.score - a.score);
    /* 期望窗口（v3）：以上一轮完成分设 alpha 下界收窄子树窗口；
     * 全体失败低（罕见）则放宽重搜，保证强度无损。 */
    const useAsp = !OFF_ASP && depth >= 3 && Number.isFinite(prevScore);
    const aspAlpha = useAsp ? prevScore - ASP_DELTA : -Infinity;
    let r = rootScan(depth, aspAlpha);
    if (!r.aborted && useAsp && r.searched > 0 && r.localScore <= aspAlpha) {
      r = rootScan(depth, -Infinity);
    }
    if (r.aborted) {
      /* 深度未完成：仅首层（depth 2）采信部分结果 */
      if (depth === 2 && r.searched > 0 && r.localBest) {
        bestPayload = r.localBest;
        bestScore = r.localScore;
      }
      break;
    }
    if (r.localBest) {
      bestPayload = r.localBest;
      bestScore = r.localScore;
      completedDepth = depth;
      prevScore = r.localScore;
      /* 根分裂同步汇报：每层完成即上报，主线程按「全席公共深度」聚合 */
      if (report) report(depth, bestPayload, bestScore);
    }
    if (bestScore > EVAL_WIN / 2) {
      if (AI_DEBUG) console.log(`[ai] 早停必胜 depth=${depth} score=${bestScore.toFixed(1)} nodes=${ctx.nodes} move=${JSON.stringify(bestPayload)}`);
      break; // 已见必胜
    }
    const elapsed = Date.now() - ctx.start;
    if (elapsed > params.budgetMs) break;
    /* 时间外推：下一层开销约 3-4 倍，过半即收笔 */
    if (elapsed > params.budgetMs * 0.55) break;
  }

  _lastStats.nodes = ctx.nodes;
  _lastStats.ttSize = ctx.tt.size;
  _lastStats.elapsedMs = Date.now() - ctx.start;
  _lastStats.depth = completedDepth;
  _lastStats.qnodes = ctx.qnodes;
  /* 分数截断为有限值：结构化克隆可传 Infinity，但聚合比较更稳妥 */
  return { payload: bestPayload, score: Number.isFinite(bestScore) ? bestScore : -1e9 };
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

export function computeAiMove(
  state: GameState,
  level: AiLevel,
  opts?: {
    budgetMs?: number;
    rootPick?: { mod: number; rem: number };
    /** 每完成一层迭代加深即回调（根分裂并行的同步汇报通道） */
    report?: (depth: number, payload: MovePayload, score: number) => void;
  },
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
        score: EVAL_WIN - 1, /* 并行聚合端据此立即采用（不走同深度门控） */
      };
    }
    if (level === 1) return apprenticeMove(s);

    const params = levelParams(level, N);
    const cap = opts?.budgetMs;
    const effective = cap != null ? Math.min(params.budgetMs, cap) : params.budgetMs;
    const found = searchMove(s, { ...params, budgetMs: effective }, opts?.rootPick, opts?.report);
    if (found) {
      const label =
        found.payload.type === "wall" ? WALL_LABEL[level] : PAWN_LABEL[level];
      return { payload: found.payload, label, score: found.score };
    }
    return fallbackDecision(s, me);
  } catch (e) {
    console.error("AI 计算异常，使用兜底", e);
    return fallbackDecision(s, s.turn);
  }
}

/* 供测试与调试：上一次搜索的规模统计 */
const _lastStats = { nodes: 0, ttSize: 0, depth: 0, elapsedMs: 0, qnodes: 0, dcHits: 0, dcMisses: 0 };
export function lastSearchStats() {
  return { ..._lastStats, dcHits, dcMisses };
}
