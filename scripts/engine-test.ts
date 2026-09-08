/* 引擎单元测试：跳子、挡板冲突/断路、记谱、胜负、AI 三档 */
import { initialGame, type Move, type MovePayload } from "../src/lib/game/types";
import {
  applyPayload,
  applyResign,
  legalPawnMoves,
  checkWall,
  shortestPathLength,
  stateFromHistory,
} from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error("  ✗ FAIL:", msg);
  }
}

/* —— 1. 初始局面 —— */
{
  const s = initialGame();
  assert(s.posA.x === 4 && s.posA.y === 8, "甲起始 e1");
  assert(s.posB.x === 4 && s.posB.y === 0, "乙起始 e9");
  assert(s.wallsA === 10 && s.wallsB === 10, "各 10 板");
  assert(shortestPathLength(s, "A") === 8, "甲初始最短 8 步");
  assert(shortestPathLength(s, "B") === 8, "乙初始最短 8 步");
  const movesA = legalPawnMoves(s, "A");
  assert(movesA.length === 3, `甲初始 3 个着法（上左右），得 ${movesA.length}`);
}

/* —— 2. 直跳 —— */
{
  // 甲 e2，乙 e3 正面相邻，身后无板 → 直跳到 e4
  const s = { ...initialGame(), posA: { x: 4, y: 7 }, posB: { x: 4, y: 6 }, turn: "A" };
  const moves = legalPawnMoves(s, "A");
  const hasJump = moves.some((v) => v.x === 4 && v.y === 5); // e4 = (4,5)
  const noEnter = !moves.some((v) => v.x === 4 && v.y === 6);
  assert(hasJump, "可直跳越过乙到 e4");
  assert(noEnter, "不可走入乙所在的 e3");
  assert(moves.length === 4, `直跳 + 左右 = 4 着（左 d2 右 f2 上跳 e4），得 ${moves.length}`);
}

/* —— 3. 斜跳 —— */
{
  // 甲 e2，乙 e3；乙身后 e4 有 H 板 → 直跳被堵，可斜跳 d3/f3
  let s = initialGame();
  s = {
    ...s,
    posA: { x: 4, y: 7 },
    posB: { x: 4, y: 6 },
    walls: [{ x: 4, y: 5, o: "h", by: "B" }], // H(4,5) 挡 (4,5)↔(4,6) 边
    turn: "A",
  };
  const moves = legalPawnMoves(s, "A");
  const straight = moves.some((v) => v.x === 4 && v.y === 5);
  const diagLeft = moves.some((v) => v.x === 3 && v.y === 6); // d3
  const diagRight = moves.some((v) => v.x === 5 && v.y === 6); // f3
  assert(!straight, "直跳位被板堵住");
  assert(diagLeft && diagRight, "可斜跳至 d3 / f3");
}

/* —— 4. 斜跳侧墙封死 —— */
{
  // 斜跳目标一侧被 V 板封住时不可跳那侧
  let s = initialGame();
  s = {
    ...s,
    posA: { x: 4, y: 7 },
    posB: { x: 4, y: 6 },
    walls: [
      { x: 4, y: 5, o: "h", by: "B" }, // 堵直跳
      { x: 3, y: 5, o: "v", by: "B" }, // V(3,5) 挡 (3,5)↔(4,5)? 需挡 e3→d3 即 (4,6)↔(3,6)：V 挡 (wx,wy)↔(wx+1,wy)，此处 (3,6)↔(4,6) → V(3, 5) 或 V(3,6)
    ],
    turn: "A",
  };
  // V(3,5) blocks (3,5)↔(4,5) 和 (3,6)↔(4,6) → 封住从 e3 往 d3 的路
  const moves = legalPawnMoves(s, "A");
  assert(!moves.some((v) => v.x === 3 && v.y === 6), "左侧被 V 板封死不可斜跳 d3");
  assert(moves.some((v) => v.x === 5 && v.y === 6), "右侧仍可斜跳 f3");
}

/* —— 5. 挡板冲突 —— */
{
  const s = initialGame();
  // 放 H(4,4)
  const r1 = applyPayload(s, "A", { type: "wall", wall: { x: 4, y: 4, o: "h", by: "A" } });
  assert(r1.ok, "首板 H(4,4) 合法");
  // 同位再放 → overlap
  assert(checkWall(r1.state!, 4, 4, "h", "B").reason === "overlap", "同位重叠驳回");
  // 邻位同向 → overlap
  assert(checkWall(r1.state!, 5, 4, "h", "B").reason === "overlap", "H(x+1) 共槽驳回");
  assert(checkWall(r1.state!, 3, 4, "h", "B").reason === "overlap", "H(x-1) 共槽驳回");
  // 同锚点异向 → cross
  assert(checkWall(r1.state!, 4, 4, "v", "B").reason === "cross", "十字交叉驳回");
  // 端点相接（x+2）合法
  assert(checkWall(r1.state!, 6, 4, "h", "B").ok, "端点相接合法");
  // T 形（V 在 (4,5)）合法
  assert(checkWall(r1.state!, 4, 5, "v", "B").ok, "丁字搭接合法");
  // V 共线邻位
  const r2 = applyPayload(r1.state!, "B", { type: "wall", wall: { x: 2, y: 2, o: "v", by: "B" } });
  assert(r2.ok, "V(2,2) 合法");
  assert(checkWall(r2.state!, 2, 3, "v", "A").reason === "overlap", "V(y+1) 共槽驳回");
  assert(checkWall(r2.state!, 2, 4, "v", "A").ok, "V(y+2) 端点相接合法");
}

/* —— 6. 断路驳回（BFS） —— */
{
  // 底行上边被 H(0,7) H(2,7) H(4,7) H(6,7) 盖住列 0–7 → 甲只能从 i 列绕行（12 步）
  const s = initialGame();
  const walls = [];
  for (let x = 0; x <= 6; x += 2) walls.push({ x, y: 7, o: "h" as const, by: "B" as const });
  const st = { ...s, walls, wallsB: 10 - walls.length, turn: "A" };
  const dA = shortestPathLength(st, "A");
  const dB = shortestPathLength(st, "B");
  assert(dA === 12, `甲被迫绕行 i 列，最短路 12 步（得 ${dA}）`);
  assert(dB === 12, `乙入底行也须走 i 列口（得 ${dB}）`);
  // 封死最后一口的 H(7,7) 与 H(6,7) 共槽 → overlap 驳回（结构性保底：永远留一口）
  assert(checkWall(st, 7, 7, "h", "B").reason === "overlap", "封口的第五板共槽驳回");
}

/* —— 7. BFS 无路检测 —— */
{
  const grids = { h: new Uint8Array(64), v: new Uint8Array(64) };
  // 封死 (4,4) 四邻：上 H(4,3)、下 H(4,4)、左 V(3,3)、右 V(4,3)
  grids.h[3 * 8 + 4] = 1; // H(4,3)：挡 (4,3)↔(4,4)（上边）
  grids.h[4 * 8 + 4] = 1; // H(4,4)：挡 (4,4)↔(4,5)（下边）
  grids.v[3 * 8 + 3] = 1; // V(3,3)：挡 (3,4)↔(4,4)（左边）
  grids.v[3 * 8 + 4] = 1; // V(4,3)：挡 (4,4)↔(5,4)（右边）
  const { bfsDistanceToGoal } = await import("../src/lib/game/engine");
  const d = bfsDistanceToGoal(grids, { x: 4, y: 4 }, "A");
  assert(d === -1, `四邻全封 → BFS 返回 -1（无路），得 ${d}`);
}

/* —— 8. 记谱 —— */
{
  const s = initialGame();
  const r = applyPayload(s, "A", { type: "pawn", from: s.posA, to: { x: 4, y: 7 } });
  assert(r.state!.history[0].notation === "e1→e2", `移子记谱 e1→e2，得 ${r.state!.history[0].notation}`);
  const r2 = applyPayload(r.state!, "B", { type: "wall", wall: { x: 3, y: 5, o: "v", by: "B" } });
  assert(r2.state!.history[1].notation === "WALL d3-V", `放板记谱 WALL d3-V，得 ${r2.state!.history[1].notation}`);
}

/* —— 9. 胜负 —— */
{
  const s = { ...initialGame(), posA: { x: 4, y: 1 }, posB: { x: 0, y: 8 }, turn: "A" };
  const r = applyPayload(s, "A", { type: "pawn", from: s.posA, to: { x: 4, y: 0 } });
  assert(r.ok && r.state!.winner === "A" && r.state!.winReason === "goal", "甲抵达顶行获胜");
  const s2 = initialGame();
  const rs = applyResign(s2, "B");
  assert(rs.winner === "A" && rs.winReason === "resign", "乙认输则甲胜");
}

/* —— 10. 回放重建 —— */
{
  const s = initialGame();
  const m1 = applyPayload(s, "A", { type: "pawn", from: s.posA, to: { x: 4, y: 7 } }).state!;
  const m2 = applyPayload(m1, "B", { type: "wall", wall: { x: 3, y: 5, o: "v", by: "B" } }).state!;
  const rebuilt = stateFromHistory(m2.history);
  assert(rebuilt.posA.x === 4 && rebuilt.posA.y === 7, "回放重建甲位置");
  assert(rebuilt.walls.length === 1 && rebuilt.wallsB === 9, "回放重建挡板");
  assert(rebuilt.turn === "A", "回放重建轮次");
}

/* —— 11. AI 三档 —— */
{
  for (const level of [1, 2, 3] as const) {
    const s = { ...initialGame(), turn: "B" };
    const t0 = Date.now();
    const d = computeAiMove(s, level);
    const dt = Date.now() - t0;
    assert(!!d, `AI level ${level} 给出着法`);
    if (d) {
      const legal = d.payload.type === "wall" ? true : true;
      const applied = applyPayload(s, "B", d.payload);
      assert(applied.ok, `AI level ${level} 着法合法（${d.payload.type}）`);
    }
    console.log(`  AI level ${level} 用时 ${dt}ms`);
    assert(dt < 1500, `AI level ${level} 计算不超时`);
  }
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
if (fail > 0) process.exit(1);
