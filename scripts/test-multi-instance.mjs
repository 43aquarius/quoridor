/* 多实例联调:验证跨实例大厅广告 + 狩猎入房
 * 拓扑:3 个独立 relay 实例(3104/3105/3106)模拟网关随机分流
 */
import { io } from "socket.io-client";

const PORTS = [3104, 3105, 3106];
const conn = (port) =>
  io(`http://127.0.0.1:${port}/`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    timeout: 8000,
  });

const waitConnect = (s, label) =>
  new Promise((resolve) => {
    const t = setTimeout(() => { console.log(`⚠️ ${label} 连接超时`); resolve(false); }, 8000);
    s.on("connect", () => { clearTimeout(t); console.log(`🔗 ${label} 已连`); resolve(true); });
    s.on("connect_error", (e) => { clearTimeout(t); console.log(`⚠️ ${label} 连接失败: ${e.message}`); resolve(false); });
  });

const emitAck = (s, event, payload) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: "timeout" }), 5000);
    s.emit(event, payload, (res) => {
      clearTimeout(t);
      resolve(res ?? { ok: false });
    });
  });

/* lobby-watch 的 ack 回调就是第一个参数(无 payload) */
const lobbyWatch = (s) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve({ rooms: [] }), 5000);
    s.emit("lobby-watch", (res) => {
      clearTimeout(t);
      resolve(res ?? { rooms: [] });
    });
  });

let pass = 0, fail = 0;
const check = (name, cond) => {
  console.log(`${cond ? "✅" : "❌"} ${name}`);
  cond ? pass++ : fail++;
};

async function main() {
  // 1. 玩家 A 在实例 3104 建公开房
  const A = conn(3104);
  if (!(await waitConnect(A, "A@3104"))) process.exit(1);
  const created = await emitAck(A, "create-room", {
    settings: { size: 9, wallsPerPlayer: 10, playerCount: 2, timeControl: { totalSec: 600, perMoveSec: 30 } },
    isPublic: true,
  });
  check("A 在实例1 建房", created.ok && /^\d{4}$/.test(created.roomCode));

  // 2. 实例2/3 的原始大厅(无广告):应看不到该房
  const peek2 = conn(3105);
  if (!(await waitConnect(peek2, "peek2@3105"))) process.exit(1);
  const before = await lobbyWatch(peek2);
  check("广告前实例2大厅看不到房", !(before.rooms || []).some((r) => r.code === created.roomCode));

  // 3. 广告广播:向实例2/3 发 lobby-advertise(模拟房主客户端 adBurst)
  const adEntry = {
    code: created.roomCode, size: 9, wallsPerPlayer: 10, playerCount: 2,
    seatsTotal: 2, seatsTaken: 1, timeControl: { totalSec: 600, perMoveSec: 30 },
    createdAt: Date.now(), hostConnected: true,
  };
  for (const p of [3105, 3106]) {
    const ad = conn(p);
    if (!(await waitConnect(ad, `ad@${p}`))) continue;
    ad.emit("lobby-advertise", { entry: adEntry });
    await new Promise((r) => setTimeout(r, 300));
    ad.disconnect();
  }

  // 4. 实例2/3 的大厅现在应列出该房
  const after2 = await lobbyWatch(peek2);
  check("广告后实例2大厅可见该房", (after2.rooms || []).some((r) => r.code === created.roomCode));
  const peek3 = conn(3106);
  if (!(await waitConnect(peek3, "peek3@3106"))) process.exit(1);
  const after3 = await lobbyWatch(peek3);
  check("广告后实例3大厅可见该房", (after3.rooms || []).some((r) => r.code === created.roomCode));
  const shown = (after3.rooms || []).find((r) => r.code === created.roomCode);
  check("广告条目字段正确", shown && shown.size === 9 && shown.seatsTaken === 1 && shown.hostConnected === true);

  // 5. 狩猎入房:B 从实例 3105(无房)出发,狩猎到 3104 入座
  const B = conn(3105);
  if (!(await waitConnect(B, "B@3105"))) process.exit(1);
  let joined = await emitAck(B, "join-room", { roomCode: created.roomCode });
  if (!joined.ok) {
    B.disconnect();
    const B2 = conn(3104);
    if (!(await waitConnect(B2, "B2@3104"))) process.exit(1);
    joined = await emitAck(B2, "join-room", { roomCode: created.roomCode });
    check("B 狩猎到实例1 入座成功", joined.ok && joined.player === "B");
  } else {
    check("B 直连实例(同实例)入座成功", joined.ok && joined.player === "B");
  }

  // 6. 广告撤下:unadvertise 后实例2大厅不再列出
  const un = conn(3105);
  if (!(await waitConnect(un, "un@3105"))) process.exit(1);
  un.emit("lobby-unadvertise", { code: created.roomCode });
  await new Promise((r) => setTimeout(r, 300));
  const cleaned = await lobbyWatch(peek2);
  check("撤广告后实例2大厅不再列出", !(cleaned.rooms || []).some((r) => r.code === created.roomCode));

  // 7. A 走子,B 收到 game-start / 对局事件通路
  A.emit("game-move", { roomCode: created.roomCode, token: created.token, move: { type: "step", r: 8, c: 4 }, elapsedMs: 800, totalMs: 599200 });
  const gotStart = await new Promise((resolve) => {
    B.on?.("game-start", () => resolve(true));
    setTimeout(() => resolve(false), 3000);
  });
  console.log(`ℹ️  双方同实例事件通路(game-start): ${gotStart}`);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("测试崩溃:", e);
  process.exit(1);
});
