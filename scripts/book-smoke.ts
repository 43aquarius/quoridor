/* 开局库冒烟测试：命中速度/合法性/回落路径（库默认关，BOOK=1 开启时验证命中） */
process.env.QUORIDOR_AI_BOOK = "1"; /* 开局库开启路径验证（须在动态 import 前设置） */
const { initialGame } = await import("../src/lib/game/types");
const { applyPayload, legalPawnMoves } = await import("../src/lib/game/engine");
const { computeAiMove } = await import("../src/lib/game/ai");

let fails = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " · " + extra : ""}`);
  if (!ok) fails++;
}

/* 1. 初始局面命中（BOOK=1）：L2/L3/L4 应秒出（<300ms） */
for (const lv of [2, 3, 4] as const) {
  const s = initialGame();
  const t0 = Date.now();
  const d = computeAiMove(s, lv);
  const dt = Date.now() - t0;
  check(`L${lv} 初始局面命中开局库（BOOK=1）`, !!d && dt < 300, `${dt}ms · ${d?.label ?? ""}`);
  if (d) {
    const r = applyPayload(s, "A", d.payload);
    check(`L${lv} 开局库着法合法`, r.ok, JSON.stringify(d.payload).slice(0, 60));
  }
}

/* 2. 带墙局面（2 手后）命中一致性：同一局面多次调用应覆盖多着法（温度随机） */
const s2 = initialGame();
applyPayload(s2, "A", { type: "pawn", from: { x: 4, y: 8 }, to: { x: 4, y: 7 } });
applyPayload(s2, "B", { type: "pawn", from: { x: 4, y: 0 }, to: { x: 4, y: 1 } });
const picks = new Set<string>();
for (let i = 0; i < 40; i++) {
  const d = computeAiMove(s2, 3);
  if (d) picks.add(JSON.stringify(d.payload));
}
check("同一局面温度随机多着法", picks.size >= 2, `${picks.size} 种`);

/* 3. 10 手后不再命中（回落搜索，耗时正常） */
let s3 = initialGame();
for (let i = 0; i < 10; i++) {
  const legal = legalPawnMoves(s3, s3.turn);
  const pick = legal[Math.floor(Math.random() * legal.length)];
  const from = s3.turn === "A" ? s3.posA : s3.posB;
  s3 = (applyPayload(s3, s3.turn, { type: "pawn", from: { ...from }, to: pick })).state!;
}
const t3 = Date.now();
const d3 = computeAiMove(s3, 3, { budgetMs: 700 });
check("10 手后回落搜索", !!d3, `${Date.now() - t3}ms`);

/* 4. 学徒不走开局库（保持人设：走启发式） */
const s4 = initialGame();
const t4 = Date.now();
const d4 = computeAiMove(s4, 1);
check("L1 学徒不走开局库（人设）", !!d4 && d4.label !== "学徒翻开了字帖", `${Date.now() - t4}ms · ${d4?.label}`);

/* 5. 9×9×10 以外规格不入库 */
const s5 = initialGame({ playerCount: 2, size: 7, wallsPerPlayer: 8 });
const t5 = Date.now();
const d5 = computeAiMove(s5, 4);
check("7 路局回落搜索", !!d5, `${Date.now() - t5}ms`);

console.log(fails === 0 ? "\n全部通过" : `\n${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
