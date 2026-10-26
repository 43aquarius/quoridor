/* 复现 trace 第4局的末局振荡：重建局面 → 打印距离/轮转 → 观察 L4/L3 决策 */
import { initialGame, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, shortestPathLength, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove, lastSearchStats } from "../src/lib/game/ai";
import * as fs from "node:fs";

const d = JSON.parse(fs.readFileSync("/home/z/my-project/scripts/r3-trace.json", "utf8"));
const g4 = d.moves.filter((m: { game: number }) => m.game === 4);

/* 重建：按 moveNo 顺序回放。pawn 的 to 被截断，但可由同席下一手的 from 补全 */
interface Rec { moveNo: number; seat: Player; type: string; detail: string }
const recs = g4 as Rec[];
/* 每席的 from 序列；to[i] = from[i+1]（最后一手无 to，跳过） */
const froms: Record<string, Array<{ x: number; y: number }>> = { A: [], B: [] };
for (const r of recs) {
  if (r.type !== "pawn") {
    froms[r.seat].push({ x: -1, y: -1 }); /* wall 占位 */
    continue;
  }
  const m = r.detail.match(/\((\d+),(\d+)\)->/);
  if (m) froms[r.seat].push({ x: +m[1], y: +m[2] });
}
function pawnTo(r: Rec, i: number, seat: Player) {
  if (r.type === "wall") return null;
  /* 跳过中间的 wall 占位，找该席下一手 pawn 的 from */
  for (let j = i + 1; j < froms[seat].length; j++) {
    const nxt = froms[seat][j];
    if (nxt.x >= 0) return nxt;
  }
  return null;
}

let s: GameState = initialGame();
let ai = 0;
let cur: Record<string, number> = { A: 0, B: 0 };
for (const r of recs) {
  const seat = r.seat;
  const i = cur[seat];
  if (r.type === "wall") {
    const m = r.detail.match(/wall (\d+),(\d+)-([hv])/);
    if (m) {
      const pl = { type: "wall", wall: { x: +m[1], y: +m[2], o: m[3], by: seat } } as const;
      const rr = applyPayload(s, seat, pl as never);
      if (rr.ok && rr.state) s = rr.state;
    }
  } else {
    const to = pawnTo(r, i, seat);
    if (to) {
      const from = seat === "A" ? s.posA : s.posB;
      const rr = applyPayload(s, seat, { type: "pawn", from: { ...from }, to });
      if (rr.ok && rr.state) s = rr.state;
      else console.log(`回放失败 moveNo=${r.moveNo} ${seat} ${JSON.stringify(from)}->${JSON.stringify(to)}`);
    } else {
      /* 最后一手：无 to，停在这里 */
      console.log(`停在 moveNo=${r.moveNo}（${seat} 的末手无 to 记录）`);
      break;
    }
  }
  cur[seat]++;
  ai++;
}
void ai;
console.log("\n=== 重建局面 ===");
console.log(`轮到: ${s.turn} · wallsA=${s.wallsA} wallsB=${s.wallsB}`);
console.log(`A at (${s.posA.x},${s.posA.y}) 距 ${shortestPathLength(s, "A")}`);
console.log(`B at (${s.posB.x},${s.posB.y}) 距 ${shortestPathLength(s, "B")}`);
console.log(`A 合法着法:`, legalPawnMoves(s, "A").map((v) => `(${v.x},${v.y})`).join(" "));
console.log(`B 合法着法:`, legalPawnMoves(s, "B").map((v) => `(${v.x},${v.y})`).join(" "));

/* 双方在此局面的决策 */
for (const [name, seat] of [["L4", "A"], ["L3", "A"], ["L3", "B"]] as const) {
  const t: GameState = { ...s, turn: seat as Player };
  const d2 = computeAiMove(t, name === "L4" ? 4 : 3, { budgetMs: 2000 });
  const st = lastSearchStats();
  console.log(
    `${name} 坐 ${seat} 决策: ${d2?.payload.type} ${d2?.payload.type === "pawn" ? `(${d2.payload.to.x},${d2.payload.to.y})` : ""} score=${d2?.score} depth=${st.depth} nodes=${st.nodes}`,
  );
}

/* === 续跑 20 手：L4 坐 B、L3 坐 A，看振荡是否复现 === */
console.log("\n=== 续跑 20 手（L4=B, L3=A） ===");
let s2: GameState = { ...s, turn: "B" };
for (let i = 0; i < 20 && !s2.winner; i++) {
  const mover = s2.turn as Player;
  const lvl = mover === "B" ? 4 : 3;
  const dd = computeAiMove(s2, lvl);
  if (!dd) break;
  const rr = applyPayload(s2, mover, dd.payload);
  if (!rr.ok || !rr.state) break;
  const desc =
    dd.payload.type === "pawn"
      ? `(${dd.payload.from.x},${dd.payload.from.y})->(${dd.payload.to.x},${dd.payload.to.y})`
      : "wall";
  console.log(`${i + 1}. ${mover}(L${lvl}) ${desc} score=${dd.score?.toFixed(2)} 距A=${shortestPathLength(s2, "A")} 距B=${shortestPathLength(s2, "B")} 胜者=${s2.winner ?? "-"}`);
  s2 = rr.state;
}

/* === 精确复刻振荡局面 S2：A(1,5) B(7,6) 轮B === */
console.log("\n=== S2 精确局面（A(1,5), B(7,6), 轮B, 板尽） ===");
const s3: GameState = { ...s, posA: { x: 1, y: 5 }, turn: "B" };
for (const lvl of [3, 4] as const) {
  const dd = computeAiMove(s3, lvl);
  const st = lastSearchStats();
  console.log(
    `L${lvl} 坐B 决策: ${dd?.payload.type === "pawn" ? `(${dd.payload.from.x},${dd.payload.from.y})->(${dd.payload.to.x},${dd.payload.to.y})` : dd?.payload.type} score=${dd.score} depth=${st.depth} nodes=${st.nodes}`,
  );
}
/* 再续跑 12 手验证是否进入四循环 */
console.log("--- 从 S2 续跑 12 手 ---");
let s4: GameState = s3;
for (let i = 0; i < 12 && !s4.winner; i++) {
  const mover = s4.turn as Player;
  const lvl = mover === "B" ? 4 : 3;
  const dd = computeAiMove(s4, lvl);
  if (!dd) break;
  const rr = applyPayload(s4, mover, dd.payload);
  if (!rr.ok || !rr.state) break;
  const desc = dd.payload.type === "pawn" ? `(${dd.payload.from.x},${dd.payload.from.y})->(${dd.payload.to.x},${dd.payload.to.y})` : "wall";
  console.log(`${i + 1}. ${mover}(L${lvl}) ${desc} score=${dd.score?.toFixed(3)} 距A=${shortestPathLength(s4, "A")} 距B=${shortestPathLength(s4, "B")}`);
  s4 = rr.state;
}

/* === 核心距离场分析（用引擎自己的 buildWallGrids/edgeBlockedG） === */
import { buildWallGrids, edgeBlockedG } from "../src/lib/game/engine";
{
  const N = 9;
  const grids = buildWallGrids(s.walls, N);
  const dist = (p: Player, x: number, y: number): number => {
    const goalY = p === "A" ? 0 : N - 1;
    if (y === goalY) return 0;
    const d = new Int16Array(N * N).fill(-1);
    const q: number[] = [y * N + x];
    d[y * N + x] = 0;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const cx = cur % N;
      const cy = (cur - cx) / N;
      if (cy === goalY) return d[cur];
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
        if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
        const ni = ny * N + nx;
        if (d[ni] >= 0) continue;
        d[ni] = d[cur] + 1;
        q.push(ni);
      }
    }
    return -1;
  };
  console.log("=== S2 核心距离（pawn-agnostic） ===");
  console.log(`A: (1,4)=${dist("A",1,4)} (1,5)=${dist("A",1,5)} (1,6)=${dist("A",1,6)} (1,7)=${dist("A",1,7)} (0,5)=${dist("A",0,5)} (0,6)=${dist("A",0,6)} (2,5)=${dist("A",2,5)} (2,6)=${dist("A",2,6)}`);
  console.log(`B: (7,4)=${dist("B",7,4)} (7,5)=${dist("B",7,5)} (7,6)=${dist("B",7,6)} (7,7)=${dist("B",7,7)} (7,8)=${dist("B",7,8)} (8,6)=${dist("B",8,6)} (8,7)=${dist("B",8,7)} (8,8)=${dist("B",8,8)}`);
  /* 手工核算两个候选子的 raceEval（旧口径） */
  const dA = dist("A", 1, 5);
  const d75 = dist("B", 7, 5);
  const d77 = dist("B", 7, 7);
  console.log(`\n候选 (7,5): 子局面 A(1,5)d=${dA} B(7,5)d=${d75} 轮A。|dy|=${Math.abs(5-5)} <2 → raceRec 递归`);
  console.log(`候选 (7,7): 子局面 A(1,5)d=${dA} B(7,7)d=${d77} 轮A。|dy|=${Math.abs(5-7)} ≥2 → raceEval 直判: B胜 score=100000-1-${d77}=${100000-1-d77}`);
}
