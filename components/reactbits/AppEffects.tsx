"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const FaultyTerminal = dynamic(() => import("./FaultyTerminal"), { ssr: false });
const GRID: [number, number] = [2, 1];

export function AppEffects({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname === "/login" || pathname.startsWith("/auth/");

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
          tint={isAuth ? "#A7EF9E" : "#ff3347"}
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
