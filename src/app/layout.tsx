import type { Metadata, Viewport } from "next";
import { Chivo_Mono, Host_Grotesk } from "next/font/google";
import "./globals.css";

const hostGrotesk = Host_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-host-grotesk",
  display: "swap",
});

const chivoMono = Chivo_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chivo-mono",
  display: "swap",
});

function resolveSiteUrl(): URL {
  const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const customProdHost =
    prodHost && !prodHost.endsWith(".vercel.app") ? prodHost : undefined;

  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    customProdHost ||
    (process.env.VERCEL_ENV === "production"
      ? "https://trading.iqbalfa.my.id"
      : process.env.VERCEL_URL) ||
    "http://localhost:3000";
  const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    return new URL(normalized);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveSiteUrl(),
  title: {
    default: "AETHER — Live Paper Trading & Prop Firm Terminal",
    template: "%s | AETHER Terminal",
  },
  description:
    "Institutional obsidian dark-mode crypto & gold paper trading terminal with $100,000 Prop Firm evaluation tracking, quantitative journal, and mobile thumb-zone execution.",
  applicationName: "AETHER Terminal",
  keywords: [
    "paper trading",
    "prop firm simulator",
    "crypto trading terminal",
    "BTCUSDT",
    "XAUUSD",
    "Next.js",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "AETHER Terminal",
    title: "AETHER — Live Paper Trading & Prop Firm Terminal",
    description:
      "Trade live BTC/USDT & XAU/USD markets in a $100,000 Prop Firm evaluation terminal with isolated leverage, quantitative trade journal, and shareable Supabase reports.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AETHER — Live Paper Trading & Prop Firm Terminal",
    description:
      "Institutional obsidian paper trading terminal with live market feed, $100,000 Prop Firm drawdown rules, and shareable evaluation reports.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07080A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hostGrotesk.variable} ${chivoMono.variable} dark`}
    >
      <body className="min-h-[100dvh] bg-[var(--bg-ground)] text-[var(--text-primary)] antialiased selection:bg-[#10B981]/25 selection:text-[var(--text-primary)]">
        {children}
      </body>
    </html>
  );
}
