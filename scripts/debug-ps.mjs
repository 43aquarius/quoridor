import { io } from "socket.io-client";
const URL = "http://localhost:81/?XTransformPort=3004";
const OPTS = { transports: ["polling"], timeout: 5000, reconnection: false, upgrade: false };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (sock, ev) => new Promise((r) => sock.once(ev, r));
const t0 = Date.now();
const log = (...a) => console.log(`[+${Date.now() - t0}ms]`, ...a);

const host = io(URL, OPTS);
await once(host, "connect");
log("host connected");
const created = await new Promise((r) => host.emit("create-room", { settings: { size: 7, wallsPerPlayer: 8 } }, r));
log("created room", created.roomCode);
const { roomCode, token: hostToken } = created;

const guest = io(URL, OPTS);
await once(guest, "connect");
const joined = await new Promise((r) => guest.emit("join-room", { roomCode }, r));
log("guest joined", joined.player);

host.on("peer-status", (ps) => log("HOST peer-status:", JSON.stringify(ps)));
host.on("opponent-move", (m) => log("HOST opponent-move:", JSON.stringify(m).slice(0, 80)));

host.emit("game-move", { roomCode, token: hostToken, move: { type: "pawn", from: { x: 3, y: 6 }, to: { x: 3, y: 5 } }, elapsedMs: 100 });
await wait(500);
log("--- guest disconnecting ---");
guest.disconnect();
await wait(1500);
log("--- now try resume with new socket ---");
const guest2 = io(URL, OPTS);
await once(guest2, "connect");
const resumed = await new Promise((r) => guest2.emit("resume", { roomCode, token: joined.token }, r));
log("resumed ok:", resumed.ok, "moves:", resumed.moves?.length);
await wait(1500);
host.disconnect();
guest2.disconnect();
process.exit(0);
