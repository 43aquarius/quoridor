/* v4 组件诊断：QS/NMP 触发率、深度与节点对比（v4 vs v3 同局面）
 * 运行：bun run scripts/ai-diag-v4.ts
 * 消融（开关在模块加载时读取，必须 CLI 传入）：
 *   QUORIDOR_AI_OFF_QS=1  bun run scripts/ai-diag-v4.ts
 *   QUORIDOR_AI_OFF_NMP=1 bun run scripts/ai-diag-v4.ts
 *   QUORIDOR_AI_OFF_WP=1  bun run scripts/ai-diag-v4.ts */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";
import { computeAiMoveV3, lastSearchStatsV3 } from "../src/lib/game/ai-v3";

/* 构造中盘局面：v3 以短预算自对弈 plies 手（确定性种子），
 * v4 与 v3 面对完全相同的局面 */
function midgame(plies: number, level: AiLevel, seed: number): GameState {
  let s = initialGame();
  let x = seed >>> 0;
  const rnd = () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
  for (let i = 0; i < plies; i++) {
    const turn = s.turn;
    if (i < 4) {
      /* 前 4 手：中央推进（确定性） */
      const to = { x: 4, y: turn === "A" ? 2 : 6 };
      const r = applyPayload(s, turn, { type: "pawn", from: turn === "A" ? s.posA : s.posB, to });
      if (r.ok && r.state) { s = r.state; void rnd; continue; }
    }
    const d = computeAiMoveV3(s, level, { budgetMs: 260 });
    if (!d) break;
    const r = applyPayload(s, turn, d.payload);
    if (!r.ok || !r.state) break;
    s = r.state;
  }
  return s;
}

function probe(tag: string, level: AiLevel, seed: number) {
  const s = midgame(18, 2, seed);
  const t0 = Date.now();
  const d = computeAiMove(s, level);
  const ms = Date.now() - t0;
  const st = lastSearchStats();
  console.log(
    `${tag} L${level}: depth=${st.depth} nodes=${st.nodes} qnodes=${st.qnodes} ` +
    `tt=${st.ttSize} dc=${Math.round((st.dcHits / (st.dcHits + st.dcMisses || 1)) * 100)}% ` +
    `${ms}ms move=${JSON.stringify(d?.payload).slice(0, 56)}`,
  );
}

function probeV3(level: AiLevel, seed: number) {
  const s = midgame(18, 2, seed);
  const t0 = Date.now();
  const d = computeAiMoveV3(s, level);
  const ms = Date.now() - t0;
  const st = lastSearchStatsV3();
  console.log(
    `v3    L${level}: depth=${st.depth} nodes=${st.nodes} tt=${st.ttSize} ${ms}ms move=${JSON.stringify(d?.payload).slice(0, 56)}`,
  );
}

const ablation = process.env.QUORIDOR_AI_OFF_QS
  ? "OFF_QS"
  : process.env.QUORIDOR_AI_OFF_NMP
    ? "OFF_NMP"
    : process.env.QUORIDOR_AI_OFF_WP
      ? "OFF_WP"
      : "全开";
console.log(`=== v4 vs v3 同局面对比（消融：${ablation}） ===`);
for (const seed of [11, 77, 202]) {
  probeV3(3, seed);
  probe("v4 ", 3, seed);
}
for (const seed of [11, 77]) {
  probe("v4 ", 4, seed);
}
