import { io } from "socket.io-client";
const url = process.argv[2] ?? "http://localhost:3004";
const socket = io(url, { timeout: 4000, reconnection: false });
const t = setTimeout(() => { console.log("PROBE_TIMEOUT"); process.exit(1); }, 6000);
socket.on("connect", () => {
  socket.emit("create-room", { settings: { size: 7, wallsPerPlayer: 8 } }, (res: object) => {
    clearTimeout(t);
    console.log("RESPONSE:", JSON.stringify(res));
    console.log("settings" in (res ?? {}) ? "NEW_PROTOCOL" : "OLD_PROTOCOL");
    socket.disconnect();
    process.exit(0);
  });
});
socket.on("connect_error", (e: Error) => { clearTimeout(t); console.log("CONNECT_ERROR:", e.message); process.exit(1); });
