import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "RangeBench — Poker Strategy Simulation",
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
        <div className="flex min-h-screen flex-col md:flex-row">
          <Nav />
          <main className="flex-1 min-w-0 px-6 py-6 lg:px-10 max-w-[1400px]">{children}</main>
        </div>
      </body>
    </html>
  );
}
