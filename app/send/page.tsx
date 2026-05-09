"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { PeerSession, defaultDeviceName, formatBytes, newSessionId } from "@/lib/peer";

export default function SendPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState("idle");
  const [statusInfo, setStatusInfo] = useState("");
  const [peerName, setPeerName] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [sessionId] = useState(() => newSessionId());
  const [progress, setProgress] = useState<Record<string, { sent: number; total: number }>>({});
  const [deviceName] = useState(() => defaultDeviceName());
  const sessionRef = useRef<PeerSession | null>(null);
  const sentRef = useRef(false);

  const totalSize = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  useEffect(() => {
    QRCode.toDataURL(sessionId, { width: 280, margin: 1 }).then(setQrUrl);
  }, [sessionId]);

  useEffect(() => {
    const session = new PeerSession(
      sessionId,
      "sender",
      {
        onStatus: (s, info) => {
          setStatus(s);
          setStatusInfo(info ?? "");
        },
        onPeerName: setPeerName,
        onProgress: (id, sent, total) => setProgress((prev) => ({ ...prev, [id]: { sent, total } })),
      },
      deviceName,
    );
    sessionRef.current = session;
    session.start().catch((e) => {
      setStatus("error");
      setStatusInfo(e instanceof Error ? e.message : "Failed to start session");
    });
    return () => session.close();
  }, [sessionId, deviceName]);

  useEffect(() => {
    if (status !== "connected" || files.length === 0 || !sessionRef.current || sentRef.current) return;
    sentRef.current = true;
    sessionRef.current.sendFiles(files).catch((e) => {
      sentRef.current = false;
      setStatus("error");
      setStatusInfo(e instanceof Error ? e.message : "Send failed");
    });
  }, [status, files]);

  useEffect(() => {
    if (status === "idle" || status === "waiting" || status === "connecting") {
      sentRef.current = false;
    }
  }, [status]);

  return (
    <main className="container" style={{ padding: "28px 0 40px" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/">← Back</Link>
      </div>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1.2fr 1fr" }}>
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Add files</h2>
          <input
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="input"
          />
          <p style={{ color: "#aab2d6" }}>{files.length} file(s) · {formatBytes(totalSize)}</p>
        </section>
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Pair receiver</h2>
          {qrUrl ? <img src={qrUrl} alt="pair qr" style={{ width: 220, height: 220, borderRadius: 12 }} /> : <p>Loading QR…</p>}
          <p style={{ fontFamily: "monospace", color: "#9aa3c8" }}>{sessionId}</p>
          <p>Status: {status}{peerName ? ` (${peerName})` : ""}</p>
          {statusInfo ? <p style={{ color: "#ff8b8b" }}>{statusInfo}</p> : null}
          <ProgressSummary progress={progress} />
        </section>
      </div>
    </main>
  );
}

function ProgressSummary({ progress }: { progress: Record<string, { sent: number; total: number }> }) {
  const values = Object.values(progress);
  const sent = values.reduce((a, b) => a + b.sent, 0);
  const total = values.reduce((a, b) => a + b.total, 0);
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  return <p style={{ color: "#aab2d6" }}>Progress: {pct}%</p>;
}
