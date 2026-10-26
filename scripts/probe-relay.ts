/* 探测 relay 是否为新协议（create-room 响应含 settings 字段） */
import { io } from "socket.io-client";

const socket = io("http://localhost:3004", { path: "/", transports: ["polling"], timeout: 4000 });

const t = setTimeout(() => {
  console.log("PROBE_TIMEOUT");
  process.exit(1);
}, 5000);

socket.on("connect", () => {
  socket.emit("create-room", { settings: { size: 7, wallsPerPlayer: 8 } }, (res: object) => {
    clearTimeout(t);
    const hasSettings = "settings" in (res ?? {});
    console.log("RESPONSE:", JSON.stringify(res));
    console.log(hasSettings ? "NEW_PROTOCOL" : "OLD_PROTOCOL");
    socket.disconnect();
    process.exit(0);
  });
});

socket.on("connect_error", (e: Error) => {
  clearTimeout(t);
  console.log("CONNECT_ERROR:", e.message);
  process.exit(1);
});
