/* AI 客户端封装：根分裂并行 worker 池（v3）。
 * 双人局总编/社长档且多核可用时，把根候选按交织切片派发给
 * min(核数-1, 5) 个 worker 并行搜索；worker 每完成一层迭代
 * 即上报（深度，着法，分），主线程取「全席公共深度 D*」——
 * 所有活跃切片都完成过的最高层——在该层跨切片比分取最优。
 * （跨深度不可比：浅层搜索因地平线效应对行棋方系统性乐观，
 * 直接取全局最高分会选中「最不精炼的幻想着法」。）
 * 其余场景单 worker；Worker 不可用时同步兜底，绝不长时间阻塞 UI。 */

import { computeAiMove, type AiDecision } from "./ai";
import type { AiLevel, GameState, MovePayload } from "./types";

let jobId = 0;
const pool: Worker[] = [];
let poolBroken = false;

function workerTimeoutMs(level: AiLevel): number {
  if (level >= 4) return 10500; /* 社长 6000ms × 1.55 尺寸缩放上限 9300ms，留余量 */
  if (level === 3) return 5600; /* 总编 3000ms × 1.55 = 4650ms（v6） */
  if (level === 2) return 3100; /* 排字师 1000ms × 1.55 = 1550ms（v6） */
  return 2000;
}

/* 同步兜底的紧预算：Worker 不可用时避免长时间阻塞主线程 */
function syncBudgetMs(level: AiLevel): number {
  if (level >= 4) return 2000;
  if (level === 3) return 1500;
  if (level === 2) return 650;
  return 280;
}

/* 根分裂并行度：排字师（2 切片）/总编与社长档（≤4 切片）且核数宽裕时启用。
 * 预留 2 核给 UI/渲染；排字师上限 2（档位增量有限，够看破两步陷阱）；
 * 总编/社长上限 4（根分裂增益有限，功耗与收益平衡）。
 * v4：总编档启用；v5：排字师档也启用（用户两轮反馈均要求更强）。 */
function parallelism(state: GameState, level: AiLevel): number {
  if (state.playerCount === 4 || level < 2) return 1;
  const hc = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 1 : 1;
  if (hc < 6) return 1;
  if (level === 2) return Math.min(2, hc - 2);
  return Math.min(4, hc - 2);
}

interface IterReport {
  payload: MovePayload;
  score: number;
}

interface PendingJob {
  expected: number;
  finals: Array<AiDecision | null>;
  iters: Array<Map<number, IterReport>>; // slot → depth → 该层最优
  received: number;
  onFinal: (slot: number, d: AiDecision | null) => void;
  onIter: (slot: number, depth: number, payload: MovePayload, score: number) => void;
}

const pending = new Map<number, PendingJob>();

function handleWorkerMessage(e: MessageEvent) {
  const { jobId: id, type, decision, slot, depth, payload, score } = e.data as {
    jobId: number;
    type?: string;
    decision?: AiDecision | null;
    slot?: number;
    depth?: number;
    payload?: MovePayload;
    score?: number;
  };
  const p = pending.get(id);
  if (!p) return;
  if (slot == null || slot < 0 || slot >= p.expected) return;
  if (type === "iter" && payload && depth != null && score != null) {
    p.onIter(slot, depth, payload, score);
  } else if (type === "final") {
    p.onFinal(slot, decision ?? null);
  }
}

function dropWorker(w: Worker) {
  const i = pool.indexOf(w);
  if (i >= 0) pool.splice(i, 1);
  try {
    w.terminate();
  } catch {
    /* noop */
  }
}

function ensurePool(desired: number): Worker[] {
  if (poolBroken) return [];
  while (pool.length < desired) {
    let w: Worker | null = null;
    try {
      w = new Worker(new URL("./ai-worker.ts", import.meta.url));
      const worker = w;
      w.addEventListener("message", handleWorkerMessage);
      w.addEventListener("error", () => {
        /* worker 崩溃：从池中移除；等待中的任务靠超时保险收尾 */
        dropWorker(worker);
        if (pool.length === 0) poolBroken = true;
      });
    } catch {
      w = null;
    }
    if (!w) {
      if (pool.length === 0) poolBroken = true;
      break;
    }
    pool.push(w);
  }
  return pool.slice(0, desired);
}

export async function requestAiMove(
  state: GameState,
  level: AiLevel,
): Promise<AiDecision | null> {
  const desired = parallelism(state, level);
  const workers = ensurePool(desired);
  if (workers.length === 0) {
    /* 无 Worker：同步兜底（总编同步计算也控制在紧预算内） */
    return computeAiMove(state, level, { budgetMs: syncBudgetMs(level) });
  }
  const expected = workers.length;
  const id = ++jobId;
  return new Promise<AiDecision | null>((resolve) => {
    const finals: Array<AiDecision | null> = [];
    const iters: Array<Map<number, IterReport>> = [];
    let received = 0;
    let settled = false;

    const collect = (): AiDecision | null => {
      /* 即胜着（一步取胜）优先：任何切片找到就立即采用 */
      for (const d of finals) {
        if (d && (d.score ?? 0) > 90000) return d;
      }
      /* 全席法定深 D*：所有「有迭代汇报的切片」都完成过的最高层。
       * 只在 D* 层跨切片比分——同层分数无乐观偏差、可严格比较。 */
      const liveSlots: number[] = [];
      for (let s = 0; s < expected; s++) {
        if (iters[s] && iters[s].size > 0) liveSlots.push(s);
      }
      if (liveSlots.length === 0) {
        /* 无迭代汇报（即胜捷径等）：退回最终决策按分取优 */
        let best: AiDecision | null = null;
        for (const d of finals) {
          if (d && (!best || (d.score ?? -Infinity) > (best.score ?? -Infinity))) best = d;
        }
        return best;
      }
      let dStar = 0;
      for (let d = 1; d <= 32; d++) {
        if (liveSlots.every((s) => iters[s]!.has(d))) dStar = d;
      }
      if (dStar === 0) {
        /* 各切片连第 2 层都没同时完成（极端）：退回最终决策 */
        let best: AiDecision | null = null;
        for (const d of finals) {
          if (d) return d;
        }
        return best;
      }
      let bestPayload: MovePayload | null = null;
      let bestScore = -Infinity;
      let bestLabel = "";
      for (const s of liveSlots) {
        const r = iters[s]!.get(dStar)!;
        if (r.score > bestScore) {
          bestScore = r.score;
          bestPayload = r.payload;
          bestLabel = "";
        }
      }
      /* 标签从对应切片的最终决策里取（payload 一致即取其文案） */
      for (const d of finals) {
        if (d && bestPayload && d.payload === bestPayload) bestLabel = d.label;
      }
      if (!bestPayload) return null;
      return { payload: bestPayload, label: bestLabel || "编辑部审定了着法", score: bestScore };
    };

    const settle = (d: AiDecision | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pending.delete(id);
      resolve(d);
    };

    const timer = setTimeout(() => {
      /* 超时保险：有部分结果即取其优；全无则终止僵尸 worker
       * （否则同步兜底还要与它们抢核），再转同步紧预算 */
      if (received > 0) {
        settle(collect());
        return;
      }
      for (const w of workers) dropWorker(w);
      settle(computeAiMove(state, level, { budgetMs: syncBudgetMs(level) }));
    }, workerTimeoutMs(level));

    pending.set(id, {
      expected,
      finals,
      iters,
      received: 0,
      onFinal: (slot, d) => {
        if (finals[slot] !== undefined) return;
        finals[slot] = d;
        received++;
        if (received >= expected) settle(collect());
      },
      onIter: (slot, depth, payload, score) => {
        if (!iters[slot]) iters[slot] = new Map();
        const cur = iters[slot]!.get(depth);
        if (!cur || score > cur.score) iters[slot]!.set(depth, { payload, score });
      },
    });

    workers.forEach((w, slot) => {
      w.postMessage({
        state,
        level,
        jobId: id,
        slot,
        rootPick: expected > 1 ? { mod: expected, rem: slot } : undefined,
      });
    });
  });
}
