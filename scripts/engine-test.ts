/* 引擎单元测试：跳子、挡板冲突/断路、记谱、胜负、AI 三档 */
import { initialGame, type GameState, type Move, type MovePayload } from "../src/lib/game/types";
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
  const s: GameState = { ...initialGame(), posA: { x: 4, y: 7 }, posB: { x: 4, y: 6 }, turn: "A" };
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
  let s: GameState = initialGame();
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
  let s: GameState = initialGame();
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
  const walls: GameState["walls"] = [];
  for (let x = 0; x <= 6; x += 2) walls.push({ x, y: 7, o: "h" as const, by: "B" as const });
  const st: GameState = { ...s, walls, wallsB: 10 - walls.length, turn: "A" };
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
  const s: GameState = { ...initialGame(), posA: { x: 4, y: 1 }, posB: { x: 0, y: 8 }, turn: "A" };
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

/* —— 11. AI 四档 —— */
{
  for (const level of [1, 2, 3, 4] as const) {
    const s: GameState = { ...initialGame(), turn: "B" };
    const t0 = Date.now();
    const d = computeAiMove(s, level);
    const dt = Date.now() - t0;
    assert(!!d, `AI level ${level} 给出着法`);
    if (d) {
      const applied = applyPayload(s, "B", d.payload);
      assert(applied.ok, `AI level ${level} 着法合法（${d.payload.type}）`);
    }
    console.log(`  AI level ${level} 用时 ${dt}ms`);
    const limit = level >= 4 ? 3400 : level === 3 ? 1800 : 1500;
    assert(dt < limit, `AI level ${level} 计算不超时（${dt}ms < ${limit}ms）`);
  }
}

/* —— 12. 可变棋盘尺寸 —— */
{
  const cases: Array<{ n: number; walls: number; mid: number; straight: number }> = [
    { n: 5, walls: 5, mid: 2, straight: 4 },
    { n: 7, walls: 8, mid: 3, straight: 6 },
    { n: 9, walls: 10, mid: 4, straight: 8 },
    { n: 11, walls: 12, mid: 5, straight: 10 },
    { n: 13, walls: 14, mid: 6, straight: 12 },
  ];
  for (const { n, walls, mid, straight } of cases) {
    const s = initialGame({ size: n, wallsPerPlayer: walls });
    assert(s.size === n && s.wallsStart === walls, `${n}×${n} 初始规格`);
    assert(s.posA.x === mid && s.posA.y === n - 1, `${n} 路甲起始中列底行`);
    assert(s.posB.x === mid && s.posB.y === 0, `${n} 路乙起始中列顶行`);
    assert(s.wallsA === walls && s.wallsB === walls, `${n} 路 each ${walls} 板`);
    assert(shortestPathLength(s, "A") === straight, `${n} 路甲初始最短 ${straight} 步`);
    assert(shortestPathLength(s, "B") === straight, `${n} 路乙初始最短 ${straight} 步`);
    const moves = legalPawnMoves(s, "A");
    assert(moves.length === 3, `${n} 路甲初始 3 着`);
    // 尺寸边界：放板锚点 0..n-2
    const st: GameState = { ...s, turn: "A" };
    assert(checkWall(st, n - 2, n - 2, "h", "A").ok, `${n} 路最大锚点 (n-2,n-2) 合法`);
    assert(
      checkWall(st, n - 1, n - 1, "h", "A").reason === "out-of-bounds",
      `${n} 路锚点 (n-1,n-1) 越界驳回`,
    );
  }
}

/* —— 13. 尺寸记谱 —— */
{
  const s13 = initialGame({ size: 13, wallsPerPlayer: 14 });
  const r = applyPayload(s13, "A", { type: "pawn", from: s13.posA, to: { x: 6, y: 11 } });
  assert(r.ok && r.state!.history[0].notation === "g1→g2", `13 路移子记谱 g1→g2，得 ${r.state?.history[0].notation}`);
  const r2 = applyPayload(r.state!, "B", { type: "wall", wall: { x: 5, y: 11, o: "v", by: "B" } });
  assert(r2.ok && r2.state!.history[1].notation === "WALL f1-V", `13 路放板记谱 WALL f1-V，得 ${r2.state?.history[1].notation}`);
  const s5 = initialGame({ size: 5, wallsPerPlayer: 5 });
  const r3 = applyPayload(s5, "A", { type: "pawn", from: s5.posA, to: { x: 2, y: 3 } });
  assert(r3.ok && r3.state!.history[0].notation === "c1→c2", `5 路移子记谱 c1→c2，得 ${r3.state?.history[0].notation}`);
  // 5 路顶行即第 5 行（乙挪开，甲可入顶行）
  const nearWin = { ...s5, posA: { x: 2, y: 1 }, posB: { x: 0, y: 0 }, turn: "A" as const };
  const r4 = applyPayload(nearWin, "A", { type: "pawn", from: nearWin.posA, to: { x: 2, y: 0 } });
  assert(r4.ok && r4.state!.winner === "A", "5 路抵达顶行获胜");
}

/* —— 14. 7×7 挡板冲突与断路 —— */
{
  const s = initialGame({ size: 7, wallsPerPlayer: 8 });
  const r1 = applyPayload(s, "A", { type: "wall", wall: { x: 3, y: 3, o: "h", by: "A" } });
  assert(r1.ok, "7 路 H(3,3) 合法");
  assert(checkWall(r1.state!, 4, 3, "h", "B").reason === "overlap", "7 路共槽驳回");
  assert(checkWall(r1.state!, 3, 3, "v", "B").reason === "cross", "7 路交叉驳回");
  assert(checkWall(r1.state!, 5, 3, "h", "B").ok, "7 路端点相接合法");
  // 底行封口：7 路底行上缘锚 y=5，x=0..5 步进 2
  const st: GameState = { ...s, walls: [
    { x: 0, y: 5, o: "h" as const, by: "B" as const },
    { x: 2, y: 5, o: "h" as const, by: "B" as const },
    { x: 4, y: 5, o: "h" as const, by: "B" as const },
  ], wallsB: 8 - 3, turn: "A" } as GameState;
  const dA = shortestPathLength(st, "A");
  assert(dA === 9, `7 路甲绕 g 列 3+6=9 步（得 ${dA}）`);
}

/* —— 15. 5×5 断路（无路 BFS + checkWall 驳回） —— */
{
  // 甲在底行：H(0,3)+H(2,3) 封 a/b/c/d 列上缘，V(3,3) 封 d1→e1 → 甲无路
  const s = initialGame({ size: 5, wallsPerPlayer: 5 });
  const st: GameState = { ...s, walls: [
    { x: 0, y: 3, o: "h" as const, by: "B" as const },
    { x: 2, y: 3, o: "h" as const, by: "B" as const },
  ], turn: "A" as const };
  const chk = checkWall(st, 3, 3, "v", "A");
  assert(chk.reason === "no-path", `5 路封口板断路驳回（得 ${chk.reason}）`);
  // 位图直接验证：封死 (2,3) 四邻（W=4）
  const grids = { h: new Uint8Array(16), v: new Uint8Array(16) };
  grids.h[2 * 4 + 2] = 1; // 上缘 H(2,2)：挡 (2,2)↔(2,3)
  grids.h[3 * 4 + 2] = 1; // 下缘 H(2,3)：挡 (2,3)↔(2,4)
  grids.v[3 * 4 + 1] = 1; // 左缘 V(1,3)：挡 (1,3)↔(2,3)
  grids.v[3 * 4 + 2] = 1; // 右缘 V(2,3)：挡 (2,3)↔(3,3)
  const { bfsDistanceToGoal } = await import("../src/lib/game/engine");
  const d = bfsDistanceToGoal(grids, { x: 2, y: 3 }, "A", 5);
  assert(d === -1, `5 路四邻全封 BFS -1（得 ${d}）`);
}

/* —— 16. 带规格回放重建 —— */
{
  const s = initialGame({ size: 7, wallsPerPlayer: 8 });
  const m1 = applyPayload(s, "A", { type: "pawn", from: s.posA, to: { x: 3, y: 5 } }).state!;
  const m2 = applyPayload(m1, "B", { type: "wall", wall: { x: 2, y: 4, o: "v", by: "B" } }).state!;
  const rebuilt = stateFromHistory(m2.history, undefined, { size: 7, wallsPerPlayer: 8 });
  assert(rebuilt.size === 7 && rebuilt.wallsStart === 8, "回放重建规格");
  assert(rebuilt.posA.x === 3 && rebuilt.posA.y === 5, "回放重建甲位置");
  assert(rebuilt.wallsB === 7, "回放重建挡板余量");
}

/* —— 17. 旧档兼容（缺 size/wallsStart 字段） —— */
{
  const legacy = JSON.parse(JSON.stringify(initialGame({ size: 9, wallsPerPlayer: 10 })));
  const stripped = { ...legacy };
  delete stripped.size;
  delete stripped.wallsStart;
  const { normalizeState } = await import("../src/lib/game/types");
  const fixed = normalizeState(stripped as never);
  assert(fixed.size === 9 && fixed.wallsStart === 10, "旧档回填 9×10");
  const rebuilt = stateFromHistory(
    [{ n: 1, player: "A", notation: "", elapsedMs: 0, t: 0, payload: { type: "pawn", from: { x: 4, y: 8 }, to: { x: 4, y: 7 } } }],
    undefined,
    { size: 9, wallsPerPlayer: 10 },
  );
  assert(rebuilt.posA.y === 7, "旧档着法按 9 路重建");
}

/* —— 18. AI 在 5 路与 11 路上的合法性与时限 —— */
{
  for (const [n, walls] of [[5, 5], [11, 12]] as const) {
    for (const level of [1, 2, 3, 4] as const) {
      const s = { ...initialGame({ size: n, wallsPerPlayer: walls }), turn: "B" as const };
      const t0 = Date.now();
      const d = computeAiMove(s, level);
      const dt = Date.now() - t0;
      assert(!!d, `AI level ${level} @ ${n} 路给出着法`);
      if (d) {
        const applied = applyPayload(s, "B", d.payload);
        assert(applied.ok, `AI level ${level} @ ${n} 路 着法合法（${d.payload.type}）`);
      }
      const limit = level >= 4 ? 4200 : level === 3 ? 2300 : 2200;
      assert(dt < limit, `AI level ${level} @ ${n} 路不超时（${dt}ms < ${limit}ms）`);
      console.log(`  AI level ${level} @ ${n}×${n} 用时 ${dt}ms`);
    }
  }
}


/* —— 19. 超时判负 —— */
{
  const { applyTimeout, applyResign } = await import("../src/lib/game/engine");
  const s = initialGame();
  const t = applyTimeout(s, "B");
  assert(t.winner === "A" && t.winReason === "timeout", "乙超时则甲胜（winReason=timeout）");
  assert(t.history.length === 1, "超时着入历史");
  assert(t.history[0].notation === "乙超时", "超时记谱「乙超时」");
  assert(t.history[0].payload.type === "timeout", "超时 payload 类型");
  // 回放重建：timeout 着可重建结局
  const m1 = applyPayload(s, "A", { type: "pawn", from: s.posA, to: { x: 4, y: 7 } }).state!;
  const t2 = applyTimeout(m1, "A");
  const rebuilt = stateFromHistory(t2.history);
  assert(rebuilt.winner === "B" && rebuilt.winReason === "timeout", "由历史重建超时结局");
  // 引擎层 applyResign / applyTimeout 不做幂等（由 store 层 winner 守卫）：
  // 在未分胜负的局面分别调用各自语义正确
  const live = applyPayload(s, "A", { type: "pawn", from: s.posA, to: { x: 4, y: 7 } }).state!;
  const rr = applyResign(live, "A");
  assert(rr.winner === "B" && rr.winReason === "resign", "活跃局面认输语义正确");
  assert(t2.winner === "B" && t2.winReason === "timeout", "超时结局保持不变");
}

/* —— 20. 棋钟规格清洗 —— */
{
  const { normalizeConfig, normalizeTimeControl, DEFAULT_TIME, TIME_PRESETS, isTimed, timeLabel } =
    await import("../src/lib/game/types");
  assert(normalizeTimeControl(null).totalSec === 0 && normalizeTimeControl(null).perMoveSec === 0, "空棋钟归不限时");
  assert(normalizeTimeControl({ totalSec: -5, perMoveSec: 999999 }).totalSec === 0, "负值归零");
  assert(normalizeTimeControl({ totalSec: 300, perMoveSec: 30 }).totalSec === 300, "正常值保留");
  const cfg = normalizeConfig({ size: 9, wallsPerPlayer: 10, timeControl: { totalSec: 180, perMoveSec: 15 } });
  assert(cfg.timeControl.totalSec === 180 && cfg.timeControl.perMoveSec === 15, "normalizeConfig 携带棋钟");
  const legacy = normalizeConfig({ size: 9, wallsPerPlayer: 10 });
  assert(legacy.timeControl.totalSec === DEFAULT_TIME.totalSec, "旧配置缺棋钟回填不限时");
  assert(TIME_PRESETS.length === 4, "四档棋钟预设");
  assert(isTimed({ totalSec: 0, perMoveSec: 15 }) && !isTimed(DEFAULT_TIME), "isTimed 判定");
  assert(timeLabel({ totalSec: 180, perMoveSec: 15 }).includes("3 分"), "timeLabel 分数格式");
  assert(timeLabel(DEFAULT_TIME) === "不限时", "timeLabel 不限时");
}

/* —— 21. AI 即胜捷径（任意档位一步取胜不放过） —— */
{
  // 甲距顶行一步：各档都应直接走 e9
  const s: GameState = { ...initialGame(), posA: { x: 4, y: 1 }, posB: { x: 0, y: 8 }, turn: "A" };
  for (const level of [1, 2, 3, 4] as const) {
    const d = computeAiMove(s, level);
    assert(d?.payload.type === "pawn" && d.payload.to.y === 0, `AI level ${level} 抓住一步致胜`);
  }
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
if (fail > 0) process.exit(1);
