/// <reference lib="webworker" />
/* AI 计算线程：保证总编的深度搜索不阻塞 UI 渲染与动画 */

import { computeAiMove } from "./ai";
import type { AiLevel, GameState } from "./types";

self.addEventListener("message", (e: MessageEvent) => {
  const { state, level, jobId } = e.data as {
    state: GameState;
    level: AiLevel;
    jobId: number;
  };
  try {
    const decision = computeAiMove(state, level);
    (self as unknown as Worker).postMessage({ jobId, decision });
  } catch (err) {
    (self as unknown as Worker).postMessage({ jobId, decision: null, error: String(err) });
  }
});
