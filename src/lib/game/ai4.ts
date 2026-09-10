/* 步步为营 —— 四人围坐 AI（编辑部四档）
 * 四人局不再是双人零和（任一席率先抵线即终局），Negamax 结构不再适用，
 * 改用「竞速 + 拦截」策略族，全部基于 BFS 归途与挡板探针：
 *   1 学徒：最短路捡字，偶尔（16%）随手放板拦人
 *   2 排字师：贪心 —— 落后时评估候选墙，延长领先者的最短归途
 *   3 总编：候选墙全量评估 + 领先者一步应手校验（拦得住才算数）
 *   4 社长：兼顾第二威胁、终局竞速精判、贴身紧急拦截
 * 探针：挡板位图设位 → 四席 BFS → 还原（无副作用，可高频调用）。
 */

import type { AiLevel, GameState, MovePayload, Orientation, Player, Vec, AiDecision, Wall } from "./types";
import { hasWonCell } from "./types";
import {
  activePlayers,
  bfsDistanceToGoal,
  boardSize,
  buildWallGrids,
  checkWall,
  edgeBlockedG,
  isEliminated,
  legalPawnMoves,
  pawnOf,
  wallsLeftOf,
  wallConflicts,
} from "./engine";

/* —— 语气标签（与 ai.ts 的二人版文案同族） —— */
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

interface WallCand {
  x: number;
  y: number;
  o: Orientation;
}

/* —— 某席最短归途的路径边序列（局部 BFS，独立缓冲） —— */
const _pDist = new Int16Array(169);
const _pParent = new Int16Array(169);
const _pQueue = new Int16Array(169);

function goalOf(p: Player, N: number): { axisX: boolean; v: number } {
  if (p === "A") return { axisX: false, v: 0 };
  if (p === "B") return { axisX: false, v: N - 1 };
  if (p === "C") return { axisX: true, v: N - 1 };
  return { axisX: true, v: 0 };
}

function pathEdges(state: GameState, p: Player, grids: { h: Uint8Array; v: Uint8Array }): Array<[Vec, Vec]> {
  const N = boardSize(state);
  const gl = goalOf(p, N);
  const from = pawnOf(state, p);
  if (gl.axisX ? from.x === gl.v : from.y === gl.v) return [];
  _pDist.fill(-1, 0, N * N);
  _pParent.fill(-1, 0, N * N);
  const start = from.y * N + from.x;
  _pDist[start] = 0;
  let head = 0;
  let tail = 0;
  _pQueue[tail++] = start;
  let goalIdx = -1;
  while (head < tail) {
    const cur = _pQueue[head++];
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
      const ni = ny * N + nx;
      if (_pDist[ni] >= 0) continue;
      if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
      _pDist[ni] = _pDist[cur] + 1;
      _pParent[ni] = cur;
      _pQueue[tail++] = ni;
    }
  }
  if (goalIdx < 0) return [];
  const edges: Array<[Vec, Vec]> = [];
  let cur = goalIdx;
  while (_pParent[cur] !== -1) {
    const prev = _pParent[cur];
    const px = prev % N;
    const py = (prev - px) / N;
    const cx = cur % N;
    const cy = (cur - cx) / N;
    edges.unshift([
      { x: px, y: py },
      { x: cx, y: cy },
    ]);
    cur = prev;
  }
  return edges;
}

/* —— 由路径边推导能拦住它的挡板锚点 —— */
function candidatesFromEdges(edges: Array<[Vec, Vec]>, N: number): WallCand[] {
  const seen = new Set<string>();
  const out: WallCand[] = [];
  const push = (x: number, y: number, o: Orientation) => {
    if (x < 0 || x > N - 2 || y < 0 || y > N - 2) return;
    const key = `${x},${y},${o}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ x, y, o });
  };
  for (const [a, b] of edges) {
    if (b.y === a.y - 1) {
      // 上行：H 锚 (a.x, b.y) / (a.x-1, b.y)
      push(a.x, b.y, "h");
      push(a.x - 1, b.y, "h");
    } else if (b.y === a.y + 1) {
      // 下行：H 锚 (a.x, a.y) / (a.x-1, a.y)
      push(a.x, a.y, "h");
      push(a.x - 1, a.y, "h");
    } else if (b.x === a.x + 1) {
      // 右行：V 锚 (a.x, a.y) / (a.x, a.y-1)
      push(a.x, a.y, "v");
      push(a.x, a.y - 1, "v");
    } else if (b.x === a.x - 1) {
      // 左行：V 锚 (b.x, a.y) / (b.x, a.y-1)
      push(b.x, a.y, "v");
      push(b.x, a.y - 1, "v");
    }
  }
  return out;
}

/* —— 挡板探针：设位 → 四席 BFS → 还原 —— */
interface ProbeResult {
  gains: Map<Player, number>; // 各席归途增量（正 = 被拉长）
  legal: boolean; // 在场各席仍有路
}

function probeWall(
  grids: { h: Uint8Array; v: Uint8Array },
  c: WallCand,
  state: GameState,
  actives: Player[],
  before: Map<Player, number>,
  N: number,
): ProbeResult | null {
  const W = N - 1;
  const idx = c.y * W + c.x;
  const grid = c.o === "h" ? grids.h : grids.v;
  if (grid[idx]) return null; // 冲突（双保险）
  grid[idx] = 1;
  const gains = new Map<Player, number>();
  let legal = true;
  for (const q of actives) {
    const d = bfsDistanceToGoal(grids, pawnOf(state, q), q, N);
    if (d < 0) {
      legal = false;
      break;
    }
    gains.set(q, d - (before.get(q) ?? 0));
  }
  grid[idx] = 0;
  if (!legal) return null;
  return { gains, legal };
}

/* —— 推进：合法着法中选归途最短者 —— */
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

/* —— 兜底：放一块任何合法的板（极罕见：无子可动） —— */
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
  _opts?: { budgetMs?: number },
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
    };
  }

  const actives = activePlayers(state);
  const others = actives.filter((p) => p !== me);
  if (others.length === 0) return null;

  const grids = buildWallGrids(state.walls, N);
  const before = new Map<Player, number>();
  for (const p of actives) {
    before.set(p, bfsDistanceToGoal(grids, pawnOf(state, p), p, N));
  }
  const myDist = before.get(me) ?? Infinity;
  const opps = others
    .map((p) => ({ p, d: before.get(p) ?? Infinity, walls: wallsLeftOf(state, p) }))
    .sort((a, b) => a.d - b.d);
  const leader = opps[0];
  const second = opps[1];
  const myWalls = wallsLeftOf(state, me);

  /* 2. 竞速判定：领先足够多、或对手已无板可拦 → 直接推进 */
  const oppCanBlock = opps.some((o) => o.walls > 0);
  const margin = level >= 4 ? 2 : level === 3 ? 1 : 0;
  const racing = myDist < leader.d - margin || (myDist <= leader.d && !oppCanBlock);

  /* 3. 学徒：最短路 + 偶尔随手放板 */
  if (level === 1) {
    if (myWalls > 0 && !racing && Math.random() < 0.16) {
      const edges = pathEdges(state, leader.p, grids);
      const cands = candidatesFromEdges(edges, N).filter(
        (c) => !wallConflicts(state.walls, c.x, c.y, c.o),
      );
      if (cands.length > 0) {
        const c = cands[Math.floor(Math.random() * cands.length)];
        return {
          payload: { type: "wall", wall: { x: c.x, y: c.y, o: c.o, by: me } },
          label: WALL_LABEL[level],
        };
      }
    }
    return bestAdvance(state, me, level) ?? anyWall(state, me, level);
  }

  /* 4. 拦截评估（排字师 / 总编 / 社长） */
  if (myWalls > 0 && !racing) {
    const cap = level >= 4 ? 36 : level === 3 ? 26 : 14;
    const cands: WallCand[] = [];
    const seen = new Set<string>();
    const takeFrom = (p: Player, limit: number) => {
      const edges = pathEdges(state, p, grids);
      const list = candidatesFromEdges(edges, N);
      for (const c of list) {
        if (cands.length >= cap) break;
        const key = `${c.x},${c.y},${c.o}`;
        if (seen.has(key)) continue;
        if (wallConflicts(state.walls, c.x, c.y, c.o)) continue;
        seen.add(key);
        cands.push(c);
        if (cands.length >= limit) break;
      }
    };
    takeFrom(leader.p, cap);
    if (level >= 3 && second && second.d <= leader.d + 2) {
      takeFrom(second.p, cap + 12);
    }

    let bestCand: WallCand | null = null;
    let bestScore = -Infinity;
    let bestGainLeader = 0;
    for (const c of cands) {
      const probe = probeWall(grids, c, state, actives, before, N);
      if (!probe) continue;
      const gainLeader = probe.gains.get(leader.p) ?? 0;
      let gainOthers = 0;
      for (const o of opps) {
        if (o.p !== leader.p) gainOthers += probe.gains.get(o.p) ?? 0;
      }
      const harmMe = probe.gains.get(me) ?? 0;
      let score = 2 * gainLeader + gainOthers - 3 * Math.max(0, harmMe);
      if (level >= 3) {
        // 应手校验：领先者走一步后与我（也走一步）的归途差
        const afterLeader = (before.get(leader.p) ?? 0) + gainLeader - 1;
        const afterMe = myDist + harmMe - 1;
        const parity = afterLeader - afterMe;
        score += parity > 0 ? 4 : parity < 0 ? -2 : 0;
        if (level >= 4 && second && second.d <= leader.d + 2) {
          score += Math.max(0, probe.gains.get(second.p) ?? 0);
        }
      }
      // 紧急拦截：领先者只剩 1-2 步
      if (leader.d <= 2) score += 3;
      // 出界惩罚已由 probe 合法性保证；随机微扰避免机械重复
      score += Math.random() * 0.3;
      if (score > bestScore) {
        bestScore = score;
        bestCand = c;
        bestGainLeader = gainLeader;
      }
    }

    const minGain = leader.d <= 2 ? 1 : 2;
    const minScore = level === 2 ? 3 : 2;
    if (bestCand && bestScore >= minScore && bestGainLeader >= minGain) {
      const wall: Wall = { x: bestCand.x, y: bestCand.y, o: bestCand.o, by: me };
      return { payload: { type: "wall", wall }, label: WALL_LABEL[level] };
    }
  }

  /* 5. 推进 */
  return bestAdvance(state, me, level) ?? anyWall(state, me, level);
}
