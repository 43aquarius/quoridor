/* 步步为营 —— 四人围坐 AI（编辑部四档）
 * 四人局不再是双人零和（任一席率先抵线即终局），Negamax 结构不再适用，
 * 改用「竞速 + 拦截」策略族，全部基于 BFS 归途与挡板探针：
 *   1 学徒：最短路捡字，出手必是「有用的板」——拦领先者临门一道，不伤己路
 *      （v3：非紧急的随手板增益门槛 2，不再为 +1 边际板挥霍弹药）
 *   2 排字师：贪心 —— 落后时评估候选墙，延长领先者的最短归途（带应手校验，
 *      v3：兼看次威胁廊道）
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

/* ============ 交换后竞速裕度（v4：总编/社长专属） ============
 * 旧贪心只看「这块板拉长领先者多少」，不管放板烧掉的一手节奏——
 * 四人局里白送其他三家半步，实测社长与排字师打平的根源。
 * 裕度模拟：放板后转一圈（各对手推进最优一步，我最后推进），
 * 重算归途，取「最强对手与我」的差；与不放板的同一模拟比较。
 * * 放板后裕度必须严格优于纯竞速基准（> +0.5）才出手——烧节奏的板
 *   一律不放下（紧急拦截天然胜出：基准里领先者转完一圈就赢了，
 *   裕度为极强负值，任何 gain≥2 的板都能赢过它）；
 * * 跳子/撞子不模拟（各席独立推进，估值偏保守，不影响排序）。 */

interface SimStep {
  to: Vec;
  d: number;
}

function simAdvance(
  grids: { h: Uint8Array; v: Uint8Array },
  from: Vec,
  p: Player,
  N: number,
  occupied: Set<number>,
): SimStep {
  const cur = bfsDistanceToGoal(grids, from, p, N);
  let best: SimStep = { to: from, d: cur };
  for (let i = 0; i < 4; i++) {
    const dx = i === 3 ? 1 : i === 2 ? -1 : 0;
    const dy = i === 1 ? 1 : i === 0 ? -1 : 0;
    const nx = from.x + dx;
    const ny = from.y + dy;
    if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
    if (edgeBlockedG(grids, from.x, from.y, dx, dy)) continue;
    const ni = ny * N + nx;
    if (occupied.has(ni)) continue;
    const d = bfsDistanceToGoal(grids, { x: nx, y: ny }, p, N);
    if (d >= 0 && d < best.d) best = { to: { x: nx, y: ny }, d };
  }
  return best;
}

function exchangeMargin(
  state: GameState,
  me: Player,
  actives: Player[],
  N: number,
  wall: WallCand | null,
): number {
  const W = N - 1;
  const grids0 = buildWallGrids(state.walls, N);
  const h2 = wall ? Uint8Array.from(grids0.h) : grids0.h;
  const v2 = wall ? Uint8Array.from(grids0.v) : grids0.v;
  if (wall) {
    const idx = wall.y * W + wall.x;
    (wall.o === "h" ? h2 : v2)[idx] = 1;
  }
  const grids = { h: h2, v: v2 };
  const pos = new Map<Player, Vec>();
  for (const p of actives) pos.set(p, { ...pawnOf(state, p) });
  const occ = new Set<number>();
  for (const p of actives) occ.add(pawnOf(state, p).y * N + pawnOf(state, p).x);
  /* 对手先转，我最后（保守：我只剩应对空间） */
  for (const p of actives) {
    if (p === me) continue;
    const from = pos.get(p)!;
    const step = simAdvance(grids, from, p, N, occ);
    occ.delete(from.y * N + from.x);
    occ.add(step.to.y * N + step.to.x);
    pos.set(p, step.to);
  }
  const myFrom = pos.get(me)!;
  const myStep = simAdvance(grids, myFrom, me, N, occ);
  pos.set(me, myStep.to);
  const myFinal = bfsDistanceToGoal(grids, myStep.to, me, N);
  let worst = Infinity;
  for (const p of actives) {
    if (p === me) continue;
    const d = bfsDistanceToGoal(grids, pos.get(p)!, p, N);
    const m = d - myFinal;
    if (m < worst) worst = m;
  }
  return worst === Infinity ? 0 : worst;
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

  /* 2. 竞速判定：领先足够多、或对手已无板可拦 → 直接推进
   *    v3：裕度收窄（原 L3=1/L4=2）——四人局实测「领先即冲刺」胜过
   *    「领先 1-2 步还继续放板」：放板烧一手节奏，等于白送对手半步；
   *    社长保留 1 步裕度（配合其更精的板质，领先 1 步时仍可防守性落板） */
  const oppCanBlock = opps.some((o) => o.walls > 0);
  const margin = level >= 4 ? 1 : 0;
  const racing = myDist < leader.d - margin || (myDist <= leader.d && !oppCanBlock);

  /* 3. 学徒：最短路 + 「有用的板」（v3：拦得有用才出手，不再随手乱放；
   *    非紧急的随手板增益门槛 2——与二人局学徒同准则） */
  if (level === 1) {
    if (myWalls > 0 && !racing) {
      /* v6.1：紧急 = 领先者临门（≤3 步）或我被甩开 ≥2 步（半量拦截）。
       * 旧版「落后即拦」在四人局里是每手必拦的板海（minGain 1），
       * 板海意外地强到和高档抛硬币——档位秩序反被破坏；全收窄又会让
       * 学徒反超排字师。临门 + 被甩开才拦 + 25% 随手（增益门槛 2），
       * 「会拦临门道」的人设不变。 */
      const urgent = leader.d <= 3 || leader.d <= myDist - 2;
      if (urgent || Math.random() < 0.25) {
        const minGain = urgent ? 1 : 2;
        const edges = pathEdges(state, leader.p, grids);
        const cands = candidatesFromEdges(edges, N).filter(
          (c) =>
            !wallConflicts(state.walls, c.x, c.y, c.o) &&
            /* 断路校验：不得封死任何活跃玩家的路径（否则非法着法） */
            probeWall(grids, c, state, actives, before, N) !== null,
        );
        /* 挑拉长领先者最多、且不伤（紧急时客忍小伤）己路的板；同好随手挑一块 */
        const harmCap = leader.d <= 2 ? 2 : leader.d <= 3 ? 1 : 0;
        const bests: WallCand[] = [];
        let bestGain = minGain;
        for (const c of cands) {
          const probe = probeWall(grids, c, state, actives, before, N);
          if (!probe) continue;
          const gainLeader = probe.gains.get(leader.p) ?? 0;
          const harmMe = probe.gains.get(me) ?? 0;
          if (gainLeader < bestGain || harmMe > harmCap) continue;
          if (gainLeader > bestGain) {
            bestGain = gainLeader;
            bests.length = 0;
          }
          bests.push(c);
        }
        if (bests.length > 0) {
          const c = bests[Math.floor(Math.random() * bests.length)];
          return {
            payload: { type: "wall", wall: { x: c.x, y: c.y, o: c.o, by: me } },
            label: WALL_LABEL[level],
          };
        }
      }
    }
    return bestAdvance(state, me, level) ?? anyWall(state, me, level);
  }

  /* 4. 拦截评估（排字师 / 总编 / 社长） */
  if (myWalls > 0 && !racing) {
    const cap = level >= 4 ? 48 : level === 3 ? 36 : 22;
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
    if (level >= 2 && second && second.d <= leader.d + 2) {
      /* 次威胁廊道：L2 起都看（L2 不看会被学徒贴脸，4p 实测 5:4）；
       * L3/L4 的真实档差来自平先时的裕度纪律与更宽的窗口 */
      takeFrom(second.p, cap + (level >= 3 ? 12 : 8));
    }

    /* v3：硬性自伤上限（与学徒同标准）。旧版只有 -3×harmMe 软惩罚，
     * 大增益板仍会带着 2-3 步自伤混过门槛——四人局里自伤等于给
     * 另外两家免费搭车（实测：学徒凭「从不自坑」反超高档的根源）。 */
    const harmCap = leader.d <= 2 ? 2 : leader.d <= 3 ? 1 : 0;
    const passed: Array<{ c: WallCand; score: number; gainLeader: number }> = [];
    for (const c of cands) {
      const probe = probeWall(grids, c, state, actives, before, N);
      if (!probe) continue;
      const gainLeader = probe.gains.get(leader.p) ?? 0;
      let gainOthers = 0;
      for (const o of opps) {
        if (o.p !== leader.p) gainOthers += probe.gains.get(o.p) ?? 0;
      }
      const harmMe = probe.gains.get(me) ?? 0;
      if (harmMe > harmCap) continue;
      let score = 2 * gainLeader + gainOthers - 3 * Math.max(0, harmMe);
      if (level >= 2) {
        // 应手校验：领先者走一步后与我（也走一步）的归途差（v2：排字师也看）
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
      passed.push({ c, score, gainLeader });
    }
    passed.sort((a, b) => b.score - a.score);

    const minGain = leader.d <= 2 ? 1 : 2;
    const minScore = level === 2 ? 3 : 2;
    const gated = passed.filter((x) => x.score >= minScore && x.gainLeader >= minGain);

    if (level >= 3 && gated.length > 0) {
      /* v4 交换后竞速裕度：贪心分只量「拉长多少」，不量「烧掉的一手节奏」。
       * 但这只在「平先或领先」时才成立——此时我是被追方，烧一手等于
       * 白送追赶者半步，幻影增益的板必须拦下。
       * 「落后」时板是唯一武器：单轮裕度永远算不出正收益，可多轮积累
       * 的拦道是翻盘正道（实测：门控一刀切后社长被学徒 6:4 反超，
       * 落后时禁板等于弃械竞速）。故按领先状态分流：
       * - 平先/领先 → 裕度门控（追兵有板平价出手 / 追兵无板严格 +0.5）；
       * - 落后 → 贪心放量（gain≥2 的最佳板，r2 行为）。
       * 紧急拦截在裕度侧无需豁免：基准里领先者转完一圈即胜（裕度大负），
       * 任何 gain≥2 的拦道板裕度都优于基准，天然入选。 */
      if (myDist <= leader.d) {
        const K = level >= 4 ? 5 : 3;
        const base = exchangeMargin(state, me, actives, N, null);
        /* v6.1：平价出手回滚——实测 L4:L3 从 17:8 跌到 6:14：
         * 领先时烧板在四人局同样是败招（r2 老结论成立），
         * 严格线才是对的。追兵无板与有板同用严格线。 */
        const threshold = base + 0.5;
        let pick: WallCand | null = null;
        let pickMargin = threshold;
        for (let i = 0; i < Math.min(K, gated.length); i++) {
          const m = exchangeMargin(state, me, actives, N, gated[i].c);
          if (m > pickMargin) {
            pick = gated[i].c;
            pickMargin = m;
          }
        }
        if (pick) {
          const wall: Wall = { x: pick.x, y: pick.y, o: pick.o, by: me };
          return { payload: { type: "wall", wall }, label: WALL_LABEL[level] };
        }
        /* 无一块板能赚回节奏 → 推进（贪心的幻影增益就此止步） */
      } else {
        const c = gated[0].c;
        const wall: Wall = { x: c.x, y: c.y, o: c.o, by: me };
        return { payload: { type: "wall", wall }, label: WALL_LABEL[level] };
      }
    } else if (gated.length > 0) {
      const c = gated[0].c;
      const wall: Wall = { x: c.x, y: c.y, o: c.o, by: me };
      return { payload: { type: "wall", wall }, label: WALL_LABEL[level] };
    }
  }

  /* 5. 推进 */
  return bestAdvance(state, me, level) ?? anyWall(state, me, level);
}
