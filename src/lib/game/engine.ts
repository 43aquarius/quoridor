/* 步步为营 —— 规则引擎（纯函数，无副作用，完全可序列化）
 * 挡板合法性：不可重叠（共用凹槽）、不可十字交叉；放置后双方必须仍有路可通（BFS 校验）。
 * 跳子：两子正面相邻时不可走入对方格；身后无阻可直跳；直跳被堵时可斜跳至斜后方两格。
 */

import {
  GameState,
  Move,
  MovePayload,
  Player,
  Vec,
  Wall,
  goalRow,
  initialGame,
  opponent,
  pawnNotation,
  resignNotation,
  wallNotation,
} from "./types";
import type { Orientation } from "./types";

const DIRS: Array<[number, number]> = [
  [0, -1], // 上
  [0, 1], // 下
  [-1, 0], // 左
  [1, 0], // 右
];

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

/* —— 挡板格线（快查位图） —— */

export function buildWallGrids(walls: Wall[]): {
  h: Uint8Array;
  v: Uint8Array;
} {
  const h = new Uint8Array(64);
  const v = new Uint8Array(64);
  for (const w of walls) {
    if (w.o === "h") h[w.y * 8 + w.x] = 1;
    else v[w.y * 8 + w.x] = 1;
  }
  return { h, v };
}

/* 判断棋子从 (x,y) 向 (dx,dy) 走一格是否被挡板拦住 */
export function edgeBlockedG(
  g: { h: Uint8Array; v: Uint8Array },
  x: number,
  y: number,
  dx: number,
  dy: number,
): boolean {
  if (dy === -1) {
    // 上行 = (x, y-1) 的下缘；H 锚 x∈{x-1, x}，注意 x=8 时 H(x,·) 不存在（防索引回卷）
    return !!((x <= 7 && g.h[(y - 1) * 8 + x]) || (x > 0 && g.h[(y - 1) * 8 + x - 1]));
  }
  if (dy === 1) {
    return !!((x <= 7 && g.h[y * 8 + x]) || (x > 0 && g.h[y * 8 + x - 1]));
  }
  if (dx === 1) {
    // 右行 = (x, y) 的右缘；V 锚 (x, y-1..y)
    return !!((y <= 7 && g.v[y * 8 + x]) || (y > 0 && g.v[(y - 1) * 8 + x]));
  }
  if (dx === -1) {
    return !!((y <= 7 && g.v[y * 8 + x - 1]) || (y > 0 && g.v[(y - 1) * 8 + x - 1]));
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

/* —— BFS：求某方当前位置到其目标行的最短步数（把对手视作可跳越/可让开，忽略其占位） —— */

const _dist = new Int16Array(81);
const _queue = new Int8Array(81);
const _seen = new Uint8Array(81);

export function bfsDistanceToGoal(
  grids: { h: Uint8Array; v: Uint8Array },
  from: Vec,
  p: Player,
): number {
  const goal = goalRow(p);
  if (from.y === goal) return 0;
  _dist.fill(-1);
  _seen.fill(0);
  const start = from.y * 9 + from.x;
  _dist[start] = 0;
  _seen[start] = 1;
  let head = 0;
  let tail = 0;
  _queue[tail++] = start;
  while (head < tail) {
    const cur = _queue[head++];
    const cx = cur % 9;
    const cy = (cur - cx) / 9;
    const d = _dist[cur];
    if (cy === goal) return d;
    for (let i = 0; i < 4; i++) {
      const dx = i === 3 ? 1 : i === 2 ? -1 : 0;
      const dy = i === 1 ? 1 : i === 0 ? -1 : 0;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
      if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
      const ni = ny * 9 + nx;
      if (_seen[ni]) continue;
      _seen[ni] = 1;
      _dist[ni] = d + 1;
      _queue[tail++] = ni;
    }
  }
  return -1; // 无路
}

export function shortestPathLength(state: GameState, p: Player): number {
  const grids = buildWallGrids(state.walls);
  return bfsDistanceToGoal(grids, p === "A" ? state.posA : state.posB, p);
}

export function hasPath(state: GameState, p: Player): boolean {
  return shortestPathLength(state, p) >= 0;
}

/* 最短路径的下一步（供 AI 与提示使用）；无路时返回 null */
export function shortestPathStep(state: GameState, p: Player): Vec | null {
  const grids = buildWallGrids(state.walls);
  const from = p === "A" ? state.posA : state.posB;
  const goal = goalRow(p);
  if (from.y === goal) return null;
  // 从起点 BFS，记录父节点
  _dist.fill(-1);
  _seen.fill(0);
  const parent = new Int16Array(81).fill(-1);
  const start = from.y * 9 + from.x;
  _dist[start] = 0;
  _seen[start] = 1;
  let head = 0;
  let tail = 0;
  _queue[tail++] = start;
  let goalIdx = -1;
  while (head < tail) {
    const cur = _queue[head++];
    const cx = cur % 9;
    const cy = (cur - cx) / 9;
    if (cy === goal) {
      goalIdx = cur;
      break;
    }
    for (let i = 0; i < 4; i++) {
      const dx = i === 3 ? 1 : i === 2 ? -1 : 0;
      const dy = i === 1 ? 1 : i === 0 ? -1 : 0;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
      if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
      const ni = ny * 9 + nx;
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
  const x = cur % 9;
  const y = (cur - x) / 9;
  return { x, y };
}

/* —— 合法着法 —— */

export function legalPawnMoves(state: GameState, p: Player): Vec[] {
  const me = p === "A" ? state.posA : state.posB;
  const op = p === "A" ? state.posB : state.posA;
  const res: Vec[] = [];
  for (const [dx, dy] of DIRS) {
    const nx = me.x + dx;
    const ny = me.y + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    if (edgeBlocked(state.walls, me.x, me.y, dx, dy)) continue;
    if (op.x === nx && op.y === ny) {
      // 正面相邻：直跳
      const jx = me.x + 2 * dx;
      const jy = me.y + 2 * dy;
      const straightInBounds = jx >= 0 && jx <= 8 && jy >= 0 && jy <= 8;
      const straightClear =
        straightInBounds && !edgeBlocked(state.walls, nx, ny, dx, dy);
      if (straightClear) {
        res.push({ x: jx, y: jy });
        continue;
      }
      // 直跳被堵（或出界）：斜跳至对手左右两侧
      const perps: Array<[number, number]> =
        dx !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      for (const [px, py] of perps) {
        const sx = nx + px;
        const sy = ny + py;
        if (sx < 0 || sx > 8 || sy < 0 || sy > 8) continue;
        if (edgeBlocked(state.walls, nx, ny, px, py)) continue;
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
  if (x < 0 || x > 7 || y < 0 || y > 7) return { ok: false, reason: "out-of-bounds" };
  const left = by === "A" ? state.wallsA : state.wallsB;
  if (left <= 0) return { ok: false, reason: "no-walls" };
  const conflict = wallConflictType(state.walls, x, y, o);
  if (conflict === "overlap") return { ok: false, reason: "overlap" };
  if (conflict === "cross") return { ok: false, reason: "cross" };
  // BFS：双方仍须各有一条通路
  const grids = buildWallGrids(state.walls);
  if (o === "h") grids.h[y * 8 + x] = 1;
  else grids.v[y * 8 + x] = 1;
  if (bfsDistanceToGoal(grids, state.posA, "A") < 0) return { ok: false, reason: "no-path" };
  if (bfsDistanceToGoal(grids, state.posB, "B") < 0) return { ok: false, reason: "no-path" };
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

  let next: GameState;
  let notation: string;
  if (payload.type === "pawn") {
    const legal = legalPawnMoves(state, player);
    if (!legal.some((v) => v.x === payload.to.x && v.y === payload.to.y)) {
      return { ok: false, reason: "illegal-pawn" };
    }
    next = { ...state };
    if (player === "A") next.posA = { ...payload.to };
    else next.posB = { ...payload.to };
    notation = pawnNotation(payload.from, payload.to);
    // 胜负
    if (payload.to.y === goalRow(player)) {
      next.winner = player;
      next.winReason = "goal";
    }
  } else {
    const chk = checkWall(state, payload.wall.x, payload.wall.y, payload.wall.o, player);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    notation = wallNotation(payload.wall);
    next = {
      ...state,
      walls: [...state.walls, payload.wall],
    };
    if (player === "A") next.wallsA = state.wallsA - 1;
    else next.wallsB = state.wallsB - 1;
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
  next.turn = opponent(player);
  return { ok: true, state: next };
}

export function applyResign(state: GameState, player: Player): GameState {
  const next: GameState = {
    ...state,
    winner: opponent(player),
    winReason: "resign",
    history: [
      ...state.history,
      {
        n: state.history.length + 1,
        player,
        notation: resignNotation(player),
        elapsedMs: 0,
        t: Date.now(),
        payload: { type: "resign" } as unknown as MovePayload,
      },
    ],
  };
  return next;
}

/* —— 序列化回放：由着法列表重建局面（驱动悔棋 / 回放 / 在线重连同步） —— */

export function stateFromHistory(moves: Move[], upto?: number): GameState {
  let s = initialGame();
  const n = upto == null ? moves.length : Math.min(upto, moves.length);
  for (let i = 0; i < n; i++) {
    const m = moves[i];
    if (m.payload.type === "resign") {
      s = applyResign(s, m.player);
    } else {
      const r = applyPayload(s, m.player, m.payload, m.elapsedMs);
      if (r.ok && r.state) s = r.state;
    }
  }
  return s;
}

export function isCell(v: Vec, x: number, y: number): boolean {
  return v.x === x && v.y === y;
}
