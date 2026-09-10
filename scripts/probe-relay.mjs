import { io } from "socket.io-client";
const socket = io("http://localhost:81/?XTransformPort=3004", {
  transports: ["polling"], timeout: 5000, reconnection: false, upgrade: false,
});
const t = setTimeout(() => { console.log("PROBE_TIMEOUT"); process.exit(1); }, 6000);
socket.on("connect", () => {
  socket.emit("create-room", { settings: { size: 7, wallsPerPlayer: 8 } }, (res) => {
    clearTimeout(t);
    console.log("RESPONSE:", JSON.stringify(res));
    console.log(res && "settings" in res ? "NEW_PROTOCOL" : "OLD_PROTOCOL");
    socket.disconnect(); process.exit(0);
  });
});
socket.on("connect_error", (e) => { clearTimeout(t); console.log("CONNECT_ERROR:", e.message); process.exit(1); });
