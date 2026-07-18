import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "QuantPoker — Poker Strategy Simulation",
  description:
    "Play a calibration sample, learn your strategy profile, and backtest it against configurable player pools.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="purple" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("rangebench-ui-theme");if(["purple","cyan","green","red","gold","blue","orange","pink"].includes(t)){document.documentElement.dataset.theme=t}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen">
        <div className="app-shell flex min-h-screen flex-col md:flex-row">
          <div className="ambient-orb ambient-orb-one" aria-hidden="true" />
          <div className="ambient-orb ambient-orb-two" aria-hidden="true" />
          <Nav />
          <main className="app-main flex-1 min-w-0 px-5 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-[1440px]">{children}</main>
        </div>
      </body>
    </html>
  );
}
