/* AI 客户端封装：优先 Web Worker，失败时同步兜底（绝不长时间阻塞 UI） */

import { computeAiMove, type AiDecision } from "./ai";
import type { AiLevel, GameState } from "./types";

let worker: Worker | null = null;
let workerBroken = false;
let jobId = 0;
const pending = new Map<number, { resolve: (d: AiDecision | null) => void }>();

function ensureWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL("./ai-worker.ts", import.meta.url));
    w.addEventListener("message", (e: MessageEvent) => {
      const { jobId: id, decision } = e.data as {
        jobId: number;
        decision: AiDecision | null;
      };
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        p.resolve(decision ?? null);
      }
    });
    w.addEventListener("error", () => {
      // Worker 加载失败：把等待中的任务转同步
      workerBroken = true;
      for (const [id, p] of pending) {
        pending.delete(id);
        p.resolve(null);
      }
      try {
        w.terminate();
      } catch {
        /* noop */
      }
      worker = null;
    });
    worker = w;
    return w;
  } catch {
    workerBroken = true;
    return null;
  }
}

export async function requestAiMove(
  state: GameState,
  level: AiLevel,
): Promise<AiDecision | null> {
  const w = ensureWorker();
  if (!w) {
    // 同步兜底（仅低档位或 Worker 不可用时；总编同步计算也控制在 ~400ms 预算内）
    return computeAiMove(state, level);
  }
  const id = ++jobId;
  return new Promise<AiDecision | null>((resolve) => {
    // 超时保险：2.5 秒后转同步计算
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve(computeAiMove(state, level));
      }
    }, 2500);
    pending.set(id, {
      resolve: (d) => {
        clearTimeout(timer);
        resolve(d);
      },
    });
    w.postMessage({ state, level, jobId: id });
  });
}
