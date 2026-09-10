/* 镜像对称性测试：P 局面甲走选 M；镜像局面 P'（甲乙互换、上下翻转）乙走应选 M 的镜像。
 * 若不对称 → 搜索引擎存在方位性 bug。
 */
import { initialGame, type GameState, type Wall } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

const N = 9;

function mirrorPos(p: { x: number; y: number }) {
  return { x: p.x, y: N - 1 - p.y };
}
function mirrorWall(w: Wall): Wall {
  // H/V(x,y) 覆盖行 y..y+1 → 镜像后覆盖行 (N-2-y)..(N-1-y) → 锚 y' = N-2-y
  return { x: w.x, y: N - 2 - w.y, o: w.o, by: w.by === "A" ? "B" : "A" };
}

/* 构造一个非平凡中局：走 12 手 */
function buildMid(): GameState {
  let s = initialGame();
  const seq: Array<{ p: "A" | "B"; mv: { t: "pawn"; to: { x: number; y: number } } | { t: "wall"; w: Wall } }> = [
    { p: "A", mv: { t: "pawn", to: { x: 4, y: 7 } } },
    { p: "B", mv: { t: "pawn", to: { x: 4, y: 1 } } },
    { p: "A", mv: { t: "pawn", to: { x: 4, y: 6 } } },
    { p: "B", mv: { t: "pawn", to: { x: 4, y: 2 } } },
    { p: "A", mv: { t: "wall", w: { x: 3, y: 3, o: "h", by: "A" } } },
    { p: "B", mv: { t: "wall", w: { x: 5, y: 4, o: "v", by: "B" } } },
    { p: "A", mv: { t: "pawn", to: { x: 3, y: 6 } } },
    { p: "B", mv: { t: "pawn", to: { x: 5, y: 2 } } },
    { p: "A", mv: { t: "pawn", to: { x: 3, y: 5 } } },
    { p: "B", mv: { t: "pawn", to: { x: 5, y: 3 } } },
    { p: "A", mv: { t: "wall", w: { x: 2, y: 2, o: "v", by: "A" } } },
    { p: "B", mv: { t: "wall", w: { x: 6, y: 5, o: "h", by: "B" } } },
  ];
  for (const step of seq) {
    const r =
      step.mv.t === "pawn"
        ? applyPayload(s, step.p, {
            type: "pawn",
            from: step.p === "A" ? s.posA : s.posB,
            to: step.mv.to,
          })
        : applyPayload(s, step.p, { type: "wall", wall: step.mv.w });
    if (!r.ok || !r.state) {
      console.log("构造失败于", JSON.stringify(step));
      process.exit(1);
    }
    s = r.state;
  }
  return s;
}

for (const level of [2, 3, 4] as const) {
  const P = buildMid(); // 轮到 A
  const dA = computeAiMove(P, level);

  /* 镜像局面：甲乙互换 + 上下翻转，轮到 B */
  const M: GameState = {
    ...P,
    posA: mirrorPos(P.posB),
    posB: mirrorPos(P.posA),
    walls: P.walls.map(mirrorWall),
    turn: "B",
  };
  const dB = computeAiMove(M, level);

  const aMove = dA?.payload;
  const bMove = dB?.payload;
  let ok = false;
  let detail = "";
  if (aMove && bMove) {
    if (aMove.type === "pawn" && bMove.type === "pawn") {
      const expect = mirrorPos(aMove.to);
      ok = expect.x === bMove.to.x && expect.y === bMove.to.y;
      detail = `A→(${aMove.to.x},${aMove.to.y}) vs B→(${bMove.to.x},${bMove.to.y}) 期望镜像(${expect.x},${expect.y})`;
    } else if (aMove.type === "wall" && bMove.type === "wall") {
      const ew = mirrorWall(aMove.wall);
      ok = ew.x === bMove.wall.x && ew.y === bMove.wall.y && ew.o === bMove.wall.o;
      detail = `A WALL(${aMove.wall.x},${aMove.wall.y}-${aMove.wall.o}) vs B WALL(${bMove.wall.x},${bMove.wall.y}-${bMove.wall.o})`;
    } else {
      detail = `类型不同：A=${aMove.type} B=${bMove.type}`;
    }
  }
  console.log(`L${level}: ${ok ? "✓ 镜像一致" : "✗ 不对称"} · ${detail}`);
}
