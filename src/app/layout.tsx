import type { Metadata, Viewport } from "next";
import { Noto_Serif_SC, IBM_Plex_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const notoSerifSC = Noto_Serif_SC({
  weight: ["400", "700", "900"],
  variable: "--font-noto-serif-sc",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

const playfair = Playfair_Display({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "步步为营 · QUORIDOR — 一册会下棋的棋谱专著",
  description:
    "基于经典桌游 Quoridor 的策略对弈网页游戏。以限量印刷棋谱专著的形式呈现：单人对弈、双人同屏、在线对战、编者按规则与棋谱档案馆。双色 Risograph 套印质感。",
  keywords: ["Quoridor", "步步为营", "棋盘游戏", "策略对弈", "Risograph", "棋谱"],
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#F5F2EA",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${notoSerifSC.variable} ${plexMono.variable} ${playfair.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
