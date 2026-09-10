/* 步步为营 —— 规则引擎（纯函数，无副作用，完全可序列化）
 * 支持可变棋盘 N（奇数 5..13）与可变每方挡板数；二人局与四人围坐局。
 * 四人局：四席分列四边中点，顺时针行棋（甲南→丙西→乙北→丁东）；
 * 认输/超时为出局（铅字留盘作障碍），至仅存一席时末位胜。
 * 挡板合法性：不可重叠（共用凹槽）、不可十字交叉；放置后所有在场席位必须仍有路可通（BFS 校验）。
 * 跳子：正面相邻棋子不可走入其格；身后无阻且落位无子可直跳；
 * 直跳被堵（墙/出界/落位被占）时可斜跳至被跳子两侧（落位须空）。
 * 挡板格线快查位图以 (N-1)×(N-1) 为步长；BFS 邻接以 N×N 编址。
 */

import {
  GameState,
  Move,
  MovePayload,
  Player,
  SEAT_ORDER_4,
  Vec,
  Wall,
  hasWonCell,
  initialGame,
  normalizeConfig,
  normalizeState,
  opponent,
  pawnNotation,
  resignNotation,
  timeoutNotation,
  wallNotation,
} from "./types";
import type { GameConfig, Orientation } from "./types";

const DIRS: Array<[number, number]> = [
  [0, -1], // 上
  [0, 1], // 下
  [-1, 0], // 左
  [1, 0], // 右
];

/* 棋盘格数上限（13×13）—— 预分配 BFS 缓冲 */
const MAX_CELLS = 169;
const MAX_ANCHORS = 144; // 12×12

export type RejectReason =
  | "not-your-turn"
  | "game-over"
  | "occupied"
  | "blocked"
  | "illegal-pawn"
  | "no-walls"
  | "overlap"
  | "cross"
  | "no-path"
  | "out-of-bounds";

export interface ApplyResult {
  ok: boolean;
  reason?: RejectReason;
  state?: GameState;
}

/* —— 尺寸工具 —— */

/* 局面尺寸（旧存档兼容回填 9） */
export function boardSize(state: GameState): number {
  return Number.isFinite(state?.size) ? state.size : 9;
}

export function anchorMax(size: number): number {
  return size - 2; // 挡板锚点 0..N-2
}

/* —— 席位工具（二人 / 四人通用） —— */

/* 席位迭代顺序（= 行棋顺序）：二人 [A,B]；四人顺时针 [A,C,B,D] */
export function playersOf(state: GameState): Player[] {
  return state?.playerCount === 4 ? SEAT_ORDER_4 : ["A", "B"];
}

export function activePlayers(state: GameState): Player[] {
  const elim = state?.eliminated ?? [];
  return playersOf(state).filter((p) => !elim.includes(p));
}

export function isEliminated(state: GameState, p: Player): boolean {
  return (state?.eliminated ?? []).includes(p);
}

/* 某席铅字位置（旧档四人缺字段时回填中点） */
export function pawnOf(state: GameState, p: Player): Vec {
  if (p === "A") return state.posA;
  if (p === "B") return state.posB;
  const mid = (boardSize(state) - 1) / 2;
  if (p === "C") return state.posC ?? { x: 0, y: mid };
  return state.posD ?? { x: boardSize(state) - 1, y: mid };
}

/* 盘上全部铅字（含出局席位 —— 出局者铅字留盘作障碍） */
export function allPawns(state: GameState): Vec[] {
  const out: Vec[] = [state.posA, state.posB];
  if (state?.playerCount === 4) {
    const mid = (boardSize(state) - 1) / 2;
    out.push(state.posC ?? { x: 0, y: mid });
    out.push(state.posD ?? { x: boardSize(state) - 1, y: mid });
  }
  return out;
}

export function wallsLeftOf(state: GameState, p: Player): number {
  if (p === "A") return state.wallsA;
  if (p === "B") return state.wallsB;
  if (p === "C") return Number.isFinite(state.wallsC) ? (state.wallsC as number) : state.wallsStart;
  return Number.isFinite(state.wallsD) ? (state.wallsD as number) : state.wallsStart;
}

/* 不可变写回某席铅字位置 */
function withPawn(state: GameState, p: Player, to: Vec): GameState {
  if (p === "A") return { ...state, posA: { x: to.x, y: to.y } };
  if (p === "B") return { ...state, posB: { x: to.x, y: to.y } };
  if (p === "C") return { ...state, posC: { x: to.x, y: to.y } };
  return { ...state, posD: { x: to.x, y: to.y } };
}

function withWallsLeft(state: GameState, p: Player, left: number): GameState {
  if (p === "A") return { ...state, wallsA: left };
  if (p === "B") return { ...state, wallsB: left };
  if (p === "C") return { ...state, wallsC: left };
  return { ...state, wallsD: left };
}

/* 行棋顺位：从 from 起顺时针下一位在场席位 */
export function nextTurnFrom(state: GameState, from: Player): Player {
  const order = playersOf(state);
  const elim = new Set(state?.eliminated ?? []);
  const i = order.indexOf(from);
  if (i < 0) return order.find((p) => !elim.has(p)) ?? from;
  for (let k = 1; k <= order.length; k++) {
    const cand = order[(i + k) % order.length];
    if (!elim.has(cand)) return cand;
  }
  return from;
}

/* —— 挡板格线（快查位图，步长 W = N-1） —— */

export function buildWallGrids(walls: Wall[], size = 9): {
  h: Uint8Array;
  v: Uint8Array;
} {
  const w = size - 1;
  const h = new Uint8Array(w * w);
  const v = new Uint8Array(w * w);
  for (const wall of walls) {
    if (wall.o === "h") h[wall.y * w + wall.x] = 1;
    else v[wall.y * w + wall.x] = 1;
  }
  return { h, v };
}

/* 位图步长（由数组长度反推，兼容外部手工构造的位图） */
function strideOf(g: { h: Uint8Array; v: Uint8Array }): number {
  const len = g.h.length || g.v.length;
  return Math.round(Math.sqrt(len)) || 8;
}

/* 判断棋子从 (x,y) 向 (dx,dy) 走一格是否被挡板拦住 */
export function edgeBlockedG(
  g: { h: Uint8Array; v: Uint8Array },
  x: number,
  y: number,
  dx: number,
  dy: number,
): boolean {
  const W = strideOf(g);
  const last = W - 1; // 最大锚点坐标
  if (dy === -1) {
    // 上行 = (x, y-1) 的下缘；H 锚 x∈{x-1, x}，注意 x=N-1 时 H(x,·) 不存在（防索引回卷）
    return !!((x <= last && g.h[(y - 1) * W + x]) || (x > 0 && g.h[(y - 1) * W + x - 1]));
  }
  if (dy === 1) {
    return !!((x <= last && g.h[y * W + x]) || (x > 0 && g.h[y * W + x - 1]));
  }
  if (dx === 1) {
    // 右行 = (x, y) 的右缘；V 锚 (x, y-1..y)
    return !!((y <= last && g.v[y * W + x]) || (y > 0 && g.v[(y - 1) * W + x]));
  }
  if (dx === -1) {
    return !!((y <= last && g.v[y * W + x - 1]) || (y > 0 && g.v[(y - 1) * W + x - 1]));
  }
  return false;
}

export function edgeBlocked(walls: Wall[], x: number, y: number, dx: number, dy: number): boolean {
  for (const w of walls) {
    if (dy !== 0 && w.o === "h") {
      // H(wx,wy) 拦 (wx,wy)(wx+1,wy) 的下行缘
      const wy = dy === 1 ? y : y - 1;
      if (w.y === wy && (w.x === x || w.x === x - 1)) return true;
    }
    if (dx !== 0 && w.o === "v") {
      const wx = dx === 1 ? x : x - 1;
      if (w.x === wx && (w.y === y || w.y === y - 1)) return true;
    }
  }
  return false;
}

/* —— 挡板冲突判定：重叠（同向共线差 1）或十字交叉（同锚点异向） —— */
export function wallConflicts(walls: Wall[], x: number, y: number, o: Orientation): boolean {
  for (const e of walls) {
    if (o === "h") {
      if (e.o === "h" && e.y === y && Math.abs(e.x - x) <= 1) return true;
      if (e.o === "v" && e.x === x && e.y === y) return true;
    } else {
      if (e.o === "v" && e.x === x && Math.abs(e.y - y) <= 1) return true;
      if (e.o === "h" && e.x === x && e.y === y) return true;
    }
  }
  return false;
}

export function wallConflictType(
  walls: Wall[],
  x: number,
  y: number,
  o: Orientation,
): "overlap" | "cross" | null {
  for (const e of walls) {
    if (o === "h") {
      if (e.o === "h" && e.y === y && Math.abs(e.x - x) <= 1) return "overlap";
      if (e.o === "v" && e.x === x && e.y === y) return "cross";
    } else {
      if (e.o === "v" && e.x === x && Math.abs(e.y - y) <= 1) return "overlap";
      if (e.o === "h" && e.x === x && e.y === y) return "cross";
    }
  }
  return null;
}

/* —— BFS：求某席当前位置到其目标线（行或列）的最短步数 —— */
/* （把对手视作可跳越/可让开，忽略其占位） */

const _dist = new Int16Array(MAX_CELLS);
const _queue = new Int16Array(MAX_CELLS);
const _seen = new Uint8Array(MAX_CELLS);

/* 由位图长度反推棋盘边长 N */
function cellsOf(g: { h: Uint8Array; v: Uint8Array }): number {
  return strideOf(g) + 1;
}

/* 目标线描述：甲顶行 / 乙底行 / 丙右列 / 丁左列 */
function goalLine(p: Player, N: number): { axisX: boolean; v: number } {
  if (p === "A") return { axisX: false, v: 0 };
  if (p === "B") return { axisX: false, v: N - 1 };
  if (p === "C") return { axisX: true, v: N - 1 };
  return { axisX: true, v: 0 };
}

export function bfsDistanceToGoal(
  grids: { h: Uint8Array; v: Uint8Array },
  from: Vec,
  p: Player,
  size?: number,
): number {
  const N = size ?? cellsOf(grids);
  const gl = goalLine(p, N);
  if (gl.axisX ? from.x === gl.v : from.y === gl.v) return 0;
  _dist.fill(-1);
  _seen.fill(0);
  const start = from.y * N + from.x;
  _dist[start] = 0;
  _seen[start] = 1;
  let head = 0;
  let tail = 0;
  _queue[tail++] = start;
  while (head < tail) {
    const cur = _queue[head++];
    const cx = cur % N;
    const cy = (cur - cx) / N;
    const d = _dist[cur];
    if (gl.axisX ? cx === gl.v : cy === gl.v) return d;
    for (let i = 0; i < 4; i++) {
      const dx = i === 3 ? 1 : i === 2 ? -1 : 0;
      const dy = i === 1 ? 1 : i === 0 ? -1 : 0;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
      const ni = ny * N + nx;
      if (_seen[ni]) continue;
      _seen[ni] = 1;
      _dist[ni] = d + 1;
      _queue[tail++] = ni;
    }
  }
  return -1; // 无路
}

export function shortestPathLength(state: GameState, p: Player): number {
  const grids = buildWallGrids(state.walls, boardSize(state));
  return bfsDistanceToGoal(grids, pawnOf(state, p), p, boardSize(state));
}

export function hasPath(state: GameState, p: Player): boolean {
  return shortestPathLength(state, p) >= 0;
}

/* 最短路径的下一步（供 AI 与提示使用）；无路时返回 null */
export function shortestPathStep(state: GameState, p: Player): Vec | null {
  const N = boardSize(state);
  const grids = buildWallGrids(state.walls, N);
  const from = pawnOf(state, p);
  const gl = goalLine(p, N);
  if (gl.axisX ? from.x === gl.v : from.y === gl.v) return null;
  // 从起点 BFS，记录父节点
  _dist.fill(-1);
  _seen.fill(0);
  const parent = new Int16Array(MAX_CELLS).fill(-1);
  const start = from.y * N + from.x;
  _dist[start] = 0;
  _seen[start] = 1;
  let head = 0;
  let tail = 0;
  _queue[tail++] = start;
  let goalIdx = -1;
  while (head < tail) {
    const cur = _queue[head++];
    const cx = cur % N;
    const cy = (cur - cx) / N;
    if (gl.axisX ? cx === gl.v : cy === gl.v) {
      goalIdx = cur;
      break;
    }
    for (let i = 0; i < 4; i++) {
      const dx = i === 3 ? 1 : i === 2 ? -1 : 0;
      const dy = i === 1 ? 1 : i === 0 ? -1 : 0;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
      const ni = ny * N + nx;
      if (_seen[ni]) continue;
      _seen[ni] = 1;
      _dist[ni] = _dist[cur] + 1;
      parent[ni] = cur;
      _queue[tail++] = ni;
    }
  }
  if (goalIdx < 0) return null;
  // 回溯至第二步
  let cur = goalIdx;
  while (parent[cur] !== start && parent[cur] !== -1) cur = parent[cur];
  if (parent[cur] !== start) return null;
  const x = cur % N;
  const y = (cur - x) / N;
  return { x, y };
}

/* —— 合法着法 —— */

export function legalPawnMoves(state: GameState, p: Player): Vec[] {
  const N = boardSize(state);
  const me = pawnOf(state, p);
  const others = allPawns(state).filter((o) => o !== me && !(o.x === me.x && o.y === me.y));
  const occupied = (x: number, y: number) => others.some((o) => o.x === x && o.y === y);
  const res: Vec[] = [];
  for (const [dx, dy] of DIRS) {
    const nx = me.x + dx;
    const ny = me.y + dy;
    if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
    if (edgeBlocked(state.walls, me.x, me.y, dx, dy)) continue;
    if (occupied(nx, ny)) {
      // 正面有子：直跳（落位须空）；直跳被堵（墙 / 出界 / 落位被占）→ 斜跳被跳子两侧
      const jx = me.x + 2 * dx;
      const jy = me.y + 2 * dy;
      const straightInBounds = jx >= 0 && jx <= N - 1 && jy >= 0 && jy <= N - 1;
      const straightClear =
        straightInBounds && !edgeBlocked(state.walls, nx, ny, dx, dy) && !occupied(jx, jy);
      if (straightClear) {
        res.push({ x: jx, y: jy });
        continue;
      }
      // 斜跳至被跳子左右两侧（落位须空）
      const perps: Array<[number, number]> =
        dx !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      for (const [px, py] of perps) {
        const sx = nx + px;
        const sy = ny + py;
        if (sx < 0 || sx > N - 1 || sy < 0 || sy > N - 1) continue;
        if (edgeBlocked(state.walls, nx, ny, px, py)) continue;
        if (occupied(sx, sy)) continue;
        res.push({ x: sx, y: sy });
      }
    } else {
      res.push({ x: nx, y: ny });
    }
  }
  return res;
}

export interface WallCheck {
  ok: boolean;
  reason?: RejectReason;
}

export function checkWall(state: GameState, x: number, y: number, o: Orientation, by: Player): WallCheck {
  const N = boardSize(state);
  if (x < 0 || x > N - 2 || y < 0 || y > N - 2) return { ok: false, reason: "out-of-bounds" };
  const left = wallsLeftOf(state, by);
  if (left <= 0) return { ok: false, reason: "no-walls" };
  const conflict = wallConflictType(state.walls, x, y, o);
  if (conflict === "overlap") return { ok: false, reason: "overlap" };
  if (conflict === "cross") return { ok: false, reason: "cross" };
  // BFS：所有在场席位仍须各有一条通路
  const grids = buildWallGrids(state.walls, N);
  if (o === "h") grids.h[y * (N - 1) + x] = 1;
  else grids.v[y * (N - 1) + x] = 1;
  for (const q of activePlayers(state)) {
    if (bfsDistanceToGoal(grids, pawnOf(state, q), q, N) < 0) return { ok: false, reason: "no-path" };
  }
  return { ok: true };
}

/* —— 落子应用 —— */

export function applyPayload(
  state: GameState,
  player: Player,
  payload: MovePayload,
  elapsedMs = 0,
): ApplyResult {
  if (state.winner) return { ok: false, reason: "game-over" };
  if (state.turn !== player) return { ok: false, reason: "not-your-turn" };
  if (state.playerCount === 4 && isEliminated(state, player)) return { ok: false, reason: "not-your-turn" };

  const N = boardSize(state);
  let next: GameState;
  let notation: string;
  if (payload.type === "pawn") {
    const legal = legalPawnMoves(state, player);
    if (!legal.some((v) => v.x === payload.to.x && v.y === payload.to.y)) {
      return { ok: false, reason: "illegal-pawn" };
    }
    next = withPawn(state, player, payload.to);
    notation = pawnNotation(payload.from, payload.to, N);
    // 胜负：抵达各自目标线（甲顶行 / 乙底行 / 丙右列 / 丁左列）
    if (hasWonCell(player, payload.to.x, payload.to.y, N)) {
      next.winner = player;
      next.winReason = "goal";
    }
  } else if (payload.type === "wall") {
    const chk = checkWall(state, payload.wall.x, payload.wall.y, payload.wall.o, player);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    notation = wallNotation(payload.wall, N);
    next = {
      ...state,
      walls: [...state.walls, payload.wall],
    };
    next = withWallsLeft(next, player, wallsLeftOf(state, player) - 1);
  } else {
    // 认输 / 超时等收束着不经由 applyPayload（由专用函数处理）
    return { ok: false, reason: "game-over" };
  }

  next.history = [
    ...state.history,
    {
      n: state.history.length + 1,
      player,
      notation,
      elapsedMs,
      t: Date.now(),
      payload,
    },
  ];
  if (!next.winner) next.turn = nextTurnFrom(next, player);
  return { ok: true, state: next };
}

/* —— 认输 / 超时 ——
 * 二人局：直接判负收束（对手胜）。
 * 四人局：出局制 —— 该席铅字留盘作障碍、不再行棋；仅存一席时末位胜。 */
function applyForfeit(state: GameState, player: Player, reason: "resign" | "timeout"): GameState {
  const notation = reason === "resign" ? resignNotation(player) : timeoutNotation(player);
  const history: Move[] = [
    ...state.history,
    {
      n: state.history.length + 1,
      player,
      notation,
      elapsedMs: 0,
      t: Date.now(),
      payload: { type: reason } as MovePayload,
    },
  ];
  if (state.playerCount !== 4) {
    return {
      ...state,
      winner: opponent(player),
      winReason: reason,
      history,
    };
  }
  const eliminated = [...(state.eliminated ?? [])];
  if (!eliminated.includes(player)) eliminated.push(player);
  const active = playersOf(state).filter((p) => !eliminated.includes(p));
  if (active.length <= 1) {
    const winner = active[0] ?? null;
    return {
      ...state,
      eliminated,
      winner,
      winReason: winner ? "last" : reason,
      turn: winner ?? state.turn,
      history,
    };
  }
  // 非末位出局：轮次顺延（仅当出局者正值其回合）
  const turn = state.turn === player ? nextTurnFrom({ ...state, eliminated }, player) : state.turn;
  return { ...state, eliminated, turn, history };
}

export function applyResign(state: GameState, player: Player): GameState {
  return applyForfeit(state, player, "resign");
}

/* 超时：loser 为用时耗尽 / 单步超时的一方（四人局为出局方） */
export function applyTimeout(state: GameState, loser: Player): GameState {
  return applyForfeit(state, loser, "timeout");
}

/* —— 序列化回放：由着法列表重建局面（驱动悔棋 / 回放 / 在线重连同步） —— */

export function stateFromHistory(
  moves: Move[],
  upto?: number,
  init?: Partial<GameConfig>,
): GameState {
  let s = initialGame(init);
  const n = upto == null ? moves.length : Math.min(upto, moves.length);
  for (let i = 0; i < n; i++) {
    const m = moves[i];
    if (m.payload.type === "resign") {
      s = applyResign(s, m.player);
    } else if (m.payload.type === "timeout") {
      s = applyTimeout(s, m.player);
    } else {
      const r = applyPayload(s, m.player, m.payload, m.elapsedMs);
      if (r.ok && r.state) s = r.state;
    }
  }
  return s;
}

/* —— 旧版兼容工具：把可能缺字段的局面补齐后使用 —— */
export function ensuredState(state: GameState): GameState {
  return normalizeState(state);
}

export { normalizeConfig, normalizeState };

export function isCell(v: Vec, x: number, y: number): boolean {
  return v.x === x && v.y === y;
}

export { MAX_ANCHORS };
