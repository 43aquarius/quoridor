/* 四人局偏执搜索基准：初始/中局若干局面 × 档位，报深度/节点/缓存命中率。
 * 用法：bun scripts/ai4-bench.ts [budgetMs] */

import { initialGame, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, activePlayers, isEliminated, pawnOf } from "../src/lib/game/engine";
import { computeAiMove4, lastSearchStats4 } from "../src/lib/game/ai4";
import { computeAiMove4Legacy } from "../src/lib/game/ai4-legacy";

const budget = process.argv[2] ? Number(process.argv[2]) : undefined;

function bench(label: string, state: GameState, level: 2 | 3 | 4) {
  const s = { ...state };
  const t0 = Date.now();
  const d = computeAiMove4(s, level, budget ? { budgetMs: budget } : undefined);
  const wall = Date.now() - t0;
  const st = lastSearchStats4();
  console.log(
    `${label} L${level}: ${d ? (d.payload.type === "wall" ? `WALL ${d.payload.wall.x},${d.payload.wall.y}${d.payload.wall.o}` : `PAWN`) : "null"} ` +
      `score=${d?.score?.toFixed(2)} 深度=${st.depth} 节点=${st.nodes} 用时=${wall}ms ` +
      `dc命中=${st.dcHits}/${st.dcHits + st.dcMisses}(${((st.dcHits / Math.max(1, st.dcHits + st.dcMisses)) * 100).toFixed(0)}%)`,
  );
}

/* 1. 初始局面（9×9×5） */
{
  const s = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  for (const lv of [2, 3, 4] as const) {
    bench(`初始9×9    `, s, lv);
  }
}

/* 2. 初始局面（5×5×3） */
{
  const s = initialGame({ playerCount: 4, size: 5, wallsPerPlayer: 3 });
  for (const lv of [2, 3, 4] as const) {
    bench(`初始5×5    `, s, lv);
  }
}

/* 3. 中局（legacy 学徒推进 16 手后，墙已铺开） */
{
  let s = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  for (let i = 0; i < 16 && !s.winner; i++) {
    const p = s.turn as Player;
    const d = computeAiMove4Legacy(s, 2);
    if (!d) break;
    const r = applyPayload(s, p, d.payload, 0);
    if (!r.ok || !r.state) {
      console.error("legacy 中局推进失败", JSON.stringify(d.payload), r.reason);
      process.exit(1);
    }
    s = r.state;
  }
  console.log(`中局局面：${s.walls.length} 板 / 轮到 ${s.turn} / 在场 ${activePlayers(s).join("")}`);
  for (const lv of [2, 3, 4] as const) {
    bench(`中局9×9    `, s, lv);
  }
}

/* 4. 对称竞速局面（无墙，看竞速精度） */
{
  const s = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 0 });
  for (const lv of [2, 3, 4] as const) {
    bench(`无板竞速   `, s, lv);
  }
}

/* 5. 合法性冒烟：三档各走 20 手全合法 */
{
  for (const lv of [2, 3, 4] as const) {
    let s = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
    let ok = true;
    for (let i = 0; i < 20 && !s.winner; i++) {
      const p = s.turn as Player;
      if (isEliminated(s, p)) continue;
      const d = computeAiMove4(s, lv, { budgetMs: 400 });
      if (!d) break;
      const r = applyPayload(s, p, d.payload, 0);
      if (!r.ok || !r.state) {
        console.error(`L${lv} 非法着法:`, JSON.stringify(d.payload), r.reason, `turn=${p} pos=${JSON.stringify(pawnOf(s, p))}`);
        ok = false;
        break;
      }
      s = r.state;
    }
    console.log(`L${lv} 合法性冒烟 20 手：${ok ? "通过" : "失败"}`);
    if (!ok) process.exit(1);
  }
}
