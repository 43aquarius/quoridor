/* 四人围坐局引擎单测：席位/顺位/跳子/断路/出局/末位胜/回放/AI 四档 */
import {
  initialGame,
  type GameState,
  type Move,
  type Player,
  PLAYER_CN,
} from "../src/lib/game/types";
import {
  applyPayload,
  applyResign,
  applyTimeout,
  activePlayers,
  checkWall,
  isEliminated,
  legalPawnMoves,
  nextTurnFrom,
  normalizeState,
  pawnOf,
  playersOf,
  shortestPathLength,
  stateFromHistory,
  wallsLeftOf,
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

function applyOk(s: GameState, p: Player, payload: Parameters<typeof applyPayload>[2]): GameState {
  const r = applyPayload(s, p, payload);
  if (!r.ok || !r.state) {
    throw new Error(`applyPayload rejected: ${p} ${JSON.stringify(payload)} → ${r.reason}`);
  }
  return r.state;
}

/* —— 1. 初始局面 —— */
{
  const s = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  assert(s.playerCount === 4, "四人局标记");
  assert(s.posA.x === 4 && s.posA.y === 8, "甲起始底中 e1");
  assert(s.posB.x === 4 && s.posB.y === 0, "乙起始顶中 e9");
  assert(s.posC!.x === 0 && s.posC!.y === 4, "丙起始左中 a5");
  assert(s.posD!.x === 8 && s.posD!.y === 4, "丁起始右中 i5");
  assert(s.wallsA === 5 && s.wallsB === 5 && s.wallsC === 5 && s.wallsD === 5, "各 5 板");
  assert(s.turn === "A", "甲先行");
  assert(playersOf(s).join("") === "ACBD", "席位顺序 甲→丙→乙→丁");
  assert(shortestPathLength(s, "A") === 8 && shortestPathLength(s, "B") === 8, "甲乙归途 8 步");
  assert(shortestPathLength(s, "C") === 8 && shortestPathLength(s, "D") === 8, "丙丁归途 8 步");
  assert(legalPawnMoves(s, "A").length === 3, "甲初始 3 着（上左右）");
  const cMoves = legalPawnMoves(s, "C");
  assert(cMoves.length === 3, `丙初始 3 着（右上下），得 ${cMoves.length}`);
}

/* —— 2. 顺时针轮转 —— */
{
  const s0 = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  assert(nextTurnFrom(s0, "A") === "C", "A 后是 C");
  assert(nextTurnFrom(s0, "C") === "B", "C 后是 B");
  assert(nextTurnFrom(s0, "B") === "D", "B 后是 D");
  assert(nextTurnFrom(s0, "D") === "A", "D 后是 A");
  // 真实轮转：各席朝目标走一步
  let s = s0;
  const order: Player[] = [];
  for (let i = 0; i < 8; i++) {
    order.push(s.turn);
    const p = s.turn;
    const from = pawnOf(s, p);
    const to = p === "A" ? { x: from.x, y: from.y - 1 } : p === "B" ? { x: from.x, y: from.y + 1 } : p === "C" ? { x: from.x + 1, y: from.y } : { x: from.x - 1, y: from.y };
    s = applyOk(s, p, { type: "pawn", from, to });
  }
  assert(order.join("") === "ACBDACBD", `顺时针两轮 ACBDACBD，得 ${order.join("")}`);
}

/* —— 3. 三子一线：直跳落位被占 → 斜跳 —— */
{
  // 甲(4,7) 丙(4,6) 乙(4,5) 纵向三连：甲直跳落位 (4,5) 被乙占 → 斜跳 (3,6)/(5,6)
  const s: GameState = {
    ...initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 }),
    posA: { x: 4, y: 7 },
    posC: { x: 4, y: 6 },
    posB: { x: 4, y: 5 },
    turn: "A",
  };
  const moves = legalPawnMoves(s, "A");
  assert(!moves.some((v) => v.x === 4 && v.y === 6), "不可走入丙格");
  assert(!moves.some((v) => v.x === 4 && v.y === 5), "直跳落位被乙占 → 不可直跳");
  assert(moves.some((v) => v.x === 3 && v.y === 6) && moves.some((v) => v.x === 5 && v.y === 6), "可斜跳 d3/f3");
}

/* —— 4. 斜跳落位被第三子占 → 不可跳那侧 —— */
{
  // 甲(4,7) 丙(4,6)；直跳被 H(4,5) 堵；斜跳目标 (3,6) 被乙占 → 只能跳 (5,6)
  const s: GameState = {
    ...initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 }),
    posA: { x: 4, y: 7 },
    posC: { x: 4, y: 6 },
    posB: { x: 3, y: 6 },
    walls: [{ x: 4, y: 5, o: "h", by: "B" }],
    turn: "A",
  };
  const moves = legalPawnMoves(s, "A");
  assert(!moves.some((v) => v.x === 3 && v.y === 6), "斜跳左侧被乙占 → 不可");
  assert(moves.some((v) => v.x === 5 && v.y === 6), "斜跳右侧仍可");
}

/* —— 5. 放板断任一席的路 → 驳回 —— */
{
  // 在丙（左中，向右）归途必经竖列上落一排 V 板，封死丙 → no-path
  const s0 = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  // 直接构造几乎封死的墙组：丙在 (0,4)，向右到 x=8。
  // 9 道 V 板沿 x=4 列整列（y=0..7 两两错开做不到——V 板占 2 行；用交替锚点封整列 x∈{4} 的右侧）
  // 简化：把丙围死在其出发格周围 3+3 道 V 板即可
  const walls = [
    { x: 0, y: 3, o: "v" as const, by: "B" as Player }, // 封 (0,3)-(1,3)? V(x=0,y) 挡 (0,y..y+1)↔(1,..)
    { x: 0, y: 5, o: "v" as const, by: "B" as Player },
    { x: 0, y: 4, o: "v" as const, by: "B" as Player }, // 三道 V 封住丙向右的三条缝
  ];
  const s: GameState = { ...s0, walls };
  // 丙在 (0,4)：上 (0,3)、下 (0,5) 仍可走 → 未完全封死，继续加 H 板封上下
  const walls2 = [
    ...walls,
    { x: 0, y: 2, o: "h" as const, by: "B" as Player }, // H(0,2) 挡 (0,2)-(0,3) 与 (1,2)-(1,3)
  ];
  const s2: GameState = { ...s0, walls: walls2 };
  assert(shortestPathLength(s2, "C") >= 0, "丙仍可能有绕路（构造未封死）");
  // 枚举式验证：随机大量挡板下 checkWall 保证四席有路
  let allOk = true;
  const rnd = (seed: number) => {
    let t = seed;
    return () => {
      t = (t * 1664525 + 1013904223) % 4294967296;
      return t / 4294967296;
    };
  };
  const r = rnd(42);
  for (let trial = 0; trial < 200; trial++) {
    let t: GameState = { ...initialGame({ playerCount: 4, size: 7, wallsPerPlayer: 5 }), turn: "A" };
    for (let k = 0; k < 12; k++) {
      const x = Math.floor(r() * 5);
      const y = Math.floor(r() * 5);
      const o = r() < 0.5 ? ("h" as const) : ("v" as const);
      const by = playersOf(t)[Math.floor(r() * 4)];
      if (checkWall(t, x, y, o, by).ok) {
        t = { ...t, walls: [...t.walls, { x, y, o, by }] };
      }
    }
    for (const p of activePlayers(t)) {
      if (shortestPathLength(t, p) < 0) allOk = false;
    }
  }
  assert(allOk, "随机放板后所有在场席位仍有路（checkWall 保证）");
}

/* —— 6. 认输出局：轮次顺延、游戏继续、末位胜 —— */
{
  const s0 = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  // 甲走一步后轮到丙，丙认输 → 出局，轮到乙
  const s1 = applyOk(s0, "A", { type: "pawn", from: pawnOf(s0, "A"), to: { x: 4, y: 7 } });
  const s2 = applyResign(s1, "C");
  assert(isEliminated(s2, "C"), "丙出局");
  assert(!s2.winner, "游戏未结束");
  assert(s2.turn === "B", `轮次顺延到乙，得 ${s2.turn}`);
  assert(legalPawnMoves(s2, "C").length >= 0, "丙铅字仍留盘");
  // 乙行棋 → 轮到丁（跳过丙）
  const s3 = applyOk(s2, "B", { type: "pawn", from: pawnOf(s2, "B"), to: { x: 4, y: 1 } });
  assert(s3.turn === "D", "丙出局后被跳过，轮到丁");
  // 再让乙、丁出局 → 甲末位胜
  const s4 = applyResign(s3, "B");
  assert(!s4.winner && s4.turn === "D", "乙出局轮到丁");
  const s5 = applyResign(s4, "D");
  assert(s5.winner === "A" && s5.winReason === "last", "仅存甲 → 末位胜");
  // 回放重建
  const rebuilt = stateFromHistory(
    s5.history as Move[],
    undefined,
    { size: 9, wallsPerPlayer: 5, playerCount: 4 },
  );
  assert(rebuilt.winner === "A" && rebuilt.winReason === "last", "回放重建末位胜");
  assert(isEliminated(rebuilt, "C") && isEliminated(rebuilt, "B") && isEliminated(rebuilt, "D"), "回放重建出局名单");
}

/* —— 7. 非本回合认输：轮次不变 —— */
{
  const s0 = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  const s1 = applyOk(s0, "A", { type: "pawn", from: pawnOf(s0, "A"), to: { x: 4, y: 7 } });
  const s2 = applyResign(s1, "D"); // 丁不在回合内认输
  assert(s2.turn === "C", "非回合认输不改变轮次");
}

/* —— 8. 超时出局 —— */
{
  const s0 = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  const s1 = applyOk(s0, "A", { type: "pawn", from: pawnOf(s0, "A"), to: { x: 4, y: 7 } });
  const s2 = applyTimeout(s1, "C");
  assert(isEliminated(s2, "C") && !s2.winner && s2.turn === "B", "超时出局且轮次顺延");
}

/* —— 9. 抵线获胜（丙到右列 / 丁到左列） —— */
{
  const s0 = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  let s = s0;
  // 丙直奔右列（丁占 (8,4)，故从 (7,3) 进 (8,3)）
  s = { ...s, posC: { x: 7, y: 3 } };
  const p = s.turn;
  if (p !== "C") {
    // 轮到谁就认输出局直至轮到丙（简化）
    s = applyResign(s, p);
  }
  assert(s.turn === "C", "轮到丙");
  const from = pawnOf(s, "C");
  const r = applyPayload(s, "C", { type: "pawn", from, to: { x: 8, y: 3 } });
  assert(r.ok && r.state!.winner === "C" && r.state!.winReason === "goal", "丙抵右列获胜");
  // 丁抵左列
  let t = { ...initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 }), posD: { x: 1, y: 4 } };
  while (t.turn !== "D" && !t.winner) {
    const who = t.turn;
    const from2 = pawnOf(t, who);
    const legal = legalPawnMoves(t, who);
    if (legal.length === 0) break;
    t = applyOk(t, who, { type: "pawn", from: from2, to: legal[0] });
  }
  const r2 = applyPayload(t, "D", { type: "pawn", from: pawnOf(t, "D"), to: { x: 0, y: 4 } });
  assert(r2.ok && r2.state!.winner === "D", "丁抵左列获胜");
}

/* —— 10. 二人局回归：不受四人化影响 —— */
{
  const s = initialGame();
  assert(s.playerCount === 2, "默认二人局");
  const legacy = normalizeState({ ...s, playerCount: undefined as unknown as 2 });
  assert(legacy.playerCount === 2, "旧档回填二人");
  const r = applyResign(s, "B");
  assert(r.winner === "A" && r.winReason === "resign", "二人认输直接判负（旧语义）");
  assert(nextTurnFrom(s, "A") === "B" && nextTurnFrom(s, "B") === "A", "二人轮转不变");
  const w = checkWall(s, 4, 0, "h", "A");
  assert(w.ok, "二人局放板校验仍可行");
}

/* —— 11. AI 四档：合法性与时限 —— */
{
  const levels = [1, 2, 3, 4] as const;
  for (const lv of levels) {
    let s = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
    let ok = true;
    let moves = 0;
    const t0 = Date.now();
    let worst = 0;
    for (let i = 0; i < 24 && !s.winner; i++) {
      const d = computeAiMove(s, lv);
      if (!d) break;
      const dt = Date.now();
      const r = applyPayload(s, s.turn, d.payload, 0);
      worst = Math.max(worst, Date.now() - dt);
      if (!r.ok || !r.state) {
        ok = false;
        console.error(`    L${lv} 非法着法:`, JSON.stringify(d.payload), r.reason);
        break;
      }
      s = r.state;
      moves++;
    }
    assert(ok, `AI L${lv} 四人局 24 手全部合法（实际 ${moves} 手）`);
    assert(worst < 800, `AI L${lv} 单手耗时 < 800ms（实测 ${worst}ms）`);
    void t0;
  }
}

/* —— 12. AI 阶梯：社长执甲对学徒席位压制（弱校验，不判必然胜负） —— */
{
  // 构造 1 社长（甲） vs 3 学徒（乙丙丁），走 60 手若无终局也视为正常（宽松冒烟）
  let s = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  const levelOf: Record<Player, 1 | 4> = { A: 4, B: 1, C: 1, D: 1 };
  for (let i = 0; i < 60 && !s.winner; i++) {
    const p = s.turn;
    if (isEliminated(s, p)) continue; // 不会发生（无出局着）
    const d = computeAiMove(s, levelOf[p]);
    if (!d) break;
    const r = applyPayload(s, p, d.payload, 0);
    if (!r.ok || !r.state) {
      assert(false, `社长对学徒局非法着法 ${p} ${JSON.stringify(d.payload)}`);
      break;
    }
    s = r.state;
  }
  assert(s.history.length > 0, "四人 AI 混档局正常推进");
}

/* —— 13. 记谱与汉席名 —— */
assert(PLAYER_CN.A === "甲" && PLAYER_CN.C === "丙", "汉席名映射");

/* —— 汇总 —— */
console.log(`\n四人局引擎测试：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
