import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container" style={{ padding: "40px 0" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>PeerDrop</h1>
        <span style={{ color: "#aab2d6", fontSize: 14 }}>Direct WebRTC transfer</span>
      </header>

      <section className="card" style={{ marginTop: 20, padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Send files between devices</h2>
        <p style={{ color: "#b3bad8", lineHeight: 1.5 }}>
          Open Send on one device, Receive on another, then pair with QR code or session code.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <Link href="/send" className="btn btn-primary">Send files</Link>
          <Link href="/receive" className="btn btn-secondary">Receive files</Link>
        </div>
      </section>
    </main>
  );
}
