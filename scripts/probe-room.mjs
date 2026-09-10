/* 快速探测 relay：建房→查大厅→入座→开局信号 */
import { io } from "socket.io-client";
const URL = "http://localhost:3004";
const a = io(URL, { transports: ["websocket"] });
let step = 0;
a.on("connect", () => {
  a.emit("create-room", { settings: { size: 9, wallsPerPlayer: 10 }, isPublic: true }, (res) => {
    console.log("create:", JSON.stringify(res).slice(0, 200));
    if (!res.ok) { process.exit(1); }
    const b = io(URL, { transports: ["websocket"] });
    b.on("connect", () => {
      b.emit("join-room", { roomCode: res.roomCode }, (r2) => {
        console.log("join:", JSON.stringify(r2).slice(0, 200));
        setTimeout(() => { a.close(); b.close(); process.exit(0); }, 500);
      });
    });
    a.on("game-start", (p) => console.log("A got game-start:", JSON.stringify(p).slice(0, 200)));
    a.on("peer-status", (p) => console.log("A peer-status:", JSON.stringify(p).slice(0, 160)));
  });
});
setTimeout(() => { console.log("timeout"); process.exit(1); }, 8000);
