/* 在线 relay 双会话端到端验证：
 * 建房(带规格) → 入座(收规格) → 双向行棋 → 客端断线 → 主端收到离线状态(带判负钟)
 * → 客端换新 socket 凭 token 回座 → 收回全部着法 → 主端见其复联
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

const host = io(URL, OPTS);
await once(host, "connect");
console.log("[1] host connected");

/* 建房带规格 7×7×8 */
const created = await new Promise((r) => host.emit("create-room", { settings: { size: 7, wallsPerPlayer: 8 } }, r));
ok(created.ok && created.settings?.size === 7 && created.settings?.wallsPerPlayer === 8, "create-room 返回规格 7×7×8");
const { roomCode, token: hostToken } = created;

/* 非法规格清洗：size=8 → 奇数化为 9 */
const host2 = io(URL, OPTS);
await once(host2, "connect");
const created2 = await new Promise((r) => host2.emit("create-room", { settings: { size: 8, wallsPerPlayer: 99 } }, r));
ok(created2.ok && created2.settings?.size === 9 && created2.settings?.wallsPerPlayer === 20, "非法规格清洗 8→9 / 99→20");
host2.disconnect();

/* 客人入座 */
const guest = io(URL, OPTS);
await once(guest, "connect");
const joined = await new Promise((r) => guest.emit("join-room", { roomCode }, r));
ok(joined.ok && joined.player === "B", "guest 入座为 B");
ok(joined.settings?.size === 7 && joined.settings?.wallsPerPlayer === 8, "guest 收到房规格 7×7×8");

/* 主端收到开局（含规格） */
const gameStart = await once(host, "game-start");
ok(gameStart?.settings?.size === 7, "host 收到 game-start 含规格");

/* 双向行棋 */
const moveAPromise = once(guest, "opponent-move");
host.emit("game-move", { roomCode, token: hostToken, move: { type: "pawn", from: { x: 3, y: 6 }, to: { x: 3, y: 5 } }, elapsedMs: 1200 });
const moveA = await moveAPromise;
ok(moveA?.player === "A" && moveA?.move?.to?.y === 5 && moveA?.elapsedMs === 1200, "A 行棋转发至 B（含用时）");

const moveBPromise = once(host, "opponent-move");
guest.emit("game-move", { roomCode, token: joined.token, move: { type: "pawn", from: { x: 3, y: 0 }, to: { x: 3, y: 1 } }, elapsedMs: 800 });
const moveB = await moveBPromise;
ok(moveB?.player === "B" && moveB?.move?.to?.y === 1, "B 行棋转发至 A");

/* 乱序行棋被拒（轮到 A） */
const bogus = { type: "pawn", from: { x: 3, y: 1 }, to: { x: 3, y: 2 } };
guest.emit("game-move", { roomCode, token: joined.token, move: bogus, elapsedMs: 0 });
await wait(400);
const resumeAfterBogus = await new Promise((r) => guest.emit("resume", { roomCode, token: joined.token }, r));
ok(resumeAfterBogus.moves?.length === 2, "乱序着法未入账（仍 2 手）");
await wait(700); // 等 resume 广播的 peer-status 先送达并丢弃，避免误捕

/* 断线：客端掉线 → 主端见离线 + 判负钟（先注册监听再断线） */
const ps1Promise = once(host, "peer-status");
guest.disconnect();
const ps1 = await ps1Promise;
ok(ps1.bConnected === false && ps1.aConnected === true, "host 见 guest 离线");
ok(typeof ps1.disconnectGcAt === "number" && ps1.disconnectGcAt > Date.now() - 1000, "判负保留窗已开启");

/* 凭新 socket 回座（模拟刷新 / 换网） */
const guest2 = io(URL, OPTS);
await once(guest2, "connect");
const ps2Promise = once(host, "peer-status");
const resumed = await new Promise((r) => guest2.emit("resume", { roomCode, token: joined.token }, r));
ok(resumed.ok && resumed.player === "B", "新 socket 凭 token 回座成功");
ok(resumed.moves?.length === 2, "回座收回 2 手局面");
ok(resumed.settings?.size === 7, "回座返回规格");

/* 主端见其复联（判负钟清零） */
const ps2 = await ps2Promise;
ok(ps2.bConnected === true && ps2.disconnectGcAt === null, "host 见 guest 复联且保留窗清零");

/* 心跳 */
guest2.emit("heartbeat", { roomCode, token: joined.token });
await wait(250);

/* 认输收束 */
const resignPromise = once(host, "opponent-resign");
guest2.emit("game-resign", { roomCode, token: joined.token });
const resign = await resignPromise;
ok(resign?.player === "B", "认输广播至主端");

host.disconnect();
guest2.disconnect();

console.log(`\nrelay e2e：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
