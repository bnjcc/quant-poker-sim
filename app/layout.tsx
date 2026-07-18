import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { AppEffects } from "@/components/reactbits/AppEffects";

export const metadata: Metadata = {
  title: "QuantPoker — Poker Strategy Simulation",
  description:
    "Play a calibration sample, learn your strategy profile, and backtest it against configurable player pools.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="red" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("quantpoker-ui-theme-v2");document.documentElement.dataset.theme=["purple","cyan","green","red","gold","blue","orange","pink"].includes(t)?t:"red"}catch(e){document.documentElement.dataset.theme="red"}})()`,
          }}
        />
      </head>
      <body className="min-h-screen">
        <AppEffects>
          <div className="app-shell flex min-h-screen flex-col md:flex-row">
            <div className="ambient-orb ambient-orb-one" aria-hidden="true" />
            <div className="ambient-orb ambient-orb-two" aria-hidden="true" />
            <Nav />
            <main className="app-main flex-1 min-w-0 px-5 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-[1440px]">{children}</main>
          </div>
        </AppEffects>
      </body>
    </html>
  );
}
