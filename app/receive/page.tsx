"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { PeerSession, defaultDeviceName, formatBytes, type IncomingFile, type TransferOffer } from "@/lib/peer";

export default function ReceivePage() {
  const [code, setCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("idle");
  const [statusInfo, setStatusInfo] = useState("");
  const [offer, setOffer] = useState<TransferOffer | null>(null);
  const [files, setFiles] = useState<IncomingFile[]>([]);
  const [peerName, setPeerName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [deviceName] = useState(() => defaultDeviceName());
  const sessionRef = useRef<PeerSession | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("s");
    if (preset) {
      setCode(preset);
      void connect(preset);
    }
    return () => {
      void stopScanner();
      sessionRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(raw: string) {
    const sessionCode = raw.trim();
    if (!sessionCode) return;
    setCode(sessionCode);
    sessionRef.current?.close();
    const session = new PeerSession(
      sessionCode,
      "receiver",
      {
        onStatus: (s, info) => {
          setStatus(s);
          setStatusInfo(info ?? "");
        },
        onPeerName: setPeerName,
        onOffer: setOffer,
        onIncoming: (f) => setFiles([...f]),
      },
      deviceName,
    );
    sessionRef.current = session;
    try {
      await session.start();
      setConnected(true);
    } catch (e) {
      setConnected(false);
      setStatus("error");
      setStatusInfo(e instanceof Error ? e.message : "Join failed");
    }
  }

  async function startScanner() {
    setScanning(true);
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decoded) => {
          void stopScanner();
          void connect(decoded);
        },
        () => {},
      );
    } catch (e) {
      setStatus("error");
      setStatusInfo(e instanceof Error ? e.message : "Camera start failed");
      setScanning(false);
    }
  }

  async function stopScanner() {
    try {
      await scannerRef.current?.stop();
      await scannerRef.current?.clear();
    } catch {
      // ignore
    } finally {
      scannerRef.current = null;
      setScanning(false);
    }
  }

  return (
    <main className="container" style={{ padding: "28px 0 40px" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/">← Back</Link>
      </div>
      <section className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Receive files</h2>
        {!connected ? (
          <>
            {!scanning ? (
              <button className="btn btn-primary" onClick={startScanner}>Scan QR</button>
            ) : (
              <button className="btn btn-secondary" onClick={stopScanner}>Stop scanner</button>
            )}
            <div id="qr-reader" style={{ marginTop: 12, borderRadius: 12, overflow: "hidden" }} />
            <form
              style={{ marginTop: 12, display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                void connect(code);
              }}
            >
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="session code" />
              <button className="btn btn-primary" type="submit">Connect</button>
            </form>
          </>
        ) : (
          <>
            <p>Status: {status}{peerName ? ` (${peerName})` : ""}</p>
            {offer && status === "awaiting-accept" ? (
              <div className="card" style={{ padding: 12 }}>
                <p>Incoming {offer.count} file(s) · {formatBytes(offer.totalSize)}</p>
                <button className="btn btn-primary" onClick={() => sessionRef.current?.acceptTransfer()}>Accept transfer</button>
              </div>
            ) : null}
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {files.map((f) => (
                <div className="card" style={{ padding: 10 }} key={f.meta.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <strong>{f.meta.name}</strong>
                      <div style={{ color: "#aab2d6" }}>{formatBytes(f.meta.size)}</div>
                    </div>
                    {f.done && f.blobUrl ? <a className="btn btn-secondary" href={f.blobUrl} download={f.meta.name}>Save</a> : <span>Receiving…</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {statusInfo ? <p style={{ color: "#ff8b8b" }}>{statusInfo}</p> : null}
      </section>
    </main>
  );
}
