/* 烟测打包后的 Yoola 核心模块：规则 + AI 全链路 */
global.window = global; // 模拟全局对象
require("/home/z/my-project/quoridor-yoola/package/gameplay/play/core.js");
require("/home/z/my-project/quoridor-yoola/package/gameplay/play/ai.js");

const G = window.AIGCUtils;
const C = G.Core, AI = G.AiMod;
console.log("Core exports:", Object.keys(C).length, "| Ai:", typeof AI.computeAiMove);

// 1. 初始局面
let st = C.initialGame({ size: 9, wallsPerPlayer: 10 });
console.log("initial:", st.size + "x" + st.size, "turn:", st.turn, "posA:", JSON.stringify(st.posA), "posB:", JSON.stringify(st.posB));

// 2. 合法走子
const legal = C.legalPawnMoves(st, "A");
console.log("legal pawn moves for A:", legal.length, JSON.stringify(legal.slice(0, 3)));
const from = C.pawnOf(st, "A");
const r1 = C.applyPayload(st, "A", { type: "pawn", from: from, to: legal[0] });
console.log("apply pawn:", r1.ok, "turn ->", r1.state && r1.state.turn);

// 3. 放板合法性
const wc = C.checkWall(r1.state, 3, 3, "h", "B");
console.log("checkWall(3,3,h,B):", wc.ok, wc.reason || "");

// 4. AI 走子（四档各一手，限制预算）
for (let lv = 1; lv <= 4; lv++) {
  const t0 = Date.now();
  const d = AI.computeAiMove(r1.state, lv, { budgetMs: 800 });
  console.log(`AI L${lv}:`, JSON.stringify(d && d.payload), "score:", d && d.score, `${Date.now() - t0}ms`);
}

// 5. 四人局 + 四人 AI
let st4 = C.initialGame({ size: 9, wallsPerPlayer: 5, playerCount: 4 });
console.log("4P initial turn:", st4.turn, "order:", JSON.stringify(C.playersOf(st4)));
const d4 = AI.computeAiMove(st4, 3, { budgetMs: 800 });
console.log("AI(4P) L3:", JSON.stringify(d4 && d4.payload), "score:", d4 && d4.score);

// 6. 跳子与终局快测：学徒 60 手内应能终局或接近
let s = C.initialGame({ size: 5, wallsPerPlayer: 3 });
let moves = 0;
while (!s.winner && moves < 80) {
  const d = AI.computeAiMove(s, 1, { budgetMs: 300 });
  if (!d) break;
  const r = C.applyPayload(s, s.turn, d.payload);
  if (!r.ok) { console.log("AI 非法着法!", JSON.stringify(d.payload), r.reason); break; }
  s = r.state; moves++;
}
console.log("5x5 学徒自对弈", moves, "手, winner:", s.winner || "未分");
console.log("SMOKE OK");
