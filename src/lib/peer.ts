import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type FileMeta = { id: string; name: string; size: number; type: string };

export type IncomingFile = {
  meta: FileMeta;
  received: number;
  chunks: ArrayBuffer[];
  blobUrl?: string;
  done: boolean;
};

type Status = "idle" | "waiting" | "connecting" | "connected" | "transferring" | "complete" | "error";

export type PeerEvents = {
  onStatus?: (s: Status, info?: string) => void;
  onIncoming?: (files: IncomingFile[]) => void;
  onProgress?: (fileId: string, sent: number, total: number) => void;
  onPeerName?: (name: string) => void;
};

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const CHUNK_SIZE = 16 * 1024; // 16KB
const BUFFER_HIGH = 1 * 1024 * 1024;
const BUFFER_LOW = 256 * 1024;

export class PeerSession {
  pc: RTCPeerConnection;
  channel: RealtimeChannel | null = null;
  dc: RTCDataChannel | null = null;
  sessionId: string;
  role: "sender" | "receiver";
  events: PeerEvents;
  myName: string;
  peerName = "";
  incoming: Map<string, IncomingFile> = new Map();
  private currentReceiving: string | null = null;

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
      const s = this.pc.connectionState;
      if (s === "connected") this.events.onStatus?.("connected");
      else if (s === "failed" || s === "disconnected") this.events.onStatus?.("error", s);
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
    const ch = supabase.channel(`peerdrop:${this.sessionId}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    this.channel = ch;
    ch.on("broadcast", { event: "sig" }, ({ payload }) => this.onSignal(payload));
    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });

    // hello exchange
    this.send({ type: "hello", role: this.role, name: this.myName });

    if (this.role === "sender") {
      this.events.onStatus?.("waiting");
    } else {
      this.events.onStatus?.("connecting");
      // ask sender to (re)offer
      this.send({ type: "request-offer" });
    }
  }

  private send(payload: unknown) {
    this.channel?.send({ type: "broadcast", event: "sig", payload });
  }

  private async onSignal(msg: any) {
    if (!msg) return;
    switch (msg.type) {
      case "hello":
        if (msg.role !== this.role) {
          this.peerName = msg.name || "Peer";
          this.events.onPeerName?.(this.peerName);
          if (this.role === "sender") {
            this.events.onStatus?.("connecting");
            await this.makeOffer();
          }
        }
        break;
      case "request-offer":
        if (this.role === "sender") await this.makeOffer();
        break;
      case "offer":
        if (this.role === "receiver") {
          await this.pc.setRemoteDescription(msg.sdp);
          const ans = await this.pc.createAnswer();
          await this.pc.setLocalDescription(ans);
          this.send({ type: "answer", sdp: ans });
        }
        break;
      case "answer":
        if (this.role === "sender") {
          await this.pc.setRemoteDescription(msg.sdp);
        }
        break;
      case "ice":
        try { await this.pc.addIceCandidate(msg.candidate); } catch { /* ignore */ }
        break;
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
    dc.onclose = () => this.events.onStatus?.("complete");
    dc.onmessage = (e) => this.handleMessage(e.data);
  }

  private handleMessage(data: string | ArrayBuffer) {
    if (typeof data === "string") {
      const msg = JSON.parse(data);
      if (msg.type === "file-start") {
        const meta: FileMeta = msg.meta;
        this.incoming.set(meta.id, { meta, received: 0, chunks: [], done: false });
        this.currentReceiving = meta.id;
        this.events.onIncoming?.(Array.from(this.incoming.values()));
      } else if (msg.type === "file-end") {
        const f = this.incoming.get(msg.id);
        if (f) {
          const blob = new Blob(f.chunks, { type: f.meta.type || "application/octet-stream" });
          f.blobUrl = URL.createObjectURL(blob);
          f.chunks = [];
          f.done = true;
          this.events.onIncoming?.(Array.from(this.incoming.values()));
        }
        this.currentReceiving = null;
      }
    } else {
      if (!this.currentReceiving) return;
      const f = this.incoming.get(this.currentReceiving);
      if (!f) return;
      f.chunks.push(data);
      f.received += data.byteLength;
      this.events.onProgress?.(f.meta.id, f.received, f.meta.size);
    }
  }

  async sendFiles(files: File[]) {
    if (!this.dc || this.dc.readyState !== "open") throw new Error("Channel not open");
    this.events.onStatus?.("transferring");
    for (const file of files) {
      const meta: FileMeta = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
      };
      this.dc.send(JSON.stringify({ type: "file-start", meta }));
      let offset = 0;
      while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buf = await slice.arrayBuffer();
        if (this.dc.bufferedAmount > BUFFER_HIGH) {
          await new Promise<void>((res) => {
            const onLow = () => { this.dc?.removeEventListener("bufferedamountlow", onLow); res(); };
            this.dc!.addEventListener("bufferedamountlow", onLow);
          });
        }
        this.dc.send(buf);
        offset += buf.byteLength;
        this.events.onProgress?.(meta.id, offset, file.size);
      }
      this.dc.send(JSON.stringify({ type: "file-end", id: meta.id }));
    }
    this.events.onStatus?.("complete");
  }

  close() {
    try { this.dc?.close(); } catch { /* */ }
    try { this.pc.close(); } catch { /* */ }
    if (this.channel) supabase.removeChannel(this.channel);
  }
}

export function newSessionId() {
  // 12-char id suitable for QR
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