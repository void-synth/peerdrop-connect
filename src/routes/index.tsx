import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, QrCode, Send, Shield, Wifi } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-hero opacity-10 blur-3xl" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-hero shadow-glow">
            <BrandMark className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">PeerDrop</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-4 w-4" /> Encrypted P2P · No server storage
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 pb-20 pt-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs text-muted-foreground"
        >
          <Wifi className="h-3.5 w-3.5 text-primary" /> Direct device-to-device · WebRTC
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl"
        >
          Transfer files between devices.
          <span className="text-gradient"> Fast, direct, private.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 max-w-xl text-balance text-base text-muted-foreground md:text-lg"
        >
          Select files on one device, scan the code on another, and send over encrypted peer-to-peer transfer with no permanent server storage.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Link
            to="/send"
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-hero px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.02]"
          >
            <Send className="h-4 w-4" /> Send files
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/receive"
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-card/40 px-7 py-3.5 text-sm font-semibold text-foreground backdrop-blur transition-colors hover:bg-card/70"
          >
            <QrCode className="h-4 w-4" /> Receive files
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-20 grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-3"
        >
          {[
            { icon: BrandMark, title: "Instant", desc: "WebRTC data channels stream chunks at LAN speed." },
            { icon: Shield, title: "Private", desc: "Encrypted DTLS connection. Nothing stored on a server." },
            { icon: QrCode, title: "Effortless", desc: "Scan a QR. The session code pairs both devices automatically." },
          ].map((f, i) => (
            <div key={i} className="glass rounded-2xl p-6 text-left">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
