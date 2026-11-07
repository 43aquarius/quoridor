/* 步步为营 —— 四人围坐 AI v2.6：偏执联盟搜索（Paranoid Coalition Search）
 *
 * 【与二人局算法的根本分野】（用户需求：四人/二人算法不同）
 * 二人局（ai.ts）是标准零和双人博弈 → Negamax + PVS 精确极大极小。
 * 四人局是「单胜者」多方博弈：任一席率先抵线即终局，对我而言
 * 「我不赢 = 我输」——其余三家无论谁赢，结果对我等价。
 * 因此以博弈论偏执模型（Sturtevant & Korf, Paranoid Search）为骨架：
 * 局面归约为「我 vs 联盟」的极大极小——我的节点取 max，对手节点取
 * min（对我视角分）——α-β/置换表/杀手启发全套武器得以复用。
 *
 * v2.0→v2.6 的四轮实战校准（每轮都有对局数据，教训弥足珍贵）：
 *   v2.0 纯偏执：三家墙永远瞄准我 → 过度悲观 → 胜势踱步不前。
 *   v2.1 现实主义过滤（伤我<2 的板不纳入联盟）→ 乐观幻觉：引擎误判
 *        必胜后被 +1 小板「慢炖围死」（四人局真实杀招恰恰是小火慢炖）。
 *   v2.5 拦威胁者：联盟墙瞄准「距离最近的席位」而非永远是我——
 *        我领先时照旧被围剿（真实的领先税），我不领先时对手互拦，
 *        幻影围剿消失。
 *   v2.6 学徒同款板纪律：四人局「追赶态拼命放板」就是强（学徒板海
 *        对各代搜索策略 5:3 / 13:3 / 6:2 碾压的实测定论）——追赶态
 *        （领先者 ≤3 步或我落后 ≥2）每手可放、minGain 1、自伤容忍
 *        1-2；平先/领先隔手放、minGain 2、零自伤。搜索选「哪块板」，
 *        纪律管「放不放」。
 *
 * 评估（我的视角标量分）为四人特化：
 *   领先者差距（主项 1.0）+ 次威胁 0.4 / 三威胁 0.2 加权 + 板弹
 *   经济学（余板边际价值凸性：前两块 0.3/板、其余 0.1/板；三家板
 *   合计 0.05/板计围剿压力）+ 路径分岔自由度 + 死巷惩罚 + 轮转先手。
 *
 * 档位（v2.7 提档：L3 2200→2800ms / 7→8 层、L4 4200→5800ms / 9→11 层；
 *   L2 维持 v2.6 校准值 5 层 / 800ms——实测 1100ms / 6 层反而阶梯 0/12
 *   出场：四人局 L2 的强度来自「板纪律 + 浅搜」的配比，加深后搜索
 *   偏离板纪律工作点反而更弱）：
 *   1 学徒：保留 v1 启发式人设（最短路捡字 + 拦临门道的随手板）
 *   2 排字师：偏执搜索（深度 5 / 800ms）——看得破一轮交换
 *   3 总编：偏执搜索（深度 8 / 2800ms）+ 宽候选窗
 *   4 社长：偏执搜索全开（深度 11 / 5800ms）
 *   阶梯实测（9×9×5 围桌 12 局 × 2 轮）：L1 0-2 / L2 1-2 / L3 3-5 /
 *   L4 5-6 胜——单调且社长过半；对 legacy 同席基准：L4 58% vs 其 8%。
 *
 * 工程要点（继承二人局 v3-v7 的成熟件，四人化重制）：
 *   - Core4 do/undo + 增量 Zobrist（四子/墙/四余板/轮转位/出局掩码/尺寸盐）
 *   - 四向目标距离场直映射缓存（键=墙配置哈希；甲顶行/乙底行/丙右列/丁左列）
 *   - 墙候选探针：放板→四席距离→还原；任一在场席位断路即弃
 *   - PVS 零宽探针 + LMR 晚序板降深（失败高全深复核）
 *   - 置换表（跨回合持久）+ 杀手/历史启发 + 迭代加深 + 时间外推早停
 *   - 自卫十字伴板：沿自家最短路推导「会拦我的板」的同锚异向板——
 *     先占位即废掉对手的拦道板（被慢炖围死的主要解法）
 *   - 联盟节点候选窗随「我对联盟的威胁度」自适应收窄（我远离终点时
 *     对手无需围剿我，联盟节点退化为纯推进——树体积大减）
 */

import type { AiLevel, GameState, MovePayload, Orientation, Player, Vec, AiDecision, Wall } from "./types";
import { hasWonCell } from "./types";
import {
  activePlayers,
  bfsDistanceToGoal,
  boardSize,
  buildWallGrids,
  checkWall,
  isEliminated,
  legalPawnMoves,
  pawnOf,
  wallsLeftOf,
} from "./engine";
import { computeAiMove4Legacy } from "./ai4-legacy";

/* —— 语气标签（与二人版同族） —— */
const WALL_LABEL: Record<AiLevel, string> = {
  1: "学徒随手排了一根铅条",
  2: "排字师延长了领先者的归途",
  3: "总编落下一道围桌版式",
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

/* ============ 席位编码 ============
 * 内部用 0..3：甲0 乙1 丙2 丁3；行棋顺位（顺时针）甲→丙→乙→丁。 */
const SEAT_IDX: Record<Player, number> = { A: 0, B: 1, C: 2, D: 3 };
const SEAT_LETTER: Player[] = ["A", "B", "C", "D"];
/* 顺时针下一位：甲→丙→乙→丁→甲 */
const NEXT_SEAT = [2, 3, 1, 0];

const MAX_CELLS = 169;
const MAX_ANCHORS = 144;
const MAX_WALL_COUNT = 21;
const WALL_CODE_SPACE = 288;
const PAWN_CODE_BASE = 0x100000;
const MAX_PLY4 = 26;
const EVAL4_WIN = 100000;
const PVS4_EPS = 1e-6;

/* 测试辅助（Node 脚本用） */
const ENV4 = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
const ENV4_DEPTH = ENV4.QUORIDOR_AI4_DEPTH ? Number(ENV4.QUORIDOR_AI4_DEPTH) : null;
/* 消融：NOWALL=1 根节点不放任何板（纯竞速对照）；ONLYGAIN=n 放板增益门槛覆写 */
const ENV4_NOWALL = !!ENV4.QUORIDOR_AI4_NOWALL;
const ENV4_ONLYGAIN = ENV4.QUORIDOR_AI4_ONLYGAIN ? Number(ENV4.QUORIDOR_AI4_ONLYGAIN) : null;

/* ============ 档位参数 ============ */

interface Params4 {
  budgetMs: number;
  maxDepth: number;
  rootWall: number; // 根节点（我的）挡板候选上限
  innerWall: number; // 内层我的节点挡板候选上限
  coalWall: number; // 联盟节点（对手的）挡板候选上限
}

function params4(level: AiLevel, size: number): Params4 {
  const sizeScale = size <= 5 ? 0.55 : size === 7 ? 0.8 : size === 9 ? 1 : size === 11 ? 1.2 : 1.5;
  if (level === 2) {
    return {
      budgetMs: Math.round(800 * sizeScale), /* v2.6 校准值回滚：1100/6 层实测阶梯 0/12 出场——
       * 四人局 L2 的强度来自「学徒同款板纪律 + 浅搜」，加深后搜索
       * 偏离板纪律工作点反而更弱（追赶态板海才是四人局胜负手） */
      maxDepth: ENV4_DEPTH ?? 5,
      rootWall: 14,
      innerWall: 10,
      coalWall: 8,
    };
  }
  if (level === 3) {
    return {
      budgetMs: Math.round(2800 * sizeScale), /* v8：2200→2800 */
      maxDepth: ENV4_DEPTH ?? 8, /* v8：7→8 */
      rootWall: 18,
      innerWall: 12,
      coalWall: 10,
    };
  }
  return {
    budgetMs: Math.round(5800 * sizeScale), /* v8：4200→5800 */
    maxDepth: ENV4_DEPTH ?? 11, /* v8：9→11 */
    rootWall: 22,
    innerWall: 14,
    coalWall: 12,
  };
}

/* ============ Core4 与 Zobrist ============ */

interface Core4 {
  size: number;
  h: Uint8Array;
  v: Uint8Array;
  px: Int32Array; // 四席棋子 x
  py: Int32Array; // 四席棋子 y
  walls: Int32Array; // 四席余板
  elim: number; // 出局掩码 bit<<seat
  turn: number; // 当前行棋席位 0..3
  hashLo: number;
  hashHi: number;
  gLo: number; // 墙配置哈希（距离缓存键）
  gHi: number;
}

function makeRng4(seed: number): () => number {
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

/* 四人专用键表（与二人局 ai.ts 不同种子，防两套缓存互撞） */
const rng4 = makeRng4(0x9e3779b9);
const z4PawnLo: Int32Array[] = [];
const z4PawnHi: Int32Array[] = [];
const z4WallHLo = new Int32Array(MAX_ANCHORS);
const z4WallHHi = new Int32Array(MAX_ANCHORS);
const z4WallVLo = new Int32Array(MAX_ANCHORS);
const z4WallVHi = new Int32Array(MAX_ANCHORS);
const z4WallsLo: Int32Array[] = [];
const z4WallsHi: Int32Array[] = [];
const z4TurnLo = new Int32Array(4);
const z4TurnHi = new Int32Array(4);
const z4ElimLo = new Int32Array(16);
const z4ElimHi = new Int32Array(16);
const z4SizeLo = new Int32Array(16);
const z4SizeHi = new Int32Array(16);
(function initZobrist4() {
  for (let s = 0; s < 4; s++) {
    const plo = new Int32Array(MAX_CELLS);
    const phi = new Int32Array(MAX_CELLS);
    for (let i = 0; i < MAX_CELLS; i++) {
      plo[i] = rng4();
      phi[i] = rng4();
    }
    z4PawnLo.push(plo);
    z4PawnHi.push(phi);
    const wlo = new Int32Array(MAX_WALL_COUNT + 2);
    const whi = new Int32Array(MAX_WALL_COUNT + 2);
    for (let i = 0; i <= MAX_WALL_COUNT + 1; i++) {
      wlo[i] = rng4();
      whi[i] = rng4();
    }
    z4WallsLo.push(wlo);
    z4WallsHi.push(whi);
  }
  for (let i = 0; i < MAX_ANCHORS; i++) {
    z4WallHLo[i] = rng4();
    z4WallHHi[i] = rng4();
    z4WallVLo[i] = rng4();
    z4WallVHi[i] = rng4();
  }
  for (let i = 0; i < 4; i++) {
    z4TurnLo[i] = rng4();
    z4TurnHi[i] = rng4();
  }
  for (let i = 0; i < 16; i++) {
    z4ElimLo[i] = rng4();
    z4ElimHi[i] = rng4();
  }
  for (let i = 0; i < 16; i++) {
    z4SizeLo[i] = rng4();
    z4SizeHi[i] = rng4();
  }
})();

/* ============ do/undo 哈希自检（QUORIDOR_AI4_HASH_DEBUG=1 时启用） ============
 * 重算全哈希与增量维护值比对——开发期抓 do/undo 不对称缺陷。 */
const AI4_HASH_DEBUG = !!ENV4.QUORIDOR_AI4_HASH_DEBUG;

function fullHash4(c: Core4): { lo: number; hi: number; gLo: number; gHi: number } {
  const size = c.size;
  const W = size - 1;
  let lo = z4SizeLo[size];
  let hi = z4SizeHi[size];
  let glo = z4SizeLo[size];
  let ghi = z4SizeHi[size];
  for (let s = 0; s < 4; s++) {
    const idx = c.py[s] * size + c.px[s];
    lo ^= z4PawnLo[s][idx];
    hi ^= z4PawnHi[s][idx];
    const w = c.walls[s];
    lo ^= z4WallsLo[s][w];
    hi ^= z4WallsHi[s][w];
  }
  for (let i = 0; i < W * W; i++) {
    if (c.h[i]) {
      lo ^= z4WallHLo[i];
      hi ^= z4WallHHi[i];
      glo ^= z4WallHLo[i];
      ghi ^= z4WallHHi[i];
    }
    if (c.v[i]) {
      lo ^= z4WallVLo[i];
      hi ^= z4WallVHi[i];
      glo ^= z4WallVLo[i];
      ghi ^= z4WallVHi[i];
    }
  }
  lo ^= z4ElimLo[c.elim];
  hi ^= z4ElimHi[c.elim];
  lo ^= z4TurnLo[c.turn];
  hi ^= z4TurnHi[c.turn];
  return { lo: lo | 0, hi: hi | 0, gLo: glo | 0, gHi: ghi | 0 };
}

function hashCheck4(c: Core4, where: string) {
  if (!AI4_HASH_DEBUG) return;
  const f = fullHash4(c);
  if (f.lo !== c.hashLo || f.hi !== c.hashHi || f.gLo !== c.gLo || f.gHi !== c.gHi) {
    console.error(
      `[ai4] HASH MISMATCH at ${where}: stored (${c.hashLo},${c.hashHi},${c.gLo},${c.gHi}) actual (${f.lo},${f.hi},${f.gLo},${f.gHi})`,
    );
    throw new Error("ai4 hash mismatch");
  }
}

function toCore4(state: GameState): Core4 {
  const size = boardSize(state);
  const g = buildWallGrids(state.walls, size);
  const W = size - 1;
  let lo = z4SizeLo[size];
  let hi = z4SizeHi[size];
  let glo = z4SizeLo[size];
  let ghi = z4SizeHi[size];
  const px = new Int32Array(4);
  const py = new Int32Array(4);
  const walls = new Int32Array(4);
  for (let s = 0; s < 4; s++) {
    const p = pawnOf(state, SEAT_LETTER[s]);
    px[s] = p.x;
    py[s] = p.y;
    const idx = p.y * size + p.x;
    lo ^= z4PawnLo[s][idx];
    hi ^= z4PawnHi[s][idx];
    const w = Math.min(Math.max(wallsLeftOf(state, SEAT_LETTER[s]), 0), MAX_WALL_COUNT);
    walls[s] = w;
    lo ^= z4WallsLo[s][w];
    hi ^= z4WallsHi[s][w];
  }
  for (let i = 0; i < W * W; i++) {
    if (g.h[i]) {
      lo ^= z4WallHLo[i];
      hi ^= z4WallHHi[i];
      glo ^= z4WallHLo[i];
      ghi ^= z4WallHHi[i];
    }
    if (g.v[i]) {
      lo ^= z4WallVLo[i];
      hi ^= z4WallVHi[i];
      glo ^= z4WallVLo[i];
      ghi ^= z4WallVHi[i];
    }
  }
  let elim = 0;
  for (const p of state.eliminated ?? []) elim |= 1 << SEAT_IDX[p];
  lo ^= z4ElimLo[elim];
  hi ^= z4ElimHi[elim];
  const turn = SEAT_IDX[state.turn];
  lo ^= z4TurnLo[turn];
  hi ^= z4TurnHi[turn];
  return {
    size,
    h: g.h,
    v: g.v,
    px,
    py,
    walls,
    elim,
    turn,
    hashLo: lo | 0,
    hashHi: hi | 0,
    gLo: glo | 0,
    gHi: ghi | 0,
  };
}

/* ============ 四向目标距离场缓存 ============
 * 键 =（墙配置 + 尺寸盐）哈希；值 = Int16Array(4×169)：
 * 席 s 的场在 s*169 + y*N + x。只依赖墙配置，do/undo 下同一配置全命中。 */
const DC4_BITS = 14;
const DC4_SIZE = 1 << DC4_BITS; // 16384 槽 × 676 shorts ≈ 22MB
const DC4_MASK = DC4_SIZE - 1;
const dc4KeyLo = new Int32Array(DC4_SIZE);
const dc4KeyHi = new Int32Array(DC4_SIZE);
const dc4Used = new Uint8Array(DC4_SIZE);
const dc4Data: (Int16Array | null)[] = new Array(DC4_SIZE).fill(null);
let dc4Hits = 0;
let dc4Misses = 0;

const _gd4Queue = new Int32Array(MAX_CELLS);

/* 单席位多源 BFS（甲顶行 / 乙底行 / 丙右列 / 丁左列） */
function gd4Field(c: Core4, buf: Int16Array, seat: number) {
  const N = c.size;
  const base = seat * MAX_CELLS;
  const grids = { h: c.h, v: c.v };
  let head = 0;
  let tail = 0;
  if (seat === 0 || seat === 1) {
    const gy = seat === 0 ? 0 : N - 1;
    for (let x = 0; x < N; x++) {
      buf[base + gy * N + x] = 0;
      _gd4Queue[tail++] = gy * N + x;
    }
  } else {
    const gx = seat === 2 ? N - 1 : 0;
    for (let y = 0; y < N; y++) {
      buf[base + y * N + gx] = 0;
      _gd4Queue[tail++] = y * N + gx;
    }
  }
  while (head < tail) {
    const cur = _gd4Queue[head++];
    const cx = cur % N;
    const cy = (cur - cx) / N;
    const d = buf[base + cur];
    for (let k = 0; k < 4; k++) {
      const dx = k === 2 ? -1 : k === 3 ? 1 : 0;
      const dy = k === 0 ? -1 : k === 1 ? 1 : 0;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (edgeBlockedG4(grids, cx, cy, dx, dy)) continue;
      const ni = base + ny * N + nx;
      if (buf[ni] !== -1) continue;
      buf[ni] = d + 1;
      _gd4Queue[tail++] = ny * N + nx;
    }
  }
}

function goalDists4(c: Core4): Int16Array {
  const slot = (c.gLo >>> 0) & DC4_MASK;
  if (dc4Used[slot] && dc4KeyLo[slot] === c.gLo && dc4KeyHi[slot] === c.gHi) {
    dc4Hits++;
    return dc4Data[slot]!;
  }
  dc4Misses++;
  let buf = dc4Data[slot];
  if (!buf) {
    buf = new Int16Array(MAX_CELLS * 4);
    dc4Data[slot] = buf;
  }
  buf.fill(-1, 0, MAX_CELLS * 4);
  const N = c.size;
  const NN = N * N;
  for (let s = 0; s < 4; s++) buf.fill(-1, s * MAX_CELLS, s * MAX_CELLS + NN);
  for (let s = 0; s < 4; s++) gd4Field(c, buf, s);
  dc4Used[slot] = 1;
  dc4KeyLo[slot] = c.gLo;
  dc4KeyHi[slot] = c.gHi;
  return buf;
}

/* —— 引擎 edgeBlockedG 的本地内联（步长 W=N-1，行为一致） —— */
function edgeBlockedG4(g: { h: Uint8Array; v: Uint8Array }, x: number, y: number, dx: number, dy: number): boolean {
  const W = g.h.length ? Math.round(Math.sqrt(g.h.length)) : 8;
  const last = W - 1;
  if (dy === -1) {
    return !!((x <= last && g.h[(y - 1) * W + x]) || (x > 0 && g.h[(y - 1) * W + x - 1]));
  }
  if (dy === 1) {
    return !!((x <= last && g.h[y * W + x]) || (x > 0 && g.h[y * W + x - 1]));
  }
  if (dx === 1) {
    return !!((y <= last && g.v[y * W + x]) || (y > 0 && g.v[(y - 1) * W + x]));
  }
  if (dx === -1) {
    return !!((y <= last && g.v[y * W + x - 1]) || (y > 0 && g.v[(y - 1) * W + x - 1]));
  }
  return false;
}

function dist4(buf: Int16Array, seat: number, x: number, y: number, N: number): number {
  return buf[seat * MAX_CELLS + y * N + x];
}

/* 墙探针：放板 → 四席新距离（写共享 _pw4）→ 还原。
 * 返回 false = 有在场席位断路（非法）；true = 合法。 */
const _pw4 = new Int32Array(4);
function probeWall4(c: Core4, x: number, y: number, o: Orientation): boolean {
  const W = c.size - 1;
  const idx = y * W + x;
  const grid = o === "h" ? c.h : c.v;
  const was = grid[idx];
  const zlo = o === "h" ? z4WallHLo[idx] : z4WallVLo[idx];
  const zhi = o === "h" ? z4WallHHi[idx] : z4WallVHi[idx];
  grid[idx] = 1;
  c.gLo = (c.gLo ^ zlo) | 0;
  c.gHi = (c.gHi ^ zhi) | 0;
  const buf = goalDists4(c);
  const N = c.size;
  let ok = true;
  for (let s = 0; s < 4; s++) {
    const d = buf[s * MAX_CELLS + c.py[s] * N + c.px[s]];
    _pw4[s] = d;
    if (d < 0 && !(c.elim & (1 << s))) ok = false;
  }
  grid[idx] = was;
  c.gLo = (c.gLo ^ zlo) | 0;
  c.gHi = (c.gHi ^ zhi) | 0;
  return ok;
}

/* ============ do / undo ============ */

function nextActiveSeat(c: Core4, from: number): number {
  let s = NEXT_SEAT[from];
  for (let k = 0; k < 4; k++) {
    if (!(c.elim & (1 << s))) return s;
    s = NEXT_SEAT[s];
  }
  return from;
}

function applyPawn4(c: Core4, seat: number, toX: number, toY: number) {
  const N = c.size;
  const fi = c.py[seat] * N + c.px[seat];
  const ti = toY * N + toX;
  const nt = nextActiveSeat(c, seat);
  c.hashLo = (c.hashLo ^ z4PawnLo[seat][fi] ^ z4PawnLo[seat][ti] ^ z4TurnLo[c.turn] ^ z4TurnLo[nt]) | 0;
  c.hashHi = (c.hashHi ^ z4PawnHi[seat][fi] ^ z4PawnHi[seat][ti] ^ z4TurnHi[c.turn] ^ z4TurnHi[nt]) | 0;
  c.px[seat] = toX;
  c.py[seat] = toY;
  c.turn = nt;
}

function undoPawn4(c: Core4, seat: number, fromX: number, fromY: number, oldTurn: number) {
  const N = c.size;
  const fi = fromY * N + fromX;
  const ti = c.py[seat] * N + c.px[seat];
  c.hashLo = (c.hashLo ^ z4PawnLo[seat][fi] ^ z4PawnLo[seat][ti] ^ z4TurnLo[c.turn] ^ z4TurnLo[oldTurn]) | 0;
  c.hashHi = (c.hashHi ^ z4PawnHi[seat][fi] ^ z4PawnHi[seat][ti] ^ z4TurnHi[c.turn] ^ z4TurnHi[oldTurn]) | 0;
  c.px[seat] = fromX;
  c.py[seat] = fromY;
  c.turn = oldTurn;
}

function applyWall4(c: Core4, seat: number, x: number, y: number, o: Orientation) {
  const W = c.size - 1;
  const idx = y * W + x;
  const zlo = o === "h" ? z4WallHLo[idx] : z4WallVLo[idx];
  const zhi = o === "h" ? z4WallHHi[idx] : z4WallVHi[idx];
  const nt = nextActiveSeat(c, seat);
  const k = c.walls[seat];
  c.hashLo =
    (c.hashLo ^ zlo ^ z4TurnLo[c.turn] ^ z4TurnLo[nt] ^ z4WallsLo[seat][k] ^ z4WallsLo[seat][k - 1]) | 0;
  c.hashHi =
    (c.hashHi ^ zhi ^ z4TurnHi[c.turn] ^ z4TurnHi[nt] ^ z4WallsHi[seat][k] ^ z4WallsHi[seat][k - 1]) | 0;
  c.gLo = (c.gLo ^ zlo) | 0;
  c.gHi = (c.gHi ^ zhi) | 0;
  if (o === "h") c.h[idx] = 1;
  else c.v[idx] = 1;
  c.walls[seat] = k - 1;
  c.turn = nt;
}

function undoWall4(c: Core4, seat: number, x: number, y: number, o: Orientation, oldTurn: number) {
  const W = c.size - 1;
  const idx = y * W + x;
  const zlo = o === "h" ? z4WallHLo[idx] : z4WallVLo[idx];
  const zhi = o === "h" ? z4WallHHi[idx] : z4WallVHi[idx];
  const k = c.walls[seat]; // 撤销前 = k-1，撤销后 = k
  c.hashLo =
    (c.hashLo ^ zlo ^ z4TurnLo[c.turn] ^ z4TurnLo[oldTurn] ^ z4WallsLo[seat][k + 1] ^ z4WallsLo[seat][k]) | 0;
  c.hashHi =
    (c.hashHi ^ zhi ^ z4TurnHi[c.turn] ^ z4TurnHi[oldTurn] ^ z4WallsHi[seat][k + 1] ^ z4WallsHi[seat][k]) | 0;
  c.gLo = (c.gLo ^ zlo) | 0;
  c.gHi = (c.gHi ^ zhi) | 0;
  if (o === "h") c.h[idx] = 0;
  else c.v[idx] = 0;
  c.walls[seat] = k + 1;
  c.turn = oldTurn;
}

/* ============ 棋子着法（含三子占位的直跳/斜跳） ============ */

const _pm4Out: Vec[] = [];
function corePawnMoves4(c: Core4, seat: number): Vec[] {
  const N = c.size;
  const mx = c.px[seat];
  const my = c.py[seat];
  const grids = { h: c.h, v: c.v };
  _pm4Out.length = 0;
  for (let k = 0; k < 4; k++) {
    const dx = k === 2 ? -1 : k === 3 ? 1 : 0;
    const dy = k === 0 ? -1 : k === 1 ? 1 : 0;
    const nx = mx + dx;
    const ny = my + dy;
    if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
    if (edgeBlockedG4(grids, mx, my, dx, dy)) continue;
    /* 邻格被占？（其余三席，含出局者——铅字留盘作障碍） */
    let blocker = -1;
    for (let o = 0; o < 4; o++) {
      if (o === seat) continue;
      if (c.px[o] === nx && c.py[o] === ny) {
        blocker = o;
        break;
      }
    }
    if (blocker < 0) {
      _pm4Out.push({ x: nx, y: ny });
      continue;
    }
    /* 直跳：落点界内、无墙、无子 */
    const jx = mx + 2 * dx;
    const jy = my + 2 * dy;
    const inB = jx >= 0 && jx <= N - 1 && jy >= 0 && jy <= N - 1;
    let straightClear = inB && !edgeBlockedG4(grids, nx, ny, dx, dy);
    if (straightClear) {
      for (let o = 0; o < 4; o++) {
        if (o !== seat && c.px[o] === jx && c.py[o] === jy) {
          straightClear = false;
          break;
        }
      }
    }
    if (straightClear) {
      _pm4Out.push({ x: jx, y: jy });
      continue;
    }
    /* 斜跳：被跳子两侧（界内、无墙、无子） */
    if (dx !== 0) {
      for (const py2 of [-1, 1]) {
        const sx = nx;
        const sy = ny + py2;
        if (sx < 0 || sx > N - 1 || sy < 0 || sy > N - 1) continue;
        if (edgeBlockedG4(grids, nx, ny, 0, py2)) continue;
        let occ = false;
        for (let o = 0; o < 4; o++) {
          if (o !== seat && c.px[o] === sx && c.py[o] === sy) {
            occ = true;
            break;
          }
        }
        if (!occ) _pm4Out.push({ x: sx, y: sy });
      }
    } else {
      for (const px2 of [-1, 1]) {
        const sx = nx + px2;
        const sy = ny;
        if (sx < 0 || sx > N - 1 || sy < 0 || sy > N - 1) continue;
        if (edgeBlockedG4(grids, nx, ny, px2, 0)) continue;
        let occ = false;
        for (let o = 0; o < 4; o++) {
          if (o !== seat && c.px[o] === sx && c.py[o] === sy) {
            occ = true;
            break;
          }
        }
        if (!occ) _pm4Out.push({ x: sx, y: sy });
      }
    }
  }
  return _pm4Out;
}

function onGoal4(c: Core4, seat: number): boolean {
  const N = c.size;
  const x = c.px[seat];
  const y = c.py[seat];
  if (seat === 0) return y === 0;
  if (seat === 1) return y === N - 1;
  if (seat === 2) return x === N - 1;
  return x === 0;
}

/* 非分配机动数（评估用；语义与 corePawnMoves4 一致但不产生对象） */
function countPawnMoves4(c: Core4, seat: number): number {
  const N = c.size;
  const mx = c.px[seat];
  const my = c.py[seat];
  const grids = { h: c.h, v: c.v };
  let cnt = 0;
  for (let k = 0; k < 4; k++) {
    const dx = k === 2 ? -1 : k === 3 ? 1 : 0;
    const dy = k === 0 ? -1 : k === 1 ? 1 : 0;
    const nx = mx + dx;
    const ny = my + dy;
    if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
    if (edgeBlockedG4(grids, mx, my, dx, dy)) continue;
    let blocker = -1;
    for (let o = 0; o < 4; o++) {
      if (o !== seat && c.px[o] === nx && c.py[o] === ny) {
        blocker = o;
        break;
      }
    }
    if (blocker < 0) {
      cnt++;
      continue;
    }
    const jx = mx + 2 * dx;
    const jy = my + 2 * dy;
    const inB = jx >= 0 && jx <= N - 1 && jy >= 0 && jy <= N - 1;
    let straightClear = inB && !edgeBlockedG4(grids, nx, ny, dx, dy);
    if (straightClear) {
      for (let o = 0; o < 4; o++) {
        if (o !== seat && c.px[o] === jx && c.py[o] === jy) {
          straightClear = false;
          break;
        }
      }
    }
    if (straightClear) {
      cnt++;
      continue;
    }
    if (dx !== 0) {
      for (const py2 of [-1, 1]) {
        const sy = ny + py2;
        if (sy < 0 || sy > N - 1) continue;
        if (edgeBlockedG4(grids, nx, ny, 0, py2)) continue;
        let occ = false;
        for (let o = 0; o < 4; o++) {
          if (o !== seat && c.px[o] === nx && c.py[o] === sy) {
            occ = true;
            break;
          }
        }
        if (!occ) cnt++;
      }
    } else {
      for (const px2 of [-1, 1]) {
        const sx = nx + px2;
        if (sx < 0 || sx > N - 1) continue;
        if (edgeBlockedG4(grids, nx, ny, px2, 0)) continue;
        let occ = false;
        for (let o = 0; o < 4; o++) {
          if (o !== seat && c.px[o] === sx && c.py[o] === ny) {
            occ = true;
            break;
          }
        }
        if (!occ) cnt++;
      }
    }
  }
  return cnt;
}

/* 行棋方本手即可抵线（含跳子）——任意深度精确判胜 */
function canWinNow4(c: Core4, seat: number): boolean {
  const N = c.size;
  for (const m of corePawnMoves4(c, seat)) {
    if (hasWonCell(SEAT_LETTER[seat], m.x, m.y, N)) return true;
  }
  return false;
}

/* 某席最短路格点标记（沿距离场递降；写共享 _pc4Marks，即时消费） */
const _pc4Marks = new Uint8Array(MAX_CELLS);
function corePathMarks4(c: Core4, buf: Int16Array, seat: number): boolean {
  const N = c.size;
  const base = seat * MAX_CELLS;
  let cur = c.py[seat] * N + c.px[seat];
  let d = buf[base + cur];
  if (d <= 0) return false;
  _pc4Marks.fill(0, 0, N * N);
  _pc4Marks[cur] = 1;
  const grids = { h: c.h, v: c.v };
  let guard = 0;
  while (d > 0 && guard++ < 200) {
    const cx = cur % N;
    const cy = (cur - cx) / N;
    let next = -1;
    for (let k = 0; k < 4; k++) {
      const dx = k === 2 ? -1 : k === 3 ? 1 : 0;
      const dy = k === 0 ? -1 : k === 1 ? 1 : 0;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (edgeBlockedG4(grids, cx, cy, dx, dy)) continue;
      if (buf[base + ny * N + nx] === d - 1) {
        next = ny * N + nx;
        break;
      }
    }
    if (next < 0) return false;
    _pc4Marks[next] = 1;
    cur = next;
    d--;
  }
  return true;
}

/* 前向分岔数（路径自由度） */
function forwardChoices4(c: Core4, buf: Int16Array, seat: number): number {
  const N = c.size;
  const base = seat * MAX_CELLS;
  const x = c.px[seat];
  const y = c.py[seat];
  const d = buf[base + y * N + x];
  if (d <= 0) return 0;
  const grids = { h: c.h, v: c.v };
  let cnt = 0;
  for (let k = 0; k < 4; k++) {
    const dx = k === 2 ? -1 : k === 3 ? 1 : 0;
    const dy = k === 0 ? -1 : k === 1 ? 1 : 0;
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
    if (edgeBlockedG4(grids, x, y, dx, dy)) continue;
    if (buf[base + ny * N + nx] === d - 1) cnt++;
  }
  return cnt;
}

/* ============ 评估（我的视角标量分） ============ */

interface SearchCtx4 {
  tt: Map<number, TtEntry4>;
  killers: Int32Array;
  history: Float64Array;
  deadline: number;
  start: number;
  nodes: number;
  wallSeat: number[]; // 搜索路径上放板者（断路归责用，与 wallPly 平行）
  wallPly: number[];
  params: Params4;
}

function cutBlame4(me: number, ply: number, ctx: SearchCtx4): number {
  const placer = ctx.wallSeat.length > 0 ? ctx.wallSeat[ctx.wallSeat.length - 1] : -1;
  const d = EVAL4_WIN - ply;
  return placer === me ? -d : d;
}

function evaluate4(c: Core4, me: number, ply: number, ctx: SearchCtx4): number {
  const buf = goalDists4(c);
  const N = c.size;
  const myD = buf[me * MAX_CELLS + c.py[me] * N + c.px[me]];
  if (myD === 0) return EVAL4_WIN - ply;
  if (myD < 0) return cutBlame4(me, ply, ctx);

  /* 活跃对手距离（升序）与余板 */
  const d1 = [Infinity, Infinity, Infinity];
  const s1 = [-1, -1, -1];
  let oppWalls = 0;
  let n = 0;
  for (let s = 0; s < 4; s++) {
    if (s === me || c.elim & (1 << s)) continue;
    const d = buf[s * MAX_CELLS + c.py[s] * N + c.px[s]];
    if (d < 0) return cutBlame4(me, ply, ctx);
    if (d === 0) return -(EVAL4_WIN - ply); /* 防御：对手已抵线（理论不可达） */
    oppWalls += c.walls[s];
    let i = n;
    while (i > 0 && d1[i - 1] > d) {
      d1[i] = d1[i - 1];
      s1[i] = s1[i - 1];
      i--;
    }
    d1[i] = d;
    s1[i] = s;
    n++;
  }
  if (n === 0) return EVAL4_WIN - ply;

  /* 主项：领先者差距；次/三威胁折价（v2.1：0.25/0.12→0.4/0.2——四人局
   * 平先时烧板拦「领先者」的短期收益（+2×1.0）会压过对后位两家
   * 的节奏亏损，诱发板海马拉松；后位威胁的权重必须足以计入代价） */
  let score = d1[0] - myD;
  if (n >= 2) score += 0.4 * (d1[1] - myD);
  if (n >= 3) score += 0.2 * (d1[2] - myD);

  /* 板弹经济学：余板边际价值凸性（稀缺更贵）——前两块 0.3/板（舍不得），
   * 其余 0.1/板（战略储备）；三家围剿弹药合计线性计价 */
  const mw = c.walls[me];
  score += 0.3 * Math.min(mw, 2) + 0.1 * Math.max(0, mw - 2) - 0.05 * oppWalls;

  /* 路径自由度：单线走廊可被一板锁喉（对领先者对称计价） */
  score += 0.1 * (Math.min(forwardChoices4(c, buf, me), 3) - Math.min(forwardChoices4(c, buf, s1[0]), 3));

  /* 死巷惩罚（只罚自己；非分配计数，避免每叶 GC 压力） */
  const myMob = countPawnMoves4(c, me);
  if (myMob <= 3) score -= (4 - myMob) * 0.4;

  /* 竞速节奏：与领先者近距（±1）时，轮转先手值半步 */
  const gap = d1[0] - myD;
  if (gap >= -1 && gap <= 1) {
    /* 从当前行棋方轮转，看谁先轮到 */
    let s = c.turn;
    let meFirst = false;
    let leaderFirst = false;
    for (let k = 0; k < 4 && !meFirst && !leaderFirst; k++) {
      if (s === me) meFirst = true;
      else if (s === s1[0]) leaderFirst = true;
      s = NEXT_SEAT[s];
    }
    score += meFirst ? 0.25 : leaderFirst ? -0.25 : 0;
  }
  return score;
}

/* ============ 置换表 ============ */

const TT4_EXACT = 0;
const TT4_LOWER = 1;
const TT4_UPPER = 2;

interface TtEntry4 {
  hi: number;
  depth: number;
  score: number;
  flag: number;
  best: number;
}

const TT4 = new Map<number, TtEntry4>();
const TT4_CAP = 150000;

class SearchAbort4 extends Error {}
const ABORT4 = new SearchAbort4();

function ttStore4(
  ctx: SearchCtx4,
  key: number,
  hi: number,
  depth: number,
  score: number,
  alphaOrig: number,
  betaOrig: number,
  bestCode: number,
) {
  if (!Number.isFinite(score) || Math.abs(score) > EVAL4_WIN / 2) return;
  if (ctx.tt.size > TT4_CAP) ctx.tt.clear();
  const flag = score <= alphaOrig ? TT4_UPPER : score >= betaOrig ? TT4_LOWER : TT4_EXACT;
  ctx.tt.set(key, { hi: hi >>> 0, depth, score, flag, best: bestCode });
}

function noteCutoff4(ctx: SearchCtx4, ply: number, code: number, depth: number) {
  if (code >= WALL_CODE_SPACE || ply >= MAX_PLY4) return;
  ctx.history[code] += depth * depth;
  if (ctx.history[code] > 1e6) ctx.history[code] = 1e6;
  const k0 = ctx.killers[ply * 2];
  if (k0 !== code) {
    ctx.killers[ply * 2 + 1] = k0;
    ctx.killers[ply * 2] = code;
  }
}

function wallCode4(x: number, y: number, o: Orientation, size: number): number {
  return (y * (size - 1) + x) * 2 + (o === "h" ? 0 : 1);
}

/* ============ 候选生成 ============ */

interface Cand4 {
  code: number;
  isWall: boolean;
  x: number;
  y: number;
  o: Orientation;
  score: number;
  gain: number; // （根节点）领先者归途增量——竞速纪律门控用
}

/* 由路径格点标记推导「会拦此席的板」的十字伴板（同锚点反方向）——
 * 伴板与拦道板十字冲突，我先行占位即废掉对手的拦道板；
 * 伴板方向不同，自身不拦我。 */
function crossGuardsFromMarks(c: Core4, buf: Int16Array, seat: number, out: number[]) {
  const N = c.size;
  const base = seat * MAX_CELLS;
  const grids = { h: c.h, v: c.v };
  for (let cur = 0; cur < N * N; cur++) {
    if (!_pc4Marks[cur]) continue;
    const cx = cur % N;
    const cy = (cur - cx) / N;
    const du = buf[base + cur];
    for (let k = 0; k < 4; k++) {
      const dx = k === 2 ? -1 : k === 3 ? 1 : 0;
      const dy = k === 0 ? -1 : k === 1 ? 1 : 0;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (buf[base + ny * N + nx] !== du - 1) continue;
      if (edgeBlockedG4(grids, cx, cy, dx, dy)) continue;
      if (dy !== 0) {
        const ay = dy === -1 ? cy - 1 : cy;
        out.push(cx, ay, 1); /* h 拦道板的十字伴板 = 同锚 v */
        out.push(cx - 1, ay, 1);
      } else {
        const ax = dx === 1 ? cx : cx - 1;
        out.push(ax, cy, 0); /* v 拦道板的十字伴板 = 同锚 h */
        out.push(ax, cy - 1, 0);
      }
    }
  }
}

/* 冲突快查（重叠/十字） */
function wallFits4(c: Core4, x: number, y: number, o: Orientation): boolean {
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

/* 由路径格点标记推导可封锁锚点（下降边两侧的 h/v 锚），写入锚点收集器 */
function anchorsFromMarks(c: Core4, buf: Int16Array, seat: number, out: number[]) {
  const N = c.size;
  const base = seat * MAX_CELLS;
  const grids = { h: c.h, v: c.v };
  for (let cur = 0; cur < N * N; cur++) {
    if (!_pc4Marks[cur]) continue;
    const cx = cur % N;
    const cy = (cur - cx) / N;
    const du = buf[base + cur];
    for (let k = 0; k < 4; k++) {
      const dx = k === 2 ? -1 : k === 3 ? 1 : 0;
      const dy = k === 0 ? -1 : k === 1 ? 1 : 0;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (buf[base + ny * N + nx] !== du - 1) continue;
      if (edgeBlockedG4(grids, cx, cy, dx, dy)) continue;
      if (dy !== 0) {
        const ay = dy === -1 ? cy - 1 : cy;
        out.push(cx, ay, 0);
        out.push(cx - 1, ay, 0);
      } else {
        const ax = dx === 1 ? cx : cx - 1;
        out.push(ax, cy, 1);
        out.push(ax, cy - 1, 1);
      }
    }
  }
}

/* 候选去重：代际戳共享数组（免每节点 Set 分配） */
const _candSeen = new Uint16Array(WALL_CODE_SPACE);
let _candGen = 0;
/* 锚点收集器：共享数组复用（免每节点 number[] 分配） */
const _anchors: number[] = [];

/* 候选生成：行棋方 mover（视角 me 固定）。
 * mover === me → MAX 节点（我的着法：推进 + 拦领先者 + 护航走廊）；
 * mover !== me → 联盟 MIN 节点（该对手的着法：推进 + 围剿我）。 */
function genCands4(
  c: Core4,
  mover: number,
  me: number,
  ctx: SearchCtx4,
  ply: number,
  depth: number,
  isRoot: boolean,
): Cand4[] {
  const N = c.size;
  const buf = goalDists4(c);
  const out: Cand4[] = [];
  if (++_candGen >= 65535) {
    _candSeen.fill(0);
    _candGen = 1;
  }
  const gen = _candGen;

  /* 棋子着法：朝目标推进优先，跳子加分 */
  const myD0 = dist4(buf, mover, c.px[mover], c.py[mover], N);
  for (const m of corePawnMoves4(c, mover)) {
    const dTo = dist4(buf, mover, m.x, m.y, N);
    const toward = myD0 - dTo;
    const jump = Math.abs(m.x - c.px[mover]) + Math.abs(m.y - c.py[mover]) >= 2 ? 1 : 0;
    out.push({
      code: PAWN_CODE_BASE + m.y * N + m.x,
      isWall: false,
      x: m.x,
      y: m.y,
      o: "h",
      score: toward * 12 + jump * 8,
      gain: 0,
    });
  }

  if (c.walls[mover] <= 0) return out.sort((a, b) => b.score - a.score);

  /* 活跃对手距离排序（对 mover 而言的「威胁方」） */
  const p: Params4 = ctx.params;
  const isMax = mover === me;
  let leaderSeat = -1;
  let leaderD = Infinity;
  let secondSeat = -1;
  let secondD = Infinity;
  let targetSeat = -1; // MAX：拦谁；MIN：围剿谁（= me）
  /* v2.3 放板纪律（内化到每个 MAX 节点，与根一致——否则内层幻想
   * 未来放板而根上永不兑现，评估系统性乐观）：
   * - 领先者临门（d1≤2）：必拦（gain≥1）——不拦即负；
   * - 被拉开 ≥3 步：高增益翻盘板（gain≥3）——板是唯一武器；
   * - 其余（领先/平先/微落后）：纯竞速——四人局烧一手板白送三家半步，
   *   实测（各 16 局）：默认 1/2 门槛 3 胜 · gain≥3 5 胜 · 纯竞速 6 胜，
   *   放板净收益为负，「聪明反被聪明误」的终极形态。 */
  let minGainW = Infinity;
  let emergencyNow = false;
  let harmCapNow = 0;
  let urgentNow = false;
  if (isMax) {
    for (let s = 0; s < 4; s++) {
      if (s === me || c.elim & (1 << s)) continue;
      const d = dist4(buf, s, c.px[s], c.py[s], N);
      if (d < 0) continue;
      if (d < leaderD) {
        secondD = leaderD;
        secondSeat = leaderSeat;
        leaderD = d;
        leaderSeat = s;
      } else if (d < secondD) {
        secondD = d;
        secondSeat = s;
      }
    }
    targetSeat = leaderSeat;
    if (leaderSeat >= 0) {
      const myDn = dist4(buf, mover, c.px[mover], c.py[mover], N);
      /* v2.6 板纪律·学徒同款激进（阶梯实测：L1 板海对各种搜索策略
       * 5:3 / 13:3 / 6:2 碾压——四人局里「追赶时拼命放板」就是强）：
       * - 追赶态（领先者 ≤3 步或我落后 ≥2）：每手可放，minGain 1，
       *   自伤容忍 1-2（临门更宽）——学徒的 urgent 全量模式；
       * - 平先/领先：隔手可放，minGain 2，零自伤——学徒的 25% 随机
       *   的确定性版本。搜索负责选「哪块板」，纪律负责「放不放」。 */
      urgentNow = leaderD <= 3 || myDn >= leaderD + 2;
      emergencyNow = leaderD <= 2;
      harmCapNow = urgentNow ? (leaderD <= 2 ? 2 : 1) : 0;
      minGainW = ENV4_ONLYGAIN != null ? ENV4_ONLYGAIN : urgentNow ? 1 : 2;
      if (ENV4_NOWALL) minGainW = Infinity;
    }
  } else {
    /* v2.5 联盟模型·拦威胁者：纯偏执让三家墙永远瞄准「我」——我不领先时
     * 这严重失真（真实对手拦的是当前领先者），导致引擎过度悲观、畏缩
     * 不前（被学徒板海羞辱的根源）。改为：对手 X 的墙瞄准其余三席中
     * 距离最近者（威胁最大者）——我领先时照旧被围剿（真实的领先税），
     * 我不领先时对手互拦/纯推进，不再有幻影围剿。MIN 语义（对我的
     * 最小值）不变——拦别人的板对我是利好，MIN 自然不选，留给
     * 现实去发生（轻微乐观，与旧模型的系统性悲观相抵）。 */
    let threatSeat = -1;
    let threatD = Infinity;
    for (let s = 0; s < 4; s++) {
      if (s === mover || c.elim & (1 << s)) continue;
      const d = dist4(buf, s, c.px[s], c.py[s], N);
      if (d >= 0 && d < threatD) {
        threatD = d;
        threatSeat = s;
      }
    }
    targetSeat = threatSeat >= 0 ? threatSeat : me;
  }
  if (targetSeat < 0) return out.sort((a, b) => b.score - a.score);
  /* 节奏检查：当前搜索路径上自己上一手（≤8 层前）是否放过板 */
  let paced = false;
  for (let j = ctx.wallSeat.length - 1; j >= 0; j--) {
    if (ctx.wallSeat[j] === mover && ctx.wallPly[j] > ply - 8) {
      paced = true;
      break;
    }
  }

  /* 候选窗：深度越深越窄（早层看全，深层看精） */
  let wallCap: number;
  if (isMax) {
    wallCap = isRoot ? p.rootWall : Math.max(6, p.innerWall - Math.max(0, depth - 3));
  } else {
    /* 联盟窗随「我对联盟的威胁度」自适应：我远离终点（≥12 步）时
     * 围剿无从谈起，联盟节点退化为纯推进；8-11 步半量。 */
    const meD = dist4(buf, me, c.px[me], c.py[me], N);
    const coal = meD >= 12 ? 0 : meD >= 8 ? Math.ceil(p.coalWall / 2) : p.coalWall;
    wallCap = Math.max(0, Math.min(coal, p.coalWall - Math.max(0, depth - 3)));
  }

  const anchors = _anchors;
  anchors.length = 0;
  const addAnchors = (seat: number) => {
    if (seat < 0) return;
    if (corePathMarks4(c, buf, seat)) anchorsFromMarks(c, buf, seat, anchors);
  };
  let defensiveFrom = Infinity; // 锚点序号自此为自卫板（基础分 +3，免被窗裁光）
  if (isMax) {
    addAnchors(leaderSeat);
    if (secondSeat >= 0 && secondD <= leaderD + 2) addAnchors(secondSeat);
    defensiveFrom = anchors.length / 3;
    /* 护航走廊（自卫板）：己方周边一圈的战略纵深 */
    const mx = c.px[mover];
    const my = c.py[mover];
    for (let ddx = -1; ddx <= 1; ddx++) {
      anchors.push(mx + ddx, my - 2, 0);
      anchors.push(mx + ddx, my + 2, 0);
    }
    for (let ddy = -1; ddy <= 1; ddy++) {
      anchors.push(mx - 2, my + ddy, 1);
      anchors.push(mx + 2, my + ddy, 1);
    }
    /* 自卫占位（v2.2 十字伴板）：四人局被三家慢炖围死的主解法——
     * 提前用十字伴板占掉对手想拦我的键槽位。 */
    if (corePathMarks4(c, buf, mover)) crossGuardsFromMarks(c, buf, mover, anchors);
  } else {
    /* 联盟节点：拦威胁最大者（可能是我也可能是另一对手） */
    addAnchors(targetSeat);
  }

  const meD0 = dist4(buf, me, c.px[me], c.py[me], N);
  const walls: Cand4[] = [];
  for (let i = 0; i + 2 < anchors.length; i += 3) {
    if (walls.length >= wallCap) break;
    const x = anchors[i];
    const y = anchors[i + 1];
    const o: Orientation = anchors[i + 2] === 0 ? "h" : "v";
    if (x < 0 || y < 0 || x > N - 2 || y > N - 2) continue;
    const code = wallCode4(x, y, o, N);
    if (_candSeen[code] === gen) continue;
    if (wallFits4(c, x, y, o)) continue;
    if (!probeWall4(c, x, y, o)) continue; // 断路板非法
    _candSeen[code] = gen;
    const dMe = _pw4[me];
    const isDef = i / 3 >= defensiveFrom;
    let score: number;
    let gain = 0;
    if (isMax) {
      const gLeader = leaderSeat >= 0 ? _pw4[leaderSeat] - leaderD : 0;
      const gSecond = secondSeat >= 0 && secondD < Infinity ? _pw4[secondSeat] - secondD : 0;
      const harmMe = dMe - meD0;
      if (gLeader < minGainW) continue; /* 纪律 1：增益门槛 */
      if (harmMe > harmCapNow) continue; /* 纪律 2：自伤上限 */
      if (!urgentNow && paced) continue; /* 纪律 3：非追赶态隔手放 */
      gain = gLeader;
      score = 6 * gLeader + 2 * gSecond - 6 * harmMe + (isDef ? 3 : 0);
      if (leaderD <= 2) score += 3; // 紧急拦截加权
    } else {
      /* 联盟节点评分（v2.5）：拦威胁者的板按「对威胁者的伤害」排序；
       * 自伤 > 伤威胁且威胁不临门 → 同归于尽板，真实对手不干，弃。 */
      const threatD0 = targetSeat === me ? meD0 : dist4(buf, targetSeat, c.px[targetSeat], c.py[targetSeat], N);
      const harmThreat = _pw4[targetSeat] - threatD0;
      const moverD0 = dist4(buf, mover, c.px[mover], c.py[mover], N);
      const harmMover = _pw4[mover] - moverD0;
      if (harmMover > harmThreat && threatD0 > 3) continue;
      score = 6 * harmThreat;
      if (threatD0 <= 3) score += 3; // 威胁临门，围剿优先
    }
    if (ply < MAX_PLY4 && (ctx.killers[ply * 2] === code || ctx.killers[ply * 2 + 1] === code)) score += 55;
    if (code < WALL_CODE_SPACE) score += Math.min(40, ctx.history[code] / 8);
    walls.push({ code, isWall: true, x, y, o, score, gain });
  }
  walls.sort((a, b) => b.score - a.score);
  const capped = walls.slice(0, wallCap);

  const all = [...capped, ...out.filter((cd) => !cd.isWall)];
  all.sort((a, b) => b.score - a.score);
  return all;
}

/* ============ 偏执 α-β（我 vs 联盟） ============ */

function alphabeta4(
  c: Core4,
  ply: number,
  depth: number,
  alpha: number,
  beta: number,
  me: number,
  ctx: SearchCtx4,
  prevMover: number,
): number {
  ctx.nodes++;
  if ((ctx.nodes & 127) === 0 && Date.now() > ctx.deadline) throw ABORT4;
  if (AI4_HASH_DEBUG) hashCheck4(c, `node ply=${ply}`);

  /* 上一手已抵线：对局已结束（先于一切） */
  if (prevMover >= 0 && onGoal4(c, prevMover)) {
    return prevMover === me ? EVAL4_WIN - ply : -(EVAL4_WIN - ply);
  }
  const mover = c.turn;
  /* 行棋方本手即可抵线（含跳子）：任意深度精确判胜 */
  if (canWinNow4(c, mover)) {
    return mover === me ? EVAL4_WIN - ply : -(EVAL4_WIN - ply);
  }

  const alphaOrig = alpha;
  const betaOrig = beta;
  const key = c.hashLo >>> 0;
  let ttBest = -1;
  const entry = ctx.tt.get(key);
  if (entry && entry.hi === (c.hashHi >>> 0)) {
    ttBest = entry.best;
    if (entry.depth >= depth) {
      if (entry.flag === TT4_EXACT) return entry.score;
      if (entry.flag === TT4_LOWER && entry.score >= beta) return entry.score;
      if (entry.flag === TT4_UPPER && entry.score <= alpha) return entry.score;
    }
  }

  if (depth <= 0) return evaluate4(c, me, ply, ctx);

  let cands = genCands4(c, mover, me, ctx, ply, depth, false);
  if (cands.length === 0) return evaluate4(c, me, ply, ctx);
  if (ttBest >= 0) {
    const i = cands.findIndex((cd) => cd.code === ttBest);
    if (i > 0) {
      const pick = cands[i];
      cands.splice(i, 1);
      cands.unshift(pick);
    }
  }

  const isMax = mover === me;
  let best = isMax ? -Infinity : Infinity;
  let bestCode = -1;
  let first = true;
  let moveIdx = 0;
  for (const cand of cands) {
    const mi = moveIdx++;
    let val: number;
    if (!cand.isWall) {
      const ox = c.px[mover];
      const oy = c.py[mover];
      const oldTurn = c.turn;
      applyPawn4(c, mover, cand.x, cand.y);
      if (first) {
        val = alphabeta4(c, ply + 1, depth - 1, alpha, beta, me, ctx, mover);
        first = false;
      } else if (beta - alpha > PVS4_EPS * 8) {
        /* PVS：零宽探针，失败即弃；翻窗才全搜 */
        if (isMax) {
          const probe = alphabeta4(c, ply + 1, depth - 1, alpha, alpha + PVS4_EPS, me, ctx, mover);
          val = probe > alpha ? alphabeta4(c, ply + 1, depth - 1, alpha, beta, me, ctx, mover) : probe;
        } else {
          const probe = alphabeta4(c, ply + 1, depth - 1, beta - PVS4_EPS, beta, me, ctx, mover);
          val = probe < beta ? alphabeta4(c, ply + 1, depth - 1, alpha, beta, me, ctx, mover) : probe;
        }
      } else {
        val = alphabeta4(c, ply + 1, depth - 1, alpha, beta, me, ctx, mover);
      }
      undoPawn4(c, mover, ox, oy, oldTurn);
    } else {
      /* LMR：晚序低分板（非 TT 推荐/非杀手）降 1 层试探，失败高全深复核 */
      const isKiller =
        ply < MAX_PLY4 && (ctx.killers[ply * 2] === cand.code || ctx.killers[ply * 2 + 1] === cand.code);
      const R = !first && mi >= 8 && depth >= 4 && cand.code !== ttBest && !isKiller ? 1 : 0;
      const oldTurn = c.turn;
      ctx.wallPly.push(ply);
      ctx.wallSeat.push(mover);
      applyWall4(c, mover, cand.x, cand.y, cand.o);
      if (first) {
        val = alphabeta4(c, ply + 1, depth - 1, alpha, beta, me, ctx, mover);
        first = false;
      } else if (beta - alpha > PVS4_EPS * 8) {
        if (isMax) {
          const probe = alphabeta4(c, ply + 1, depth - 1 - R, alpha, alpha + PVS4_EPS, me, ctx, mover);
          if (probe <= alpha) {
            undoWall4(c, mover, cand.x, cand.y, cand.o, oldTurn);
            ctx.wallSeat.pop();
            ctx.wallPly.pop();
            continue;
          }
          if (R > 0) {
            const verify = alphabeta4(c, ply + 1, depth - 1, alpha, alpha + PVS4_EPS, me, ctx, mover);
            if (verify <= alpha) {
              undoWall4(c, mover, cand.x, cand.y, cand.o, oldTurn);
              ctx.wallSeat.pop();
              ctx.wallPly.pop();
              continue;
            }
            val = verify;
          } else {
            val = probe;
          }
          if (val < beta) val = alphabeta4(c, ply + 1, depth - 1, alpha, beta, me, ctx, mover);
        } else {
          const probe = alphabeta4(c, ply + 1, depth - 1 - R, beta - PVS4_EPS, beta, me, ctx, mover);
          if (probe >= beta) {
            undoWall4(c, mover, cand.x, cand.y, cand.o, oldTurn);
            ctx.wallSeat.pop();
            ctx.wallPly.pop();
            continue;
          }
          if (R > 0) {
            const verify = alphabeta4(c, ply + 1, depth - 1, beta - PVS4_EPS, beta, me, ctx, mover);
            if (verify >= beta) {
              undoWall4(c, mover, cand.x, cand.y, cand.o, oldTurn);
              ctx.wallSeat.pop();
              ctx.wallPly.pop();
              continue;
            }
            val = verify;
          } else {
            val = probe;
          }
          if (val > alpha) val = alphabeta4(c, ply + 1, depth - 1, alpha, beta, me, ctx, mover);
        }
      } else {
        val = alphabeta4(c, ply + 1, depth - 1 - R, alpha, beta, me, ctx, mover);
      }
      undoWall4(c, mover, cand.x, cand.y, cand.o, oldTurn);
      ctx.wallSeat.pop();
      ctx.wallPly.pop();
    }
    if (isMax) {
      if (val > best) {
        best = val;
        bestCode = cand.code;
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        if (cand.isWall) noteCutoff4(ctx, ply, cand.code, depth);
        break;
      }
    } else {
      if (val < best) {
        best = val;
        bestCode = cand.code;
      }
      if (best < beta) beta = best;
      if (alpha >= beta) {
        if (cand.isWall) noteCutoff4(ctx, ply, cand.code, depth);
        break;
      }
    }
  }
  ttStore4(ctx, key, c.hashHi, depth, best, alphaOrig, betaOrig, bestCode);
  return best;
}

/* ============ 搜索入口 ============ */

function goalAxisDist4(seat: number, x: number, y: number, N: number): number {
  if (seat === 0) return y;
  if (seat === 1) return N - 1 - y;
  if (seat === 2) return N - 1 - x;
  return x;
}

function search4Move(
  state: GameState,
  params: Params4,
): { payload: MovePayload; score: number } | null {
  const meSeat = SEAT_IDX[state.turn];
  const c = toCore4(state);
  const ctx: SearchCtx4 = {
    tt: TT4,
    killers: new Int32Array(MAX_PLY4 * 2),
    history: new Float64Array(WALL_CODE_SPACE),
    deadline: Date.now() + params.budgetMs,
    start: Date.now(),
    nodes: 0,
    wallSeat: [],
    wallPly: [],
    params,
  };
  /* 根节点节奏预seed：真实历史里我上一手刚放过板 → 根本手非紧急板禁放
   * （seed 在 ply -4 处：根手检查命中，下一轮 ply 4 解禁） */
  {
    const myMoves = state.history.filter((m) => m.player === state.turn);
    const last = myMoves[myMoves.length - 1];
    if (last && last.payload.type === "wall") {
      ctx.wallPly.push(-4);
      ctx.wallSeat.push(meSeat);
    }
  }

  let cands = genCands4(c, meSeat, meSeat, ctx, 0, params.maxDepth, true);
  if (cands.length === 0) return null;

  /* 置换表根推荐 */
  {
    const re = TT4.get(c.hashLo >>> 0);
    if (re && re.hi === (c.hashHi >>> 0)) {
      const i = cands.findIndex((cd) => cd.code === re.best);
      if (i > 0) {
        const pick = cands[i];
        cands.splice(i, 1);
        cands.unshift(pick);
      }
    }
  }

  /* 根节点纪律与内层一致（genCands4 已按同一公式过滤，此处仅保险） */

  let bestPayload: MovePayload | null = null;
  let bestScore = -Infinity;
  let completedDepth = 0;
  let prevElapsed = 0;

  const rootScan = (depth: number, alphaStart: number): { localBest: MovePayload | null; localScore: number; searched: number; aborted: boolean } => {
    /* 上轮中止的异常展开会跳过逐帧清理，在此集中归零 */
    ctx.wallPly.length = 0;
    ctx.wallSeat.length = 0;
    let localBest: MovePayload | null = null;
    let localScore = -Infinity;
    let alpha = alphaStart;
    let searched = 0;
    try {
      for (const cand of cands) {
        let val: number;
        if (!cand.isWall) {
          const payload: MovePayload = {
            type: "pawn",
            from: { x: c.px[meSeat], y: c.py[meSeat] },
            to: { x: cand.x, y: cand.y },
          };
          const ox = c.px[meSeat];
          const oy = c.py[meSeat];
          const oldTurn = c.turn;
          applyPawn4(c, meSeat, cand.x, cand.y);
          val = alphabeta4(c, 1, depth - 1, alpha, Infinity, meSeat, ctx, meSeat);
          /* 根平分破局（着法生效中计价，v2.1 加强）：BFS 距离 + 目标轴距离
           * 双重破局——等距绕行局面（被围后的「走廊两端等长」）会来回踱步，
           * 轴距离项保证至少贴着目标方向压；败势时折价加倍（最快抵抗）。 */
          {
            const buf2 = goalDists4(c);
            const tie = dist4(buf2, meSeat, cand.x, cand.y, c.size) * 0.005 + goalAxisDist4(meSeat, cand.x, cand.y, c.size) * 0.002;
            val -= val < -EVAL4_WIN / 2 ? tie * 10 : tie;
          }
          undoPawn4(c, meSeat, ox, oy, oldTurn);
          if (val > localScore) {
            localScore = val;
            localBest = payload;
          }
        } else {
          const payload: MovePayload = { type: "wall", wall: { x: cand.x, y: cand.y, o: cand.o, by: state.turn } };
          const oldTurn = c.turn;
          ctx.wallPly.push(0);
          ctx.wallSeat.push(meSeat);
          applyWall4(c, meSeat, cand.x, cand.y, cand.o);
          val = alphabeta4(c, 1, depth - 1, alpha, Infinity, meSeat, ctx, meSeat);
          {
            const buf2 = goalDists4(c);
            const tie = dist4(buf2, meSeat, c.px[meSeat], c.py[meSeat], c.size) * 0.005 + goalAxisDist4(meSeat, c.px[meSeat], c.py[meSeat], c.size) * 0.002;
            val -= val < -EVAL4_WIN / 2 ? tie * 10 : tie;
          }
          undoWall4(c, meSeat, cand.x, cand.y, cand.o, oldTurn);
          ctx.wallSeat.pop();
          ctx.wallPly.pop();
          if (val > localScore) {
            localScore = val;
            localBest = payload;
          }
        }
        searched++;
        cand.score = val;
        if (localScore > alpha) alpha = localScore;
      }
    } catch (e) {
      if (e instanceof SearchAbort4) {
        return { localBest, localScore, searched, aborted: true };
      }
      throw e;
    }
    return { localBest, localScore, searched, aborted: false };
  };

  for (let depth = 2; depth <= params.maxDepth; depth++) {
    cands.sort((a, b) => b.score - a.score);
    const r = rootScan(depth, -Infinity);
    if (r.aborted) {
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
    }
    if (bestScore > EVAL4_WIN / 2) break; // 已见必胜
    const elapsed = Date.now() - ctx.start;
    if (elapsed > params.budgetMs) break;
    const lastIter = Math.max(elapsed - prevElapsed, 1);
    prevElapsed = elapsed;
    /* 多方树带 TT 复用时实测层间开销 ≈ ×2-3（×4 过保守会白剩近半预算） */
    if (elapsed + lastIter * 3 > params.budgetMs) break;
  }

  _lastStats4.nodes = ctx.nodes;
  _lastStats4.depth = completedDepth;
  _lastStats4.elapsedMs = Date.now() - ctx.start;
  if (!bestPayload) return null;
  return { payload: bestPayload, score: Number.isFinite(bestScore) ? bestScore : -1e9 };
}

const _lastStats4 = { nodes: 0, depth: 0, elapsedMs: 0, dcHits: 0, dcMisses: 0 };
export function lastSearchStats4() {
  return { ..._lastStats4, dcHits: dc4Hits, dcMisses: dc4Misses };
}

/* ============ 推进 / 兜底（GameState 层，与 v1 同源） ============ */

function bestAdvance(state: GameState, me: Player, level: AiLevel): AiDecision | null {
  const N = boardSize(state);
  const legal = legalPawnMoves(state, me);
  const from = pawnOf(state, me);
  if (legal.length === 0) return null;
  const grids = buildWallGrids(state.walls, N);
  let best: Vec | null = null;
  let bestD = Infinity;
  for (const v of legal) {
    const d = bfsDistanceToGoal(grids, v, me, N);
    if (d >= 0 && d < bestD) {
      bestD = d;
      best = v;
    }
  }
  if (!best) best = legal[0];
  return {
    payload: { type: "pawn", from: { x: from.x, y: from.y }, to: { x: best.x, y: best.y } },
    label: PAWN_LABEL[level],
  };
}

function anyWall(state: GameState, me: Player, level: AiLevel): AiDecision | null {
  const N = boardSize(state);
  if (wallsLeftOf(state, me) <= 0) return null;
  for (let x = 0; x <= N - 2; x++) {
    for (let y = 0; y <= N - 2; y++) {
      for (const o of ["h", "v"] as Orientation[]) {
        if (checkWall(state, x, y, o, me).ok) {
          return {
            payload: { type: "wall", wall: { x, y, o, by: me } },
            label: WALL_LABEL[level],
          };
        }
      }
    }
  }
  return null;
}

/* ============ 入口 ============ */

export function computeAiMove4(
  state: GameState,
  level: AiLevel,
  opts?: { budgetMs?: number },
): AiDecision | null {
  if (state.winner) return null;
  const me = state.turn;
  if (state.playerCount !== 4 || isEliminated(state, me)) return null;
  const N = boardSize(state);

  /* 1. 即胜着：任何档位都不放过 */
  const winNow = legalPawnMoves(state, me).find((v) => hasWonCell(me, v.x, v.y, N));
  if (winNow) {
    const from = pawnOf(state, me);
    return {
      payload: { type: "pawn", from: { x: from.x, y: from.y }, to: { x: winNow.x, y: winNow.y } },
      label: WIN_LABEL[level],
      score: EVAL4_WIN - 1,
    };
  }

  /* 2. 学徒：保留 v1 启发式人设（最短路捡字 + 拦临门道的随手板） */
  if (level === 1) {
    return computeAiMove4Legacy(state, 1, opts);
  }

  const actives = activePlayers(state);
  const others = actives.filter((p) => p !== me);
  if (others.length === 0) return null;

  /* 3. 竞速捷径：对手全无板且我领先 ≥2 步——板已失效、跳子翻不了
   *    两步差距，直接推进（省下整段搜索预算）。其余情形交给偏执搜索：
   *    平先/落后时「该不该烧板拦道」正是搜索要回答的问题。 */
  {
    const grids = buildWallGrids(state.walls, N);
    const myD = bfsDistanceToGoal(grids, pawnOf(state, me), me, N);
    let d1 = Infinity;
    let oppW = 0;
    for (const p of others) {
      const d = bfsDistanceToGoal(grids, pawnOf(state, p), p, N);
      if (d >= 0 && d < d1) d1 = d;
      oppW += wallsLeftOf(state, p);
    }
    if (oppW === 0 && myD <= d1 - 2) {
      return bestAdvance(state, me, level);
    }
  }

  /* 4. 偏执联盟搜索 */
  const p = params4(level, N);
  const cap = opts?.budgetMs;
  const budget = cap != null ? Math.min(p.budgetMs, cap) : p.budgetMs;
  try {
    const found = search4Move(state, { ...p, budgetMs: budget });
    if (found) {
      const label = found.payload.type === "wall" ? WALL_LABEL[level] : PAWN_LABEL[level];
      return { payload: found.payload, label, score: found.score };
    }
  } catch (e) {
    console.error("四人 AI 计算异常，使用兜底", e);
  }

  /* 5. 兜底 */
  return bestAdvance(state, me, level) ?? anyWall(state, me, level);
}
