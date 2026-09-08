/* 步步为营 —— AI 对手三档（编辑职位命名）
 * 1 学徒：最短路径 + 偶尔随机放板
 * 2 排字师：贪心，比较双方最短路径差，落后时沿对方最短路放板延长其归途
 * 3 总编：Negamax（Minimax 变体）+ α-β 剪枝 + 迭代加深（2→4 层，时间预算内），
 *         评估项：路径差、挡板剩余价值、机动空间。在 Web Worker 中运行，不阻塞 UI。
 */

import {
  AiLevel,
  GameState,
  MovePayload,
  Orientation,
  Player,
  Vec,
  goalRow,
  opponent,
} from "./types";
import {
  bfsDistanceToGoal,
  buildWallGrids,
  checkWall,
  edgeBlockedG,
  legalPawnMoves,
  shortestPathStep,
  wallConflicts,
} from "./engine";

export interface AiDecision {
  payload: MovePayload;
  label: string;
}

/* ============ 可变搜索核心（do/undo，避免复制状态） ============ */

interface Core {
  h: Uint8Array;
  v: Uint8Array;
  posA: Vec;
  posB: Vec;
  wallsA: number;
  wallsB: number;
}

function toCore(state: GameState): Core {
  const g = buildWallGrids(state.walls);
  return {
    h: g.h,
    v: g.v,
    posA: { ...state.posA },
    posB: { ...state.posB },
    wallsA: state.wallsA,
    wallsB: state.wallsB,
  };
}

function coreDist(c: Core, p: Player): number {
  return bfsDistanceToGoal(
    { h: c.h, v: c.v },
    p === "A" ? c.posA : c.posB,
    p,
  );
}

/* 试放一块挡板（不落位），返回双方新距离；pathCut 为任一方无路 */
function coreProbeWall(
  c: Core,
  x: number,
  y: number,
  o: Orientation,
): { dA: number; dB: number; pathCut: boolean } {
  const idx = o === "h" ? y * 8 + x : y * 8 + x;
  const grid = o === "h" ? c.h : c.v;
  const was = grid[idx];
  grid[idx] = 1;
  const dA = bfsDistanceToGoal({ h: c.h, v: c.v }, c.posA, "A");
  const dB = bfsDistanceToGoal({ h: c.h, v: c.v }, c.posB, "B");
  grid[idx] = was;
  return { dA, dB, pathCut: dA < 0 || dB < 0 };
}

function coreSetWall(c: Core, x: number, y: number, o: Orientation) {
  if (o === "h") c.h[y * 8 + x] = 1;
  else c.v[y * 8 + x] = 1;
}

function coreUnsetWall(c: Core, x: number, y: number, o: Orientation) {
  if (o === "h") c.h[y * 8 + x] = 0;
  else c.v[y * 8 + x] = 0;
}

/* 基于 core 的棋子合法着法（含直跳/斜跳） */
function coreLegalPawnMoves(c: Core, p: Player): Vec[] {
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
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    if (edgeBlockedG(grids, me.x, me.y, dx, dy)) continue;
    if (op.x === nx && op.y === ny) {
      const jx = me.x + 2 * dx;
      const jy = me.y + 2 * dy;
      const inB = jx >= 0 && jx <= 8 && jy >= 0 && jy <= 8;
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
        if (sx < 0 || sx > 8 || sy < 0 || sy > 8) continue;
        if (edgeBlockedG(grids, nx, ny, px, py)) continue;
        res.push({ x: sx, y: sy });
      }
    } else {
      res.push({ x: nx, y: ny });
    }
  }
  return res;
}

/* ============ 通用工具 ============ */

function inBoundsAnchor(x: number, y: number): boolean {
  return x >= 0 && x <= 7 && y >= 0 && y <= 7;
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

/* ============ 一档：学徒 ============ */

function apprenticeMove(state: GameState): AiDecision {
  const me = state.turn;
  const op = opponent(me);
  const opPos = op === "A" ? state.posA : state.posB;
  const myGrids = buildWallGrids(state.walls);
  const myD = bfsDistanceToGoal(myGrids, me === "A" ? state.posA : state.posB, me);
  const wallsLeft = me === "A" ? state.wallsA : state.wallsB;

  // 偶尔放板（16%）：在对手附近随机挑一块合法且不伤己路的挡板
  if (wallsLeft > 0 && Math.random() < 0.16) {
    for (let attempt = 0; attempt < 14; attempt++) {
      const x = opPos.x + Math.floor(Math.random() * 5) - 2;
      const y = opPos.y + Math.floor(Math.random() * 5) - 2;
      if (!inBoundsAnchor(x, y)) continue;
      const o: Orientation = Math.random() < 0.5 ? "h" : "v";
      if (wallConflicts(state.walls, x, y, o)) continue;
      const probe = coreProbeWall(toCore(state), x, y, o);
      if (probe.pathCut) continue;
      const newMyD = me === "A" ? probe.dA : probe.dB;
      if (newMyD > myD) continue; // 学徒虽笨，不至于自断
      return {
        payload: { type: "wall", wall: { x, y, o, by: me } },
        label: "学徒随手排了一根铅条",
      };
    }
  }

  const step = shortestPathStep(state, me);
  if (step) {
    return {
      payload: {
        type: "pawn",
        from: me === "A" ? state.posA : state.posB,
        to: step,
      },
      label: "学徒循最短路径捡字",
    };
  }
  return fallbackDecision(state, me);
}

/* ============ 二档：排字师 ============ */

/* 求某方最短路径经过的所有格点边，返回挡住该边可用的锚点集合 */
function pathEdges(state: GameState, p: Player): Array<{ x: number; y: number; dx: number; dy: number }> {
  const grids = buildWallGrids(state.walls);
  const from = p === "A" ? state.posA : state.posB;
  const goal = goalRow(p);
  if (from.y === goal) return [];
  const dist = new Int16Array(81).fill(-1);
  const parent = new Int16Array(81).fill(-1);
  const queue: number[] = [];
  const start = from.y * 9 + from.x;
  dist[start] = 0;
  queue.push(start);
  let goalIdx = -1;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const cx = cur % 9;
    const cy = (cur - cx) / 9;
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
      if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
      if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
      const ni = ny * 9 + nx;
      if (dist[ni] >= 0) continue;
      dist[ni] = dist[cur] + 1;
      parent[ni] = cur;
      queue.push(ni);
    }
  }
  const edges: Array<{ x: number; y: number; dx: number; dy: number }> = [];
  if (goalIdx < 0) return edges;
  let cur = goalIdx;
  while (parent[cur] !== -1) {
    const prev = parent[cur];
    const px = prev % 9;
    const py = (prev - px) / 9;
    const cx = cur % 9;
    const cy = (cur - cx) / 9;
    edges.push({ x: px, y: py, dx: cx - px, dy: cy - py });
    cur = prev;
  }
  return edges;
}

function typesetterMove(state: GameState): AiDecision {
  const me = state.turn;
  const op = opponent(me);
  const myD = coreDist(toCore(state), me);
  const opD = coreDist(toCore(state), op);
  const wallsLeft = me === "A" ? state.wallsA : state.wallsB;

  if (wallsLeft > 0 && (myD > opD || opD <= 2)) {
    // 收集对手最短路径上的边，推导可阻断它的挡板锚点
    const anchors = new Set<string>();
    for (const e of pathEdges(state, op)) {
      if (e.dy !== 0) {
        const wy = e.dy === 1 ? e.y : e.y - 1;
        anchors.add(`${e.x},${wy},h`);
        if (e.x > 0) anchors.add(`${e.x - 1},${wy},h`);
      } else {
        const wx = e.dx === 1 ? e.x : e.x - 1;
        anchors.add(`${wx},${e.y},v`);
        if (e.y > 0) anchors.add(`${wx},${e.y - 1},v`);
      }
    }
    let best: { x: number; y: number; o: Orientation; gain: number } | null = null;
    for (const key of anchors) {
      const [xs, ys, os] = key.split(",");
      const x = +xs;
      const y = +ys;
      const o = os as Orientation;
      if (wallConflicts(state.walls, x, y, o)) continue;
      const probe = coreProbeWall(toCore(state), x, y, o);
      if (probe.pathCut) continue;
      const newOpD = op === "A" ? probe.dA : probe.dB;
      const newMyD = me === "A" ? probe.dA : probe.dB;
      const gain = newOpD - opD - (newMyD - myD);
      if (gain > 0 && (!best || gain > best.gain)) {
        best = { x, y, o, gain };
      }
    }
    if (best && (best.gain >= 1 || opD <= 2)) {
      return {
        payload: { type: "wall", wall: { x: best.x, y: best.y, o: best.o, by: me } },
        label: "排字师延长了你的归途",
      };
    }
  }

  const step = shortestPathStep(state, me);
  if (step) {
    return {
      payload: {
        type: "pawn",
        from: me === "A" ? state.posA : state.posB,
        to: step,
      },
      label: "排字师沿最短路赶稿",
    };
  }
  return fallbackDecision(state, me);
}

/* ============ 三档：总编（Negamax + α-β + 迭代加深） ============ */

const EVAL_WIN = 100000;
const WALL_VALUE = 0.3;
const MOB_VALUE = 0.12;

class SearchAbort extends Error {}

let searchDeadline = 0;
let nodesVisited = 0;

function evaluate(c: Core, me: Player, ply: number): number {
  const dA = bfsDistanceToGoal({ h: c.h, v: c.v }, c.posA, "A");
  const dB = bfsDistanceToGoal({ h: c.h, v: c.v }, c.posB, "B");
  const myD = me === "A" ? dA : dB;
  const opD = me === "A" ? dB : dA;
  if (myD === 0) return EVAL_WIN - ply;
  if (opD === 0) return -EVAL_WIN + ply;
  if (myD < 0 || opD < 0) return -EVAL_WIN + ply; // 视作非法（断路）局面
  const myWalls = me === "A" ? c.wallsA : c.wallsB;
  const opWalls = me === "A" ? c.wallsB : c.wallsA;
  const myMob = coreLegalPawnMoves(c, me).length;
  const opMob = coreLegalPawnMoves(c, opponent(me)).length;
  return (opD - myD) + WALL_VALUE * (myWalls - opWalls) + MOB_VALUE * (myMob - opMob);
}

interface Candidate {
  payload: MovePayload;
  score: number; // 排序启发
}

function genCandidates(c: Core, p: Player, strict: boolean, wallLimit: number): Candidate[] {
  const out: Candidate[] = [];
  const me = p === "A" ? c.posA : c.posB;
  const op = p === "A" ? c.posB : c.posA;
  const goal = goalRow(p);

  // 棋子着法：朝目标方向优先；跳子（位移 2）优先
  for (const to of coreLegalPawnMoves(c, p)) {
    const toward = Math.abs(me.y - goal) - Math.abs(to.y - goal);
    const jump = Math.abs(to.x - me.x) + Math.abs(to.y - me.y) >= 2 ? 2 : 0;
    out.push({ payload: { type: "pawn", from: { ...me }, to: { ...to } }, score: toward + jump });
  }

  const wallsLeft = p === "A" ? c.wallsA : c.wallsB;
  if (wallsLeft > 0) {
    const seen = new Set<string>();
    const consider = (x: number, y: number, o: Orientation) => {
      if (!inBoundsAnchor(x, y)) return;
      const key = `${x},${y},${o}`;
      if (seen.has(key)) return;
      seen.add(key);
      // 冲突快查
      if (o === "h") {
        if (c.h[y * 8 + x]) return;
        if (x > 0 && c.h[y * 8 + x - 1]) return;
        if (x < 7 && c.h[y * 8 + x + 1]) return;
        if (c.v[y * 8 + x]) return;
      } else {
        if (c.v[y * 8 + x]) return;
        if (y > 0 && c.v[(y - 1) * 8 + x]) return;
        if (y < 7 && c.v[(y + 1) * 8 + x]) return;
        if (c.h[y * 8 + x]) return;
      }
      const nearOpp =
        (Math.abs(x - op.x) <= 2 && Math.abs(y - op.y) <= 2 ? 4 : 0) +
        (Math.abs(x - me.x) <= 1 && Math.abs(y - me.y) <= 1 ? 2 : 0);
      out.push({
        payload: { type: "wall", wall: { x, y, o, by: p } },
        score: nearOpp,
      });
    };
    // 对手周边窗口 + 双方目标走廊
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        consider(op.x + dx, op.y + dy, "h");
        consider(op.x + dx, op.y + dy, "v");
      }
    }
    for (let dx = -1; dx <= 1; dx++) {
      consider(me.x + dx, me.y - 2, "h");
      consider(me.x + dx, me.y + 2, "h");
    }
  }

  // 严格模式（根节点）：验证挡板合法性（不断路）
  let wallCount = 0;
  const filtered: Candidate[] = [];
  const sorted = out.sort((a, b) => b.score - a.score);
  for (const cand of sorted) {
    if (cand.payload.type === "wall") {
      if (wallCount >= wallLimit) continue;
      const w = cand.payload.wall;
      if (strict) {
        const probe = coreProbeWall(c, w.x, w.y, w.o);
        if (probe.pathCut) continue;
      }
      wallCount++;
      filtered.push(cand);
    } else {
      filtered.push(cand);
    }
  }
  return filtered;
}

function negamax(
  c: Core,
  ply: number,
  depth: number,
  alpha: number,
  beta: number,
  me: Player,
): number {
  nodesVisited++;
  if ((nodesVisited & 511) === 0 && Date.now() > searchDeadline) throw new SearchAbort();
  if (depth === 0) return evaluate(c, me, ply);

  const p = ply % 2 === 0 ? me : opponent(me);
  const cands = genCandidates(c, p, false, 8);
  if (cands.length === 0) return evaluate(c, me, ply);

  if (p === me) {
    let best = -Infinity;
    for (const cand of cands) {
      if (cand.payload.type === "pawn") {
        const target = cand.payload.to;
        const key = p === "A" ? "posA" : "posB";
        const old = { ...c[key] };
        c[key] = { ...target };
        const val = negamax(c, ply + 1, depth - 1, alpha, beta, me);
        c[key] = old;
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      } else {
        const w = cand.payload.wall;
        coreSetWall(c, w.x, w.y, w.o);
        if (p === "A") c.wallsA--; else c.wallsB--;
        const val = negamax(c, ply + 1, depth - 1, alpha, beta, me);
        coreUnsetWall(c, w.x, w.y, w.o);
        if (p === "A") c.wallsA++; else c.wallsB++;
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
    }
    return best === -Infinity ? evaluate(c, me, ply) : best;
  } else {
    let best = Infinity;
    for (const cand of cands) {
      if (cand.payload.type === "pawn") {
        const target = cand.payload.to;
        const key = p === "A" ? "posA" : "posB";
        const old = { ...c[key] };
        c[key] = { ...target };
        const val = negamax(c, ply + 1, depth - 1, alpha, beta, me);
        c[key] = old;
        if (val < best) best = val;
        if (best < beta) beta = best;
        if (alpha >= beta) break;
      } else {
        const w = cand.payload.wall;
        coreSetWall(c, w.x, w.y, w.o);
        if (p === "A") c.wallsA--; else c.wallsB--;
        const val = negamax(c, ply + 1, depth - 1, alpha, beta, me);
        coreUnsetWall(c, w.x, w.y, w.o);
        if (p === "A") c.wallsA++; else c.wallsB++;
        if (val < best) best = val;
        if (best < beta) beta = best;
        if (alpha >= beta) break;
      }
    }
    return best === Infinity ? evaluate(c, me, ply) : best;
  }
}

function chiefEditorMove(state: GameState): AiDecision {
  const me = state.turn;
  const c = toCore(state);
  nodesVisited = 0;
  searchDeadline = Date.now() + 420;

  let cands = genCandidates(c, me, true, 14);
  if (cands.length === 0) return fallbackDecision(state, me);

  let bestPayload: MovePayload = cands[0].payload;
  let bestScore = -Infinity;

  for (let depth = 2; depth <= 4; depth++) {
    // 迭代加深：上一轮最优置于队首（利用 α-β 剪枝与历史启发）
    cands = [
      ...cands.filter((x) => x.payload === bestPayload),
      ...cands.filter((x) => x.payload !== bestPayload),
    ];
    let localBest: MovePayload | null = null;
    let localScore = -Infinity;
    let alpha = -Infinity;
    try {
      for (const cand of cands) {
        let val: number;
        if (cand.payload.type === "pawn") {
          const key = me === "A" ? "posA" : "posB";
          const old = { ...c[key] };
          c[key] = { ...cand.payload.to };
          val = negamax(c, 1, depth - 1, alpha, Infinity, me);
          c[key] = old;
        } else {
          const w = cand.payload.wall;
          coreSetWall(c, w.x, w.y, w.o);
          if (me === "A") c.wallsA--; else c.wallsB--;
          val = negamax(c, 1, depth - 1, alpha, Infinity, me);
          coreUnsetWall(c, w.x, w.y, w.o);
          if (me === "A") c.wallsA++; else c.wallsB++;
        }
        if (val > localScore) {
          localScore = val;
          localBest = cand.payload;
        }
        if (localScore > alpha) alpha = localScore;
      }
    } catch (e) {
      if (e instanceof SearchAbort) {
        // 深度未完成：仅采信已完整算完的深度（首轮至少采信排序首位）
        if (localBest && depth === 2) {
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
    }
    if (bestScore > EVAL_WIN / 2) break; // 已见必胜
    if (Date.now() > searchDeadline) break;
  }

  return {
    payload: bestPayload,
    label: bestPayload.type === "wall" ? "总编落下一道版式" : "总编审定了去路",
  };
}

/* ============ 兜底 ============ */

function fallbackDecision(state: GameState, me: Player): AiDecision {
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
    for (let x = 0; x <= 7; x++) {
      for (let y = 0; y <= 7; y++) {
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

export function computeAiMove(state: GameState, level: AiLevel): AiDecision | null {
  if (state.winner) return null;
  const s = cloneState(state);
  try {
    if (level === 1) return apprenticeMove(s);
    if (level === 2) return typesetterMove(s);
    return chiefEditorMove(s);
  } catch (e) {
    console.error("AI 计算异常，使用兜底", e);
    return fallbackDecision(s, s.turn);
  }
}
