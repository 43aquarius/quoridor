/* 步步为营 —— 在线对战 relay
 * 职责极轻：房间管理（4 位房间码）+ 消息转发 + 断线 5 分钟状态保留。
 * 规则校验由双端各自完成；服务端仅做粗粒度回合校验与顺序记录。
 */

import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3004;

interface Slot {
  token: string;
  socketId: string | null;
  connected: boolean;
  since: number;
}

interface Room {
  code: string;
  players: { A?: Slot; B?: Slot };
  moves: Array<{ player: "A" | "B"; move: unknown }>;
  status: "waiting" | "playing" | "ended";
  lastActivity: number;
  disconnectGcAt: number | null; // 断线保留截止
}

const rooms = new Map<string, Room>();

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

function makeCode(): string {
  for (;;) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const existing = rooms.get(code);
    if (!existing || sweepRoom(code, existing)) return code;
  }
}

function token(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function peerStatus(r: Room) {
  return {
    roomCode: r.code,
    status: r.status,
    moveCount: r.moves.length,
    aConnected: !!r.players.A?.connected,
    bConnected: !!r.players.B?.connected,
    disconnectGcAt: r.disconnectGcAt,
  };
}

/** 房间是否应被回收（等待局闲置 10 分钟；对局中断线超过 5 分钟；终局闲置 5 分钟） */
function sweepRoom(code: string, r: Room): boolean {
  const now = Date.now();
  if (r.status === "waiting" && now - r.lastActivity > 10 * 60_000) {
    rooms.delete(code);
    return true;
  }
  if (r.disconnectGcAt && now > r.disconnectGcAt) {
    rooms.delete(code);
    return true;
  }
  if (r.status === "ended" && now - r.lastActivity > 5 * 60_000) {
    rooms.delete(code);
    return true;
  }
  if (now - r.lastActivity > 2 * 3600_000) {
    rooms.delete(code);
    return true;
  }
  return false;
}

setInterval(() => {
  for (const [code, r] of rooms) sweepRoom(code, r);
}, 30_000).unref?.();

function authPlayer(r: Room, tok: string): "A" | "B" | null {
  if (r.players.A?.token === tok) return "A";
  if (r.players.B?.token === tok) return "B";
  return null;
}

function expectedTurn(r: Room): "A" | "B" {
  return r.moves.length % 2 === 0 ? "A" : "B";
}

io.on("connection", (socket) => {
  socket.on("create-room", (cb?: (res: object) => void) => {
    const code = makeCode();
    const tok = token();
    const r: Room = {
      code,
      players: { A: { token: tok, socketId: socket.id, connected: true, since: Date.now() } },
      moves: [],
      status: "waiting",
      lastActivity: Date.now(),
      disconnectGcAt: null,
    };
    rooms.set(code, r);
    socket.join(code);
    cb?.({ ok: true, roomCode: code, player: "A", token: tok });
    socket.emit("peer-status", peerStatus(r));
  });

  socket.on("join-room", (data: { roomCode?: string }, cb?: (res: object) => void) => {
    const code = String(data?.roomCode ?? "").trim();
    const r = rooms.get(code);
    if (!r) {
      cb?.({ ok: false, error: "房间不存在或已失效" });
      return;
    }
    if (r.players.B) {
      cb?.({ ok: false, error: "房间已满" });
      return;
    }
    const tok = token();
    r.players.B = { token: tok, socketId: socket.id, connected: true, since: Date.now() };
    r.status = "playing";
    r.lastActivity = Date.now();
    r.disconnectGcAt = null;
    socket.join(code);
    cb?.({ ok: true, roomCode: code, player: "B", token: tok, moves: r.moves });
    io.to(code).emit("peer-status", peerStatus(r));
    io.to(code).emit("game-start", { moves: r.moves });
  });

  socket.on("resume", (data: { roomCode?: string; token?: string }, cb?: (res: object) => void) => {
    const code = String(data?.roomCode ?? "").trim();
    const r = rooms.get(code);
    if (!r) {
      cb?.({ ok: false, error: "房间已失效（断线超过 5 分钟或对局已结束）" });
      return;
    }
    const role = data?.token ? authPlayer(r, String(data.token)) : null;
    if (!role) {
      cb?.({ ok: false, error: "会话凭证不匹配" });
      return;
    }
    const slot = r.players[role]!;
    slot.socketId = socket.id;
    slot.connected = true;
    r.lastActivity = Date.now();
    // 双方都回来了才解除断线倒计时
    if (r.players.A?.connected && r.players.B?.connected) r.disconnectGcAt = null;
    socket.join(code);
    cb?.({ ok: true, roomCode: code, player: role, moves: r.moves, status: r.status });
    io.to(code).emit("peer-status", peerStatus(r));
  });

  socket.on("game-move", (data: { roomCode?: string; token?: string; move?: unknown; elapsedMs?: number }) => {
    const r = rooms.get(String(data?.roomCode ?? ""));
    if (!r || r.status !== "playing") return;
    const role = data?.token ? authPlayer(r, String(data.token)) : null;
    if (!role) return;
    if (expectedTurn(r) !== role) return; // 粗粒度回合校验
    r.moves.push({ player: role, move: data.move });
    r.lastActivity = Date.now();
    socket.to(r.code).emit("opponent-move", {
      player: role,
      move: data.move,
      elapsedMs: data.elapsedMs ?? 0,
    });
  });

  socket.on("game-resign", (data: { roomCode?: string; token?: string }) => {
    const r = rooms.get(String(data?.roomCode ?? ""));
    if (!r) return;
    const role = data?.token ? authPlayer(r, String(data.token)) : null;
    if (!role) return;
    r.status = "ended";
    r.lastActivity = Date.now();
    r.moves.push({ player: role, move: { type: "resign" } });
    socket.to(r.code).emit("opponent-resign", { player: role });
  });

  socket.on("leave-room", (data: { roomCode?: string; token?: string }) => {
    const r = rooms.get(String(data?.roomCode ?? ""));
    if (!r) return;
    const role = data?.token ? authPlayer(r, String(data.token)) : null;
    if (role) {
      const slot = r.players[role]!;
      slot.connected = false;
      slot.socketId = null;
      socket.leave(r.code);
      io.to(r.code).emit("peer-status", peerStatus(r));
    }
  });

  socket.on("disconnect", () => {
    for (const [code, r] of rooms) {
      let touched = false;
      for (const role of ["A", "B"] as const) {
        const slot = r.players[role];
        if (slot?.socketId === socket.id && slot.connected) {
          slot.connected = false;
          slot.socketId = null;
          touched = true;
        }
      }
      if (touched) {
        // 对局进行中且有人掉线：状态保留 5 分钟
        if (r.status === "playing") {
          r.disconnectGcAt = Date.now() + 5 * 60_000;
        }
        io.to(code).emit("peer-status", peerStatus(r));
      }
      sweepRoom(code, r);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[quoridor-relay] listening on :${PORT}`);
});
