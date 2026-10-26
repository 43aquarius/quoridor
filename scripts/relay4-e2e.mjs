/* 在线四人围桌 relay e2e：
 * 建房(playerCount=4) → 席位状态 → 房主设 AI 代打 → 客人依次入座（跳过 AI 座）
 * → 开局校验（未齐备拒开）→ game-start 广播（含席位）→ 顺时针轮转
 * → AI 席位轮次派发 ai-turn 给首位在线真人 → 凭 aiToken 代上着并转发
 * → 非回合认输出局（轮次不变）→ 回合内认输出局（轮次顺延）
 * → 单步超时出局（出局而非判负终局）→ AI 座计时豁免
 */
import { io } from "socket.io-client";

const URL = "http://localhost:81/?XTransformPort=3004";
const OPTS = { transports: ["polling"], timeout: 5000, reconnection: false, upgrade: false };

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.log("  ✗ FAIL:", msg);
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (sock, ev) => new Promise((r) => sock.once(ev, r));

/* ============ A. 全流程（含 AI 代打 + 出局） ============ */
{
  const host = io(URL, OPTS);
  await once(host, "connect");

  /* 1. 建四人房 */
  const created = await new Promise((r) =>
    host.emit("create-room", { settings: { size: 9, wallsPerPlayer: 5, playerCount: 4 }, isPublic: true }, r),
  );
  ok(created.ok && created.player === "A", "create-room 四人房，房主执甲");
  ok(created.settings?.playerCount === 4 && created.settings?.wallsPerPlayer === 5, "规格回传 playerCount=4 / 每方5板");
  ok(Array.isArray(created.seats) && created.seats.length === 4, "返回 4 席位状态");
  ok(created.seats?.[0]?.player === "A" && created.seats?.[0]?.present === true, "甲座=房主在场");
  ok(created.seats?.slice(1).every((s) => !s.present && !s.isAi), "乙丙丁座空置");
  const { roomCode, token: hostToken } = created;

  /* 2. 未齐备开局 → 拒绝 */
  const early = await new Promise((r) => host.emit("start-game", { roomCode, token: hostToken }, r));
  ok(!early.ok, "空座未齐时开局被拒");

  /* 3. 房主把丙座设为 AI（学徒） */
  const seatUpdPromise = once(host, "seat-update");
  const setAi = await new Promise((r) => host.emit("set-seat-ai", { roomCode, token: hostToken, seat: "C", aiLevel: 1 }, r));
  ok(setAi.ok, "set-seat-ai 丙座设为学徒");
  const seatUpd = await seatUpdPromise;
  ok(seatUpd?.seats?.find((s) => s.player === "C")?.isAi === true, "seat-update 广播丙座 AI");

  /* 4. 非房主设座 → 拒绝 */
  const intruder = io(URL, OPTS);
  await once(intruder, "connect");
  const badSet = await new Promise((r) => intruder.emit("set-seat-ai", { roomCode, token: "fake", seat: "B", aiLevel: 2 }, r));
  ok(!badSet.ok, "非房主设置席位被拒");
  intruder.disconnect();

  /* 5. 客人1 入座 → 乙（跳过 AI 丙座的前置空位顺序 B→C→D，B 空 → 乙） */
  const guest1 = io(URL, OPTS);
  await once(guest1, "connect");
  const j1 = await new Promise((r) => guest1.emit("join-room", { roomCode }, r));
  ok(j1.ok && j1.player === "B", "客人1 入座乙");

  /* 6. 客人2 入座 → 丁（丙已留给 AI） */
  const guest2 = io(URL, OPTS);
  await once(guest2, "connect");
  const j2 = await new Promise((r) => guest2.emit("join-room", { roomCode }, r));
  ok(j2.ok && j2.player === "D", "客人2 入座丁（跳过 AI 丙座）");

  /* 7. 满员入座后再 join → 房满 */
  const guest3 = io(URL, OPTS);
  await once(guest3, "connect");
  const j3 = await new Promise((r) => guest3.emit("join-room", { roomCode }, r));
  ok(!j3.ok, "无空座时 join 被拒");
  guest3.disconnect();

  /* 8. 房主开局 → game-start 广播 + 私回（不含广播 aiTokens） */
  const gsPromise1 = once(guest1, "game-start");
  const gsPromise2 = once(guest2, "game-start");
  const started = await new Promise((r) => host.emit("start-game", { roomCode, token: hostToken }, r));
  ok(started.ok && started.aiTokens?.C, "开局成功且房主收到丙座 aiToken");
  const gs1 = await gsPromise1;
  const gs2 = await gsPromise2;
  ok(gs1?.settings?.playerCount === 4 && gs2?.settings?.playerCount === 4, "game-start 广播四人规格");
  ok(gs1?.seats?.length === 4 && gs1?.seats?.find((s) => s.player === "C")?.isAi, "game-start 席位表含丙 AI");
  ok(!gs1?.aiTokens, "game-start 广播不泄露 aiToken");

  /* 9. 顺时针轮转：甲行棋 → 轮到丙（AI）→ 派发 ai-turn 给首位在线真人（甲） */
  const aiTurnPromise = once(host, "ai-turn");
  host.emit("game-move", {
    roomCode,
    token: hostToken,
    move: { type: "pawn", from: { x: 4, y: 8 }, to: { x: 4, y: 7 } },
    elapsedMs: 500,
  });
  const aiTurn = await aiTurnPromise;
  ok(aiTurn?.player === "C" && aiTurn?.aiLevel === 1 && aiTurn?.moveCount === 1, "丙座 AI 轮次派发给房主（执行者）");
  ok(typeof aiTurn?.token === "string" && aiTurn.token.length > 8, "ai-turn 携带 AI 席位凭证");

  /* 10. 执行者（房主）凭 aiToken 代丙上着 → 转发至他端（乙收到） */
  const fwdCPromise = once(guest1, "opponent-move");
  host.emit("game-move", {
    roomCode,
    token: aiTurn.token,
    move: { type: "pawn", from: { x: 0, y: 4 }, to: { x: 1, y: 4 } },
    elapsedMs: 0,
  });
  const fwdC = await fwdCPromise;
  ok(fwdC?.player === "C" && fwdC?.move?.to?.x === 1, "AI 代上着经 opponent-move 转发（乙收到）");

  /* 11. 乙行棋 → 轮到丁（真人） */
  const fwdDPromise = once(host, "opponent-move");
  guest1.emit("game-move", {
    roomCode,
    token: j1.token,
    move: { type: "pawn", from: { x: 4, y: 0 }, to: { x: 4, y: 1 } },
    elapsedMs: 300,
  });
  const fwdD = await fwdDPromise;
  ok(fwdD?.player === "B", "乙行棋转发（甲收到，轮到丁）");

  /* 12. 非回合认输：甲行棋轮空后乙认输？——构造：轮到丁时，乙（非回合）认输 → 轮次不变仍为丁 */
  const resignPromise = once(host, "opponent-resign");
  guest1.emit("game-resign", { roomCode, token: j1.token });
  const resignEvt = await resignPromise;
  ok(resignEvt?.player === "B" && resignEvt?.ended === false, "乙非回合认输 → 出局广播（非终局）");
  /* 丁仍可行棋（轮次未被乙的认输挪走） */
  const fwdAfter = once(host, "opponent-move");
  guest2.emit("game-move", {
    roomCode,
    token: j2.token,
    move: { type: "pawn", from: { x: 8, y: 4 }, to: { x: 7, y: 4 } },
    elapsedMs: 200,
  });
  const fwdDmove = await fwdAfter;
  ok(fwdDmove?.player === "D", "非回合认输后轮次仍为丁（丁行棋被接受）");

  /* 13. 回合内认输：丁行棋后轮到甲；甲认输 → 顺位跳过甲到丙（AI）→ 派发 ai-turn
   *    手数：A(1) C(2) B(3) B认输(4) D(5) A认输(6) */
  const aiTurn2Promise = once(host, "ai-turn");
  host.emit("game-resign", { roomCode, token: hostToken });
  const aiTurn2 = await aiTurn2Promise;
  ok(aiTurn2?.player === "C" && aiTurn2?.moveCount === 6, "甲回合内认输 → 顺位跳过到丙（AI 派发，手数=6）");

  host.disconnect();
  guest1.disconnect();
  guest2.disconnect();
  await wait(300);
}

/* ============ B. 单步超时 = 出局（四人局不散桌） ============ */
{
  const host = io(URL, OPTS);
  await once(host, "connect");
  const created = await new Promise((r) =>
    host.emit("create-room", { settings: { size: 9, wallsPerPlayer: 5, playerCount: 4, timeControl: { totalSec: 0, perMoveSec: 1 } }, isPublic: false }, r),
  );
  ok(created.ok, "带单步 1 秒棋钟的四人房");
  const { roomCode, token: hostToken } = created;

  /* 甲 + 乙真人，丙丁均设 AI（社长 / 学徒） */
  await new Promise((r) => host.emit("set-seat-ai", { roomCode, token: hostToken, seat: "C", aiLevel: 4 }, r));
  await new Promise((r) => host.emit("set-seat-ai", { roomCode, token: hostToken, seat: "D", aiLevel: 1 }, r));
  const guest = io(URL, OPTS);
  await once(guest, "connect");
  const j = await new Promise((r) => guest.emit("join-room", { roomCode }, r));
  ok(j.ok && j.player === "B", "客人入座乙");

  const gsP = once(guest, "game-start");
  await new Promise((r) => host.emit("start-game", { roomCode, token: hostToken }, r));
  await gsP;

  /* 甲走一手 → 丙（AI）派发 → 执行者代上 → 轮到乙 → 乙不动 → 1 秒后超时出局 */
  host.emit("game-move", { roomCode, token: hostToken, move: { type: "pawn", from: { x: 4, y: 8 }, to: { x: 4, y: 7 } }, elapsedMs: 100 });
  const aiTurn = await once(host, "ai-turn");
  ok(aiTurn?.player === "C" && aiTurn?.aiLevel === 4, "丙（社长）AI 派发");
  /* 执行者代上（丙向右一步）*/
  host.emit("game-move", { roomCode, token: aiTurn.token, move: { type: "pawn", from: { x: 0, y: 4 }, to: { x: 1, y: 4 } }, elapsedMs: 0 });

  /* 乙超时：等 tickClocks 裁决（1 秒上限 + 1s 轮询） */
  const timeoutP = once(host, "game-timeout");
  const t = await Promise.race([timeoutP, wait(6000).then(() => null)]);
  ok(t && t.loser === "B" && t.ended === false, `乙单步超时 → 出局非终局（reason=${t?.reason}）`);

  /* 乙出局后：甲行棋（轮次已跳过乙到丁？——丙已行、乙出局、丁是 AI → 派发给甲执行） */
  const aiTurnD = await Promise.race([once(host, "ai-turn"), wait(3000).then(() => null)]);
  ok(aiTurnD && aiTurnD.player === "D", "丁（学徒）AI 接棒派发（乙出局后顺位）");

  host.disconnect();
  guest.disconnect();
  await wait(300);
}

/* ============ C. 在线对局中 join 被拒（须凭原座回局） ============ */
{
  const host = io(URL, OPTS);
  await once(host, "connect");
  const created = await new Promise((r) =>
    host.emit("create-room", { settings: { playerCount: 4, size: 5, wallsPerPlayer: 3 }, isPublic: false }, r),
  );
  const { roomCode, token: hostToken } = created;
  await new Promise((r) => host.emit("set-seat-ai", { roomCode, token: hostToken, seat: "B", aiLevel: 1 }, r));
  await new Promise((r) => host.emit("set-seat-ai", { roomCode, token: hostToken, seat: "C", aiLevel: 1 }, r));
  await new Promise((r) => host.emit("set-seat-ai", { roomCode, token: hostToken, seat: "D", aiLevel: 1 }, r));
  const started = await new Promise((r) => host.emit("start-game", { roomCode, token: hostToken }, r));
  ok(started.ok, "1 人 + 3 AI 也能开局");
  const late = io(URL, OPTS);
  await once(late, "connect");
  const j = await new Promise((r) => late.emit("join-room", { roomCode }, r));
  ok(!j.ok && /已开始/.test(j.error ?? ""), "对局已开始时 join 被拒（须凭原座回局）");
  late.disconnect();
  host.disconnect();
  await wait(200);
}

console.log(`\n四人房 relay e2e：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
