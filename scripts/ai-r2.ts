/* 第二轮强化（v5）验证：
 *  - eq     ：等预算 700ms 的 L4×L3 梯度
 *  - native ：原生预算抽样（L4 6000 / L2 800）+ 每档耗时统计
 *  - micro  ：学徒 v3 微测试（终局封路 / 纯竞速免动手）
 * bun run scripts/ai-r2.ts [eq|native|micro]
 */
import { initialGame, type AiLevel, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

const timeStat = new Map<AiLevel, { n: number; max: number; sum: number }>();
function stat(level: AiLevel, ms: number) {
  const s = timeStat.get(level) ?? { n: 0, max: 0, sum: 0 };
  s.n++;
  s.max = Math.max(s.max, ms);
  s.sum += ms;
  timeStat.set(level, s);
}

function safeStep(s: GameState, level: AiLevel, cap?: number): GameState {
  const t0 = Date.now();
  const d = computeAiMove(s, level, cap ? { budgetMs: cap } : undefined);
  stat(level, Date.now() - t0);
  if (!d) return s;
  const r = applyPayload(s, s.turn, d.payload);
  if (r.ok && r.state) return r.state;
  const legal = legalPawnMoves(s, s.turn);
  if (legal.length > 0) {
    const r2 = applyPayload(s, s.turn, { type: "pawn", from: s.turn === "A" ? s.posA : s.posB, to: legal[0] });
    if (r2.ok && r2.state) return r2.state;
  }
  return s;
}

function play2(a: AiLevel, b: AiLevel, cap?: number): { winner: Player | null; moves: number } {
  let s: GameState = initialGame();
  let guard = 0;
  while (!s.winner && guard < 500) {
    guard++;
    s = safeStep(s, s.turn === "A" ? a : b, cap);
  }
  return { winner: s.winner, moves: s.history.length };
}

function series(name: string, hi: AiLevel, lo: AiLevel, n: number, cap?: number) {
  let hiWins = 0;
  let loWins = 0;
  let moves = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const g = play2(hi, lo, cap);
    if (g.winner === "A") hiWins++;
    else if (g.winner === "B") loWins++;
    moves += g.moves;
  }
  for (let i = 0; i < n; i++) {
    const g = play2(lo, hi, cap);
    if (g.winner === "A") loWins++;
    else if (g.winner === "B") hiWins++;
    moves += g.moves;
  }
  console.log(`${name}: L${hi} ${hiWins}胜 vs L${lo} ${loWins}胜 · 均${Math.round(moves / (2 * n))}手 · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

function dumpTiming() {
  for (const [lv, s] of [...timeStat.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  L${lv}: ${s.n}手 · 均${Math.round(s.sum / s.n)}ms · 最长${s.max}ms`);
  }
}

const mode = process.argv[2] ?? "eq";

if (mode === "eq") {
  console.log("=== 等预算 700ms · 高档梯度 ===");
  series("社长×总编", 4, 3, 6, 700);
  dumpTiming();
} else if (mode === "l4") {
  console.log("=== 原生预算 L4×L3 扩样 ===");
  series("社长×总编", 4, 3, 2);
  dumpTiming();
} else if (mode === "native") {
  console.log("=== 原生预算抽样（无帽） ===");
  series("社长×总编", 4, 3, 1);
  series("排字师×学徒", 2, 1, 6);
  dumpTiming();
} else if (mode === "4p") {
  console.log("=== 四人桌倒挂对位复测（harmCap 修复后） ===");
  const n4 = Number(process.argv[3] ?? 8);
  function play4(levels: Record<Player, AiLevel>): Player | null {
    let s: GameState = initialGame({ playerCount: 4 });
    let guard = 0;
    while (!s.winner && guard < 800) {
      guard++;
      s = safeStep(s, levels[s.turn as Player]);
    }
    return s.winner;
  }
  function line4(name: string, levels: Record<Player, AiLevel>) {
    const wins: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (let i = 0; i < n4; i++) {
      const w = play4(levels);
      if (w) wins[w]++;
    }
    console.log(`${name} · 甲L${levels.A}${wins.A} 乙L${levels.B}${wins.B} 丙L${levels.C}${wins.C} 丁L${levels.D}${wins.D}`);
  }
  line4("学徒对排字师", { A: 1, B: 2, C: 1, D: 2 });
  line4("学徒对社长", { A: 1, B: 4, C: 1, D: 4 });
  line4("排字师对总编", { A: 2, B: 3, C: 2, D: 3 });
} else if (mode === "micro") {
  console.log("=== 学徒 v3 微测试 ===");
  /* 1. 终局封路：B 无板且领先（opD=2 < myD=3）→ 学徒应放不伤己路的板 */
  {
    const s = initialGame();
    s.posA = { x: 4, y: 8 }; /* A 上行，距 8 */
    s.posB = { x: 4, y: 6 }; /* B 下行，距 2 */
    s.wallsA = 5;
    s.wallsB = 0;
    s.turn = "A";
    const d = computeAiMove(s, 1);
    const ok = d?.payload.type === "wall";
    console.log(`1) 终局封路（B无板临门）: ${ok ? "放板 ✓" : `未放板 ✗（${d?.payload.type}）`}`);
  }
  /* 2. 纯竞速：B 无板且我不落后（myD=2 ≤ opD=2）→ 学徒应寸板不花直接走子 */
  {
    const s = initialGame();
    s.posA = { x: 4, y: 2 }; /* A 距 2 */
    s.posB = { x: 4, y: 6 }; /* B 距 2 */
    s.wallsA = 5;
    s.wallsB = 0;
    s.turn = "A";
    const d = computeAiMove(s, 1);
    const ok = d?.payload.type === "pawn";
    console.log(`2) 纯竞速免动手: ${ok ? "走子 ✓" : `放板了 ✗`}`);
  }
  /* 3. 距离场选步：A 上行、B 恰挡在 A 正前方相邻（A 无法直进，可直跳），
   *    合法着法含直跳(4,6)与横移(3,7)(5,7)——学徒应选直跳 */
  {
    const s = initialGame();
    s.posA = { x: 4, y: 8 };
    s.posB = { x: 4, y: 7 };
    s.wallsA = 0;
    s.wallsB = 0;
    s.turn = "A";
    const d = computeAiMove(s, 1);
    const to = d?.payload.type === "pawn" ? d.payload.to : null;
    const ok = to && to.x === 4 && to.y === 6;
    console.log(`3) 贴身直跳: ${ok ? "跳到(4,6) ✓" : `走到(${to?.x},${to?.y}) ✗`}`);
  }
}
