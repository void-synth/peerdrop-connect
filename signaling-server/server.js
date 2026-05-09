import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
app.use(cors());
app.get("/health", (_, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const SESSION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map();
const SIGNAL_MAX_SESSIONS = Number(process.env.SIGNAL_MAX_SESSIONS || 1000);
const ALLOWED_ORIGIN = process.env.SIGNAL_ALLOWED_ORIGIN || "";

function isExpired(session) {
  return Date.now() >= session.expiresAt;
}

function isValidSessionId(sessionId) {
  return typeof sessionId === "string" && /^[a-z0-9]{6,20}$/i.test(sessionId);
}

function isValidName(name) {
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= 60;
}

function isSocketInSession(socket, sessionId) {
  return socket.data?.sessionId === sessionId;
}

setInterval(() => {
  for (const [sessionId, session] of sessions.entries()) {
    if (isExpired(session)) {
      io.to(sessionId).emit("session:expired");
      sessions.delete(sessionId);
    }
  }
}, 30_000);

io.on("connection", (socket) => {
  socket.on("session:create", ({ sessionId, name }, ack) => {
    if (!isValidSessionId(sessionId)) {
      ack?.({ ok: false, message: "Invalid session ID" });
      return;
    }
    if (sessions.size >= SIGNAL_MAX_SESSIONS) {
      ack?.({ ok: false, message: "Server busy, try again in a minute" });
      return;
    }
    if (ALLOWED_ORIGIN && socket.handshake.headers.origin !== ALLOWED_ORIGIN) {
      ack?.({ ok: false, message: "Origin not allowed" });
      return;
    }
    const expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(sessionId, {
      senderId: socket.id,
      senderName: isValidName(name) ? name.trim() : "Sender",
      receiverId: null,
      receiverName: "",
      expiresAt,
    });
    socket.join(sessionId);
    socket.data.sessionId = sessionId;
    socket.data.role = "sender";
    ack?.({ ok: true, expiresAt });
  });

  socket.on("session:join", ({ sessionId, name }, ack) => {
    if (!isValidSessionId(sessionId)) {
      ack?.({ ok: false, message: "Invalid session code" });
      return;
    }
    if (ALLOWED_ORIGIN && socket.handshake.headers.origin !== ALLOWED_ORIGIN) {
      ack?.({ ok: false, message: "Origin not allowed" });
      return;
    }
    const session = sessions.get(sessionId);
    if (!session || isExpired(session)) {
      sessions.delete(sessionId);
      ack?.({ ok: false, message: "Session expired or unavailable" });
      return;
    }
    if (session.receiverId && session.receiverId !== socket.id) {
      ack?.({ ok: false, message: "Session already has a receiver" });
      return;
    }
    session.receiverId = socket.id;
    session.receiverName = isValidName(name) ? name.trim() : "Receiver";
    socket.join(sessionId);
    socket.data.sessionId = sessionId;
    socket.data.role = "receiver";
    ack?.({ ok: true, expiresAt: session.expiresAt, senderName: session.senderName });
    io.to(session.senderId).emit("peer:joined", { name: session.receiverName });
  });

  socket.on("signal", ({ sessionId, payload }) => {
    if (!sessionId || !payload) return;
    const session = sessions.get(sessionId);
    if (!session || isExpired(session)) return;
    if (!isSocketInSession(socket, sessionId)) return;
    socket.to(sessionId).emit("signal", payload);
  });

  socket.on("disconnect", () => {
    const sessionId = socket.data.sessionId;
    const role = socket.data.role;
    if (!sessionId || !role) return;
    const session = sessions.get(sessionId);
    if (!session) return;

    if (role === "sender") {
      io.to(sessionId).emit("session:closed");
      sessions.delete(sessionId);
      return;
    }

    if (role === "receiver") {
      session.receiverId = null;
      session.receiverName = "";
      io.to(session.senderId).emit("peer:left");
    }
  });
});

const port = Number(process.env.SIGNALING_PORT || 4001);
httpServer.listen(port, () => {
  console.log(`PeerDrop signaling server listening on ${port}`);
});
