/* 诊断：L4 执甲为何弱于预期 —— 逐局落子轨迹 + 分档对照 */
import { initialGame, type AiLevel, type GameState } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { cellName } from "../src/lib/game/types";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";

function play(levelA: AiLevel, levelB: AiLevel, trace = false): { winner: string; moves: number } {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 300) {
    guard++;
    const level = s.turn === "A" ? levelA : levelB;
    const d = computeAiMove(s, level);
    if (!d) break;
    const r = applyPayload(s, s.turn, d.payload);
    if (!r.ok || !r.state) {
      console.error("  [拒]", s.turn, d.payload);
      break;
    }
    s = r.state;
    if (trace) {
      const st = lastSearchStats();
      console.log(
        `  ${String(s.history.length).padStart(3)} ${s.turn === "A" ? "甲" : "乙"} ${
          d.payload.type === "wall"
            ? `WALL ${d.payload.wall.x},${d.payload.wall.y}${d.payload.wall.o}`
            : `${cellName(d.payload.from ?? { x: 0, y: 0 }, 9)}→${cellName(d.payload.to ?? { x: 0, y: 0 }, 9)}`
        }  (nodes=${st.nodes} tt=${st.ttSize} ${st.elapsedMs}ms)`,
      );
    }
  }
  return { winner: s.winner ?? "draw", moves: s.history.length };
}

const which = (process.argv[2] ?? "trace") as "trace" | "series" | "pair";

if (which === "pair") {
  const la = Number(process.argv[3] ?? 3) as AiLevel;
  const lb = Number(process.argv[4] ?? 2) as AiLevel;
  console.log(`=== L${la}-A vs L${lb}-B 单局轨迹 ===`);
  const r = play(la, lb, true);
  console.log("结果：", r.winner, "共", r.moves, "手");
} else if (which === "trace") {
  console.log("=== L4-A vs L2-B 单局轨迹 ===");
  const r = play(4, 2, true);
  console.log("结果：", r.winner, "共", r.moves, "手");
} else {
  const N = Number(process.argv[3] ?? 6);
  for (const [la, lb] of [
    [3, 2],
    [4, 2],
    [4, 3],
    [2, 1],
  ] as Array<[AiLevel, AiLevel]>) {
    let a = 0;
    let b = 0;
    let d = 0;
    for (let i = 0; i < N; i++) {
      const r = play(la as AiLevel, lb as AiLevel);
      if (r.winner === "A") a++;
      else if (r.winner === "B") b++;
      else d++;
    }
    console.log(`L${la}-A vs L${lb}-B: 甲 ${a} | 乙 ${b} | 平 ${d}  (n=${N})`);
  }
}
