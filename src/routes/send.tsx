import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { ArrowLeft, CheckCircle2, File as FileIcon, Loader2, Trash2, Upload, Zap } from "lucide-react";
import { PeerSession, defaultDeviceName, formatBytes, newSessionId } from "@/lib/peer";

export const Route = createFileRoute("/send")({
  head: () => ({
    meta: [
      { title: "Send files — PeerDrop" },
      { name: "description", content: "Pick files, share the QR, and beam them peer-to-peer." },
      { property: "og:title", content: "Send files — PeerDrop" },
      { property: "og:description", content: "Pick files, share the QR, and beam them peer-to-peer." },
    ],
  }),
  component: SendPage,
});

function SendPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [sessionId] = useState(() => newSessionId());
  const [qrUrl, setQrUrl] = useState<string>("");
  const [status, setStatus] = useState<string>("idle");
  const [peerName, setPeerName] = useState<string>("");
  const [progress, setProgress] = useState<Record<string, { sent: number; total: number }>>({});
  const [deviceName] = useState(() => defaultDeviceName());
  const sessionRef = useRef<PeerSession | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const url = `${window.location.origin}/receive?s=${sessionId}`;
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: "#0b1220", light: "#bdf6ff" } }).then(setQrUrl);
  }, [sessionId]);

  // Start session as soon as we have files
  useEffect(() => {
    if (files.length === 0 || sessionRef.current) return;
    const s = new PeerSession(sessionId, "sender", {
      onStatus: (st) => setStatus(st),
      onPeerName: (n) => setPeerName(n),
      onProgress: (id, sent, total) =>
        setProgress((p) => ({ ...p, [id]: { sent, total } })),
    }, deviceName);
    sessionRef.current = s;
    s.start();
    return () => {
      s.close();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length > 0]);

  // Auto-send when receiver connects
  useEffect(() => {
    if (status === "connected" && sessionRef.current && files.length > 0) {
      sessionRef.current.sendFiles(files).catch((e) => {
        console.error(e);
        setStatus("error");
      });
    }
  }, [status, files]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const fl = Array.from(e.dataTransfer.files);
    if (fl.length) setFiles((prev) => [...prev, ...fl]);
  }, []);

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-30" />
      <Header />

      <main className="relative z-10 mx-auto grid w-full max-w-5xl gap-6 px-6 pb-20 pt-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Left — files */}
        <section className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold">1. Add files</h2>
          <p className="text-sm text-muted-foreground">Up to 2GB each. Anything goes.</p>

          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`mt-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              drag ? "border-primary bg-primary/10" : "border-border bg-card/30"
            }`}
          >
            <Upload className="h-8 w-8 text-primary" />
            <p className="mt-3 text-sm">Drag & drop files here</p>
            <p className="text-xs text-muted-foreground">or</p>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-gradient-hero px-5 py-2 text-sm font-semibold text-primary-foreground shadow-glow">
              Browse files
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fl = Array.from(e.target.files ?? []);
                  if (fl.length) setFiles((prev) => [...prev, ...fl]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {files.length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{files.length} file{files.length > 1 ? "s" : ""} · {formatBytes(totalSize)}</span>
                <button
                  className="hover:text-destructive"
                  onClick={() => setFiles([])}
                  disabled={status === "transferring"}
                >
                  Clear all
                </button>
              </div>
              <ul className="max-h-72 space-y-2 overflow-auto pr-1">
                {files.map((f, i) => {
                  const id = `${f.name}-${i}`;
                  // map by index — progress comes by random id, so we show overall pulse instead
                  return (
                    <li key={id} className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3">
                      <FileIcon className="h-4 w-4 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{f.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                      </div>
                      <button
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        disabled={status === "transferring"}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* Right — QR + status */}
        <section className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold">2. Scan to receive</h2>
          <p className="text-sm text-muted-foreground">Open PeerDrop on the other device and scan.</p>

          <div className="mt-5 flex flex-col items-center">
            <div className="relative">
              <div className="absolute -inset-3 rounded-3xl bg-gradient-hero opacity-40 blur-2xl animate-pd-pulse" />
              <div className="relative rounded-2xl bg-[oklch(0.92_0.06_195)] p-3 shadow-elegant">
                {qrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrUrl} alt="QR code to pair receiver" className="h-64 w-64" />
                ) : (
                  <div className="flex h-64 w-64 items-center justify-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>
            </div>

            <p className="mt-4 font-mono text-xs text-muted-foreground">code: {sessionId}</p>

            <StatusPill status={status} peerName={peerName} files={files.length} progress={progress} />
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusPill({
  status, peerName, files, progress,
}: { status: string; peerName: string; files: number; progress: Record<string, { sent: number; total: number }> }) {
  const totals = Object.values(progress).reduce(
    (a, p) => ({ sent: a.sent + p.sent, total: a.total + p.total }),
    { sent: 0, total: 0 },
  );
  const pct = totals.total ? Math.round((totals.sent / totals.total) * 100) : 0;

  let label = "Add files to begin";
  let dot = "bg-muted-foreground";
  if (files === 0) label = "Add files to begin";
  else if (status === "waiting") { label = "Waiting for receiver…"; dot = "bg-primary animate-pd-pulse"; }
  else if (status === "connecting") { label = `Connecting${peerName ? ` to ${peerName}` : ""}…`; dot = "bg-accent animate-pd-pulse"; }
  else if (status === "connected") { label = `Connected${peerName ? ` · ${peerName}` : ""}`; dot = "bg-primary"; }
  else if (status === "transferring") { label = `Sending… ${pct}%`; dot = "bg-primary animate-pd-pulse"; }
  else if (status === "complete") { label = "Transfer complete ✓"; dot = "bg-primary"; }
  else if (status === "error") { label = "Connection error"; dot = "bg-destructive"; }

  return (
    <div className="mt-6 w-full">
      <div className="flex items-center justify-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
        {status === "complete" && <CheckCircle2 className="h-4 w-4 text-primary" />}
      </div>
      <AnimatePresence>
        {(status === "transferring" || status === "complete") && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-gradient-hero transition-all" style={{ width: `${pct}%` }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Header() {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-hero shadow-glow">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold tracking-tight">PeerDrop</span>
      </div>
    </header>
  );
}