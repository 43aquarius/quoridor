/* 实例狩猎可行性实测:建房后用全新连接反复尝试入房,统计命中所需次数 */
import { io } from "socket.io-client";
const RELAY = "https://d1n1c9rzwhe0-d.space.zhipuaidemo.cn/?XTransformPort=3004";
const conn = () => io(RELAY, { transports: ["websocket"], reconnection: false, timeout: 12000 });

async function trial(n) {
  // 1. 建房(保持连接)
  const A = conn();
  const created = await new Promise((resolve) => {
    A.on("connect", () => A.emit("create-room", { settings: { size: 9, wallsPerPlayer: 10, playerCount: 2, timeControl: { totalSec: 600, perMoveSec: 30 } }, isPublic: false }, resolve));
    setTimeout(() => resolve(null), 12000);
  });
  if (!created?.ok) { console.log(`trial${n}: 建房失败`); return null; }

  // 2. 狩猎:全新连接逐个试入房
  let tries = 0;
  while (tries < 20) {
    tries++;
    const hit = await new Promise((resolve) => {
      const s = conn();
      const done = (v) => { s.disconnect(); resolve(v); };
      s.on("connect", () => s.emit("join-room", { roomCode: created.roomCode }, (res) => done(res.ok)));
      s.on("connect_error", () => done(false));
      setTimeout(() => { s.disconnect(); resolve(false); }, 6000);
    });
    if (hit) {
      console.log(`trial${n}: 房${created.roomCode} 第 ${tries} 次命中`);
      A.disconnect();
      return tries;
    }
  }
  console.log(`trial${n}: 房${created.roomCode} 20次未命中(实例池过大)`);
  A.disconnect();
  return null;
}

const results = [];
for (let i = 1; i <= 4; i++) results.push(await trial(i));
const hits = results.filter((r) => r !== null);
console.log(`\n命中 ${hits.length}/4,平均尝试次数: ${hits.length ? (hits.reduce((a, b) => a + b, 0) / hits.length).toFixed(1) : "-"}`);
process.exit(0);
