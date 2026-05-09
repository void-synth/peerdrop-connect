import { io, Socket } from "socket.io-client";

export type FileMeta = { id: string; name: string; size: number; type: string };

export type IncomingFile = {
  meta: FileMeta;
  received: number;
  chunks: ArrayBuffer[];
  blobUrl?: string;
  done: boolean;
};

export type TransferOffer = {
  files: FileMeta[];
  totalSize: number;
  count: number;
};

type Status =
  | "idle"
  | "waiting"
  | "connecting"
  | "connected"
  | "awaiting-accept"
  | "transferring"
  | "complete"
  | "error"
  | "expired";

export type PeerEvents = {
  onStatus?: (s: Status, info?: string) => void;
  onIncoming?: (files: IncomingFile[]) => void;
  onProgress?: (fileId: string, sent: number, total: number) => void;
  onPeerName?: (name: string) => void;
  onOffer?: (offer: TransferOffer) => void;
  onSpeed?: (bytesPerSec: number) => void;
  onSessionMeta?: (expiresAt: number) => void;
};

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const CHUNK_SIZE = 16 * 1024;
const BUFFER_HIGH = 1 * 1024 * 1024;
const BUFFER_LOW = 256 * 1024;
const CONNECT_TIMEOUT_MS = 10000;
const ACK_TIMEOUT_MS = 10000;

export class PeerSession {
  pc: RTCPeerConnection;
  socket: Socket | null = null;
  dc: RTCDataChannel | null = null;
  sessionId: string;
  role: "sender" | "receiver";
  events: PeerEvents;
  myName: string;
  peerName = "";
  incoming: Map<string, IncomingFile> = new Map();
  private currentReceiving: string | null = null;
  private offeredFiles: File[] = [];
  private waitingForAccept = false;
  private transferAccepted = false;
  private transferStarted = false;
  private pendingIce: RTCIceCandidateInit[] = [];
  private speedWindowStart = 0;
  private speedBytes = 0;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionId: string, role: "sender" | "receiver", events: PeerEvents, myName: string) {
    this.sessionId = sessionId;
    this.role = role;
    this.events = events;
    this.myName = myName;
    this.pc = new RTCPeerConnection(ICE);

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ type: "ice", candidate: e.candidate.toJSON() });
    };
    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === "connected") {
        this.clearDisconnectTimer();
        this.events.onStatus?.("connected");
      } else if (state === "disconnected") {
        this.clearDisconnectTimer();
        this.disconnectTimer = setTimeout(() => {
          this.events.onStatus?.("error", "Peer disconnected");
        }, 5000);
      } else if (state === "failed") {
        this.events.onStatus?.("error", "Peer connection failed");
      }
    };

    if (role === "sender") {
      this.dc = this.pc.createDataChannel("files", { ordered: true });
      this.setupDC(this.dc);
    } else {
      this.pc.ondatachannel = (e) => {
        this.dc = e.channel;
        this.setupDC(this.dc);
      };
    }
  }

  async start() {
    const signalingUrl = getSignalingUrl();
    const socket = io(signalingUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    this.socket = socket;

    socket.on("connect_error", (err) => {
      this.events.onStatus?.("error", err.message || "Signaling connection error");
    });

    socket.on("signal", (payload: SignalMessage) => {
      this.onSignal(payload).catch(() => this.events.onStatus?.("error", "Signaling error"));
    });

    socket.on("session:expired", () => this.events.onStatus?.("expired", "Session expired"));
    socket.on("session:closed", () => this.events.onStatus?.("error", "Sender left session"));
    socket.on("peer:left", () => this.events.onStatus?.("waiting", "Receiver disconnected"));
    socket.on("peer:joined", ({ name }: { name: string }) => {
      this.peerName = name || "Peer";
      this.events.onPeerName?.(this.peerName);
      this.events.onStatus?.("connecting");
      this.makeOffer().catch(() => this.events.onStatus?.("error", "Offer failed"));
    });

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("connect_error", (e) => reject(e));
      }),
      CONNECT_TIMEOUT_MS,
      "Signaling connection timeout",
    );

    if (this.role === "sender") {
      const res = await emitAck<CreateSessionResponse>(
        socket,
        "session:create",
        { sessionId: this.sessionId, name: this.myName },
        ACK_TIMEOUT_MS,
      );
      if (!res.ok) throw new Error(res.message ?? "Failed to create session");
      if (res.expiresAt) this.events.onSessionMeta?.(res.expiresAt);
      this.events.onStatus?.("waiting");
      return;
    }

    const res = await emitAck<JoinSessionResponse>(
      socket,
      "session:join",
      { sessionId: this.sessionId, name: this.myName },
      ACK_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(res.message ?? "Could not join session");
    this.peerName = res.senderName || "Sender";
    this.events.onPeerName?.(this.peerName);
    if (res.expiresAt) this.events.onSessionMeta?.(res.expiresAt);
    this.events.onStatus?.("connecting");
  }

  private send(payload: SignalMessage) {
    this.socket?.emit("signal", { sessionId: this.sessionId, payload });
  }

  private async onSignal(msg: SignalMessage) {
    if (!msg) return;
    switch (msg.type) {
      case "offer":
        if (this.role === "receiver") {
          await this.pc.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
          await this.flushPendingIce();
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.send({ type: "answer", sdp: answer });
        }
        break;
      case "answer":
        if (this.role === "sender") {
          await this.pc.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
          await this.flushPendingIce();
        }
        break;
      case "ice":
        if (!this.pc.remoteDescription) {
          this.pendingIce.push(msg.candidate as RTCIceCandidateInit);
          return;
        }
        await this.addIceCandidate(msg.candidate as RTCIceCandidateInit);
        break;
    }
  }

  private async flushPendingIce() {
    if (!this.pendingIce.length) return;
    const queue = [...this.pendingIce];
    this.pendingIce = [];
    for (const candidate of queue) {
      await this.addIceCandidate(candidate);
    }
  }

  private async addIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      // Ignore stale candidates from prior negotiation.
    }
  }

  private async makeOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.send({ type: "offer", sdp: offer });
  }

  private setupDC(dc: RTCDataChannel) {
    dc.binaryType = "arraybuffer";
    dc.bufferedAmountLowThreshold = BUFFER_LOW;
    dc.onopen = () => this.events.onStatus?.("connected");
    dc.onclose = () => this.events.onStatus?.(this.transferStarted ? "complete" : "error", "Data channel closed");
    dc.onmessage = (e) => this.handleMessage(e.data);
  }

  private handleTextMessage(raw: string) {
    const msg = this.parseDataMessage(raw);
    if (!msg) return;
    if (msg.type === "transfer-offer") {
      if (this.role === "receiver") {
        this.events.onOffer?.(msg.offer);
        this.events.onStatus?.("awaiting-accept");
      }
      return;
    }
    if (msg.type === "transfer-accept") {
      this.transferAccepted = true;
      this.events.onStatus?.("transferring");
      this.sendOfferedFiles().catch((e) => this.events.onStatus?.("error", String(e)));
      return;
    }
    if (msg.type === "file-start") {
      const meta = msg.meta;
      this.incoming.set(meta.id, { meta, received: 0, chunks: [], done: false });
      this.currentReceiving = meta.id;
      this.events.onIncoming?.(Array.from(this.incoming.values()));
      return;
    }
    if (msg.type === "file-end") {
      const incoming = this.incoming.get(msg.id);
      if (incoming) {
        const blob = new Blob(incoming.chunks, { type: incoming.meta.type || "application/octet-stream" });
        incoming.blobUrl = URL.createObjectURL(blob);
        incoming.chunks = [];
        incoming.done = true;
        this.events.onIncoming?.(Array.from(this.incoming.values()));
      }
      this.currentReceiving = null;
      if (this.role === "receiver") this.events.onStatus?.("complete");
    }
  }

  private handleBinaryMessage(data: ArrayBuffer) {
    if (!this.currentReceiving) return;
    const incoming = this.incoming.get(this.currentReceiving);
    if (!incoming) return;
    incoming.chunks.push(data);
    incoming.received += data.byteLength;
    this.trackSpeed(data.byteLength);
    this.events.onProgress?.(incoming.meta.id, incoming.received, incoming.meta.size);
  }

  private handleMessage(data: string | ArrayBuffer) {
    if (typeof data === "string") {
      this.handleTextMessage(data);
      return;
    }
    this.handleBinaryMessage(data);
  }

  async sendFiles(files: File[]) {
    this.ensureChannelOpen();
    this.offeredFiles = files;
    this.waitingForAccept = true;
    this.transferAccepted = false;
    const offer: TransferOffer = {
      files: files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
      })),
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      count: files.length,
    };
    this.sendDataMessage({ type: "transfer-offer", offer });
    this.events.onStatus?.("awaiting-accept");
  }

  acceptTransfer() {
    if (!this.dc || this.dc.readyState !== "open") {
      this.events.onStatus?.("error", "Channel not ready");
      return;
    }
    this.sendDataMessage({ type: "transfer-accept" });
    this.events.onStatus?.("transferring");
  }

  private async sendOfferedFiles() {
    this.ensureChannelOpen();
    if (!this.waitingForAccept || !this.transferAccepted) return;
    this.transferStarted = true;
    this.waitingForAccept = false;
    this.resetSpeedState();
    for (const file of this.offeredFiles) {
      const meta: FileMeta = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
      };
      this.sendDataMessage({ type: "file-start", meta });
      let offset = 0;
      while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        if (this.dc!.bufferedAmount > BUFFER_HIGH) {
          await new Promise<void>((resolve) => {
            const onLow = () => {
              this.dc?.removeEventListener("bufferedamountlow", onLow);
              resolve();
            };
            this.dc!.addEventListener("bufferedamountlow", onLow);
          });
        }
        this.dc!.send(buffer);
        offset += buffer.byteLength;
        this.events.onProgress?.(meta.id, offset, file.size);
      }
      this.sendDataMessage({ type: "file-end", id: meta.id });
    }
    this.resetTransferState();
    this.events.onStatus?.("complete");
  }

  private ensureChannelOpen() {
    if (!this.dc || this.dc.readyState !== "open") {
      throw new Error("Data channel not open yet");
    }
  }

  private parseDataMessage(raw: string): DataMessage | null {
    try {
      return JSON.parse(raw) as DataMessage;
    } catch {
      this.events.onStatus?.("error", "Invalid data message received");
      return null;
    }
  }

  private sendDataMessage(message: DataMessage) {
    this.ensureChannelOpen();
    this.dc!.send(JSON.stringify(message));
  }

  private trackSpeed(bytes: number) {
    const now = performance.now();
    if (!this.speedWindowStart) this.speedWindowStart = now;
    this.speedBytes += bytes;
    const elapsed = now - this.speedWindowStart;
    if (elapsed >= 1000) {
      this.events.onSpeed?.((this.speedBytes / elapsed) * 1000);
      this.speedBytes = 0;
      this.speedWindowStart = now;
    }
  }

  private clearDisconnectTimer() {
    if (!this.disconnectTimer) return;
    clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }

  private resetTransferState() {
    this.offeredFiles = [];
    this.waitingForAccept = false;
    this.transferAccepted = false;
    this.transferStarted = false;
  }

  private resetSpeedState() {
    this.speedWindowStart = 0;
    this.speedBytes = 0;
  }

  close() {
    this.clearDisconnectTimer();
    this.resetTransferState();
    this.resetSpeedState();
    this.pendingIce = [];
    for (const incoming of this.incoming.values()) {
      if (incoming.blobUrl) URL.revokeObjectURL(incoming.blobUrl);
    }
    this.incoming.clear();
    this.currentReceiving = null;
    try {
      this.dc?.close();
    } catch {
      // no-op
    }
    try {
      this.pc.close();
    } catch {
      // no-op
    }
    try {
      this.socket?.disconnect();
    } catch {
      // no-op
    }
  }
}

type SignalMessage =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit };

type DataMessage =
  | { type: "transfer-offer"; offer: TransferOffer }
  | { type: "transfer-accept" }
  | { type: "file-start"; meta: FileMeta }
  | { type: "file-end"; id: string };

type CreateSessionResponse = { ok: boolean; message?: string; expiresAt?: number };
type JoinSessionResponse = { ok: boolean; message?: string; expiresAt?: number; senderName?: string };

function emitAck<T>(socket: Socket, event: string, payload: unknown, timeoutMs = ACK_TIMEOUT_MS): Promise<T> {
  return withTimeout(
    new Promise<T>((resolve) => {
      socket.emit(event, payload, (response: T) => resolve(response));
    }),
    timeoutMs,
    `Timed out waiting for ${event}`,
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function getSignalingUrl() {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_SIGNALING_URL || process.env.VITE_SIGNALING_URL || process.env.SIGNALING_URL || "http://localhost:4001";
  }
  if (process.env.NEXT_PUBLIC_SIGNALING_URL) return process.env.NEXT_PUBLIC_SIGNALING_URL;
  const host = window.location.hostname || "localhost";
  return `${window.location.protocol}//${host}:4001`;
}

export function newSessionId() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a).map((n) => n.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function defaultDeviceName() {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent;
  const animals = ["Falcon", "Otter", "Lynx", "Comet", "Nova", "Echo", "Pulse", "Quartz", "Atlas", "Orbit"];
  const pick = animals[Math.floor(Math.random() * animals.length)];
  let prefix = "Device";
  if (/iPhone|iPad/.test(ua)) prefix = "iOS";
  else if (/Android/.test(ua)) prefix = "Android";
  else if (/Mac/.test(ua)) prefix = "Mac";
  else if (/Windows/.test(ua)) prefix = "Win";
  else if (/Linux/.test(ua)) prefix = "Linux";
  return `${prefix}-${pick}`;
}