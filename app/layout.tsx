import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeerDrop",
  description: "Peer-to-peer file transfer over WebRTC",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
