import "./globals.css";
export const metadata = {
  title: "QuantPoker — Poker Strategy Simulation",
  description:
    "Play a calibration sample, learn your strategy profile, and backtest it against configurable player pools.",
};
export default function RootLayout({ children }) {
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
        <div className="app-atmosphere" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
