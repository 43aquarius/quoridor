/// <reference lib="webworker" />
/* AI 计算线程：保证总编的深度搜索不阻塞 UI 渲染与动画。
 * 支持根分裂并行：主线程把根候选按交织切片派发给多个 worker；
 * worker 每完成一层迭代加深即上报（深度，着法，分），
 * 主线程按「全席公共深度」聚合取最优——跨深度分数受地平线
 * 乐观偏差污染，不可比。 */

import { computeAiMove } from "./ai";
import type { AiLevel, GameState } from "./types";

self.addEventListener("message", (e: MessageEvent) => {
  const { state, level, jobId, slot, rootPick } = e.data as {
    state: GameState;
    level: AiLevel;
    jobId: number;
    slot?: number;
    rootPick?: { mod: number; rem: number };
  };
  const post = (msg: Record<string, unknown>) =>
    (self as unknown as Worker).postMessage({ jobId, slot, ...msg });
  try {
    const decision = computeAiMove(state, level, {
      ...(rootPick ? { rootPick } : {}),
      /* 逐层同步汇报：根分裂时主线程先收齐一层再比一层 */
      report: (depth, payload, score) => post({ type: "iter", depth, payload, score }),
    });
    post({ type: "final", decision });
  } catch (err) {
    post({ type: "final", decision: null, error: String(err) });
  }
});
