import { io } from "socket.io-client";
const URL = "http://localhost:3004";
const a = io(URL, { transports: ["websocket"] });
a.on("connect", () => {
  a.emit("create-room", { settings: { size: 9, wallsPerPlayer: 10 }, isPublic: false }, (res) => {
    const b = io(URL, { transports: ["websocket"] });
    b.on("connect", () => {
      b.emit("join-room", { roomCode: res.roomCode }, (r2) => {
        a.emit("resume", { roomCode: res.roomCode, token: res.token }, (rr) => {
          console.log("resume keys:", Object.keys(rr).join(","));
          console.log("peer:", JSON.stringify(rr.peer));
          process.exit(0);
        });
      });
    });
  });
});
setTimeout(() => process.exit(1), 8000);
