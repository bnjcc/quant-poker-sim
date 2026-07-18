"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const FaultyTerminal = dynamic(() => import("./FaultyTerminal"), { ssr: false });
const GRID: [number, number] = [2, 1];
const THEME_TINTS = {
  red: "#ff3347",
  purple: "#a970ff",
  cyan: "#27d7e8",
  green: "#4ade80",
  gold: "#e2b34c",
  blue: "#60a5fa",
  orange: "#fb923c",
  pink: "#f472b6",
} as const;

type ThemeId = keyof typeof THEME_TINTS;

export function AppEffects({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname === "/login" || pathname.startsWith("/auth/");
  const [theme, setTheme] = useState<ThemeId>("red");

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      const selected = root.dataset.theme;
      setTheme(selected && selected in THEME_TINTS ? (selected as ThemeId) : "red");
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className={`reactbits-terminal-layer ${isAuth ? "reactbits-terminal-layer-auth" : ""}`} aria-hidden="true">
        <FaultyTerminal
          scale={1.5}
          gridMul={GRID}
          digitSize={1.2}
          timeScale={0.5}
          pause={false}
          scanlineIntensity={0.5}
          glitchAmount={1}
          flickerAmount={1}
          noiseAmp={1}
          chromaticAberration={0}
          dither={0}
          curvature={0.1}
          tint={THEME_TINTS[theme]}
          mouseReact
          mouseStrength={0.5}
          pageLoadAnimation
          brightness={0.6}
          dpr={1}
        />
      </div>
      {children}
    </>
  );
}
