import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle2, Download, File as FileIcon, Loader2, ScanLine } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { PeerSession, defaultDeviceName, formatBytes, type IncomingFile, type TransferOffer } from "@/lib/peer";
import { addTransferHistory, readTransferHistory, type TransferHistoryEntry } from "@/lib/transfer-history";
import { BrandMark } from "@/components/brand-mark";

type Search = { s?: string };

export const Route = createFileRoute("/receive")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    s: typeof s.s === "string" ? s.s : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Receive files — PeerDrop" },
      { name: "description", content: "Scan a QR or paste a code to receive files from another device." },
      { property: "og:title", content: "Receive files — PeerDrop" },
      { property: "og:description", content: "Scan a QR or paste a code to receive files from another device." },
    ],
  }),
  component: ReceivePage,
});

function ReceivePage() {
  const search = useSearch({ from: "/receive" }) as Search;
  const [code, setCode] = useState(search.s ?? "");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("idle");
  const [statusInfo, setStatusInfo] = useState("");
  const [files, setFiles] = useState<IncomingFile[]>([]);
  const [progress, setProgress] = useState<Record<string, { sent: number; total: number }>>({});
  const [peerName, setPeerName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [offer, setOffer] = useState<TransferOffer | null>(null);
  const [speed, setSpeed] = useState(0);
  const [history, setHistory] = useState<TransferHistoryEntry[]>([]);
  const [deviceName] = useState(() => defaultDeviceName());
  const sessionRef = useRef<PeerSession | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Auto-connect if ?s= present
  useEffect(() => {
    if (search.s && !connected) void connect(search.s);
    setHistory(readTransferHistory());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    setCode(trimmed);
    sessionRef.current?.close();
    const s = new PeerSession(trimmed, "receiver", {
      onStatus: (st, info) => {
        setStatus(st);
        setStatusInfo(info ?? "");
      },
      onPeerName: setPeerName,
      onIncoming: (f) => setFiles([...f]),
      onProgress: (id, sent, total) => setProgress((p) => ({ ...p, [id]: { sent, total } })),
      onOffer: setOffer,
      onSpeed: setSpeed,
    }, deviceName);
    sessionRef.current = s;
    try {
      await s.start();
      setConnected(true);
    } catch (e) {
      console.error(e);
      setConnected(false);
      setStatus("error");
      setStatusInfo(e instanceof Error ? e.message : "Could not join session");
    }
  };

  useEffect(() => () => sessionRef.current?.close(), []);

  useEffect(() => {
    if (status !== "complete" || files.length === 0) return;
    const entry: TransferHistoryEntry = {
      id: crypto.randomUUID(),
      mode: "received",
      peerName: peerName || "Sender",
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.meta.size, 0),
      completedAt: Date.now(),
    };
    addTransferHistory(entry);
    setHistory(readTransferHistory());
  }, [files, peerName, status]);

  const startScan = async () => {
    setScanning(true);
    setTimeout(async () => {
      try {
        const el = document.getElementById("qr-reader");
        if (!el) return;
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          (decoded) => {
            try {
              const url = new URL(decoded);
              const s = url.searchParams.get("s");
              if (s) {
                stopScan();
                connect(s);
              }
            } catch {
              // Treat as raw code
              stopScan();
              connect(decoded);
            }
          },
          () => {},
        );
      } catch (e) {
        console.error(e);
        setScanning(false);
      }
    }, 50);
  };

  const stopScan = async () => {
    try { await scannerRef.current?.stop(); } catch { /* */ }
    try { await scannerRef.current?.clear(); } catch { /* */ }
    scannerRef.current = null;
    setScanning(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-30" />
      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-hero shadow-glow">
            <BrandMark className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">PeerDrop</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-20">
        {!connected ? (
          <section className="glass rounded-3xl p-6">
            <h1 className="text-2xl font-semibold tracking-tight">Receive files</h1>
            <p className="mt-1 text-sm text-muted-foreground">Scan the QR shown on the sender, or enter the code below.</p>

            <div className="mt-6">
              {!scanning ? (
                <button
                  onClick={startScan}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-hero px-6 py-4 text-sm font-semibold text-primary-foreground shadow-glow"
                >
                  <ScanLine className="h-5 w-5" /> Open camera to scan
                </button>
              ) : (
                <div className="space-y-3">
                  <div id="qr-reader" className="overflow-hidden rounded-2xl border border-border" />
                  <button
                    onClick={stopScan}
                    className="w-full rounded-xl border border-border bg-card/40 px-4 py-2 text-sm hover:bg-card/70"
                  >
                    Stop scanner
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Or enter session code</p>
              <form
                onSubmit={(e) => { e.preventDefault(); void connect(code); }}
                className="flex gap-2"
              >
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="abcd1234efgh"
                  className="flex-1 rounded-xl border border-border bg-input px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-hero px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow"
                >
                  Connect
                </button>
              </form>
              {statusInfo && <p className="mt-2 text-xs text-destructive/90">{statusInfo}</p>}
            </div>
          </section>
        ) : (
          <section className="glass rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {peerName ? `Connecting to ${peerName}` : "Pairing…"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">Code: <span className="font-mono">{code}</span></p>
                {statusInfo && <p className="mt-1 text-xs text-destructive/90">{statusInfo}</p>}
              </div>
              <ConnectionDot status={status} />
            </div>

            <div className="mt-6 space-y-3">
              {offer && status === "awaiting-accept" && (
                <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
                  <p className="text-sm font-medium">Incoming transfer request</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {offer.count} file(s) · {formatBytes(offer.totalSize)}
                  </p>
                  <button
                    onClick={() => {
                      sessionRef.current?.acceptTransfer();
                      setOffer(null);
                      setStatus("transferring");
                    }}
                    className="mt-3 rounded-xl bg-gradient-hero px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow"
                  >
                    Accept transfer
                  </button>
                </div>
              )}

              <AnimatePresence>
                {files.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/30 py-14 text-center"
                  >
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">Waiting for files…</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {files.map((f) => {
                const p = progress[f.meta.id];
                const pct = p ? Math.round((p.sent / p.total) * 100) : (f.done ? 100 : 0);
                return (
                  <div key={f.meta.id} className="rounded-2xl border border-border bg-card/40 p-4">
                    <div className="flex items-center gap-3">
                      <FileIcon className="h-5 w-5 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.meta.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(f.meta.size)} · {pct}%
                        </p>
                      </div>
                      {f.done && f.blobUrl ? (
                        <a
                          href={f.blobUrl}
                          download={f.meta.name}
                          className="inline-flex items-center gap-1 rounded-full bg-gradient-hero px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                        >
                          <Download className="h-3.5 w-3.5" /> Save
                        </a>
                      ) : (
                        <CheckCircle2 className={`h-5 w-5 ${f.done ? "text-primary" : "opacity-20"}`} />
                      )}
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-gradient-hero transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}

              {speed > 0 && (
                <div className="rounded-xl border border-border bg-card/30 px-3 py-2 text-xs text-muted-foreground">
                  Current receive speed: {formatBytes(speed)}/s
                </div>
              )}

              {history.length > 0 && (
                <div className="rounded-xl border border-border bg-card/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent transfers</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {history.slice(0, 4).map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between">
                        <span>{entry.mode === "sent" ? "Sent" : "Received"} {entry.fileCount} file(s)</span>
                        <span className="text-muted-foreground">{formatBytes(entry.totalBytes)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ConnectionDot({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    idle: { c: "bg-muted-foreground", t: "Idle" },
    waiting: { c: "bg-primary animate-pd-pulse", t: "Waiting" },
    connecting: { c: "bg-accent animate-pd-pulse", t: "Connecting" },
    connected: { c: "bg-primary", t: "Connected" },
    "awaiting-accept": { c: "bg-accent animate-pd-pulse", t: "Awaiting acceptance" },
    transferring: { c: "bg-primary animate-pd-pulse", t: "Receiving" },
    complete: { c: "bg-primary", t: "Done" },
    expired: { c: "bg-destructive", t: "Expired" },
    error: { c: "bg-destructive", t: "Error" },
  };
  const s = map[status] ?? map.idle;
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${s.c}`} /> {s.t}
    </div>
  );
}