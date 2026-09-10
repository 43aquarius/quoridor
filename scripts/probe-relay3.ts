import { io } from "socket.io-client";
const socket = io("http://localhost:3004", { timeout: 4000, reconnection: false, transports: ["polling"] });
const t = setTimeout(() => { console.log("PROBE_TIMEOUT", "connected:", socket.connected); process.exit(1); }, 6000);
socket.on("connect", () => {
  clearTimeout(t);
  console.log("CONNECTED via polling, id:", socket.id);
  socket.emit("create-room", { settings: { size: 7, wallsPerPlayer: 8 } }, (res: object) => {
    console.log("RESPONSE:", JSON.stringify(res));
    console.log("settings" in (res ?? {}) ? "NEW_PROTOCOL" : "OLD_PROTOCOL");
    socket.disconnect();
    process.exit(0);
  });
});
socket.on("connect_error", (e: Error) => { clearTimeout(t); console.log("CONNECT_ERROR:", e.message); process.exit(1); });
socket.on("disconnect", (r: string) => console.log("DISCONNECT:", r));
socket.io.on("open", () => console.log("ENGINE OPEN"));
socket.io.on("error", (e: unknown) => console.log("ENGINE ERROR:", String(e)));
socket.io.on("packet", (p: unknown) => console.log("ENGINE PACKET:", JSON.stringify(p).slice(0, 200)));
