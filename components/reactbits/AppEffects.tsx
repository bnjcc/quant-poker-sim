"use client";

import dynamic from "next/dynamic";
import ClickSpark from "./ClickSpark";

const FaultyTerminal = dynamic(() => import("./FaultyTerminal"), { ssr: false });
const GRID: [number, number] = [2, 1];

export function AppEffects({ children }: { children: React.ReactNode }) {
  return (
    <ClickSpark sparkColor="#ff3445" sparkCount={7} sparkRadius={20} duration={430}>
      <div className="reactbits-terminal-layer" aria-hidden="true">
        <FaultyTerminal
          tint="#ff2436"
          brightness={0.42}
          scale={1.35}
          gridMul={GRID}
          digitSize={1.4}
          timeScale={0.16}
          scanlineIntensity={0.22}
          glitchAmount={0.65}
          flickerAmount={0.25}
          noiseAmp={0.72}
          chromaticAberration={0.6}
          dither={0.12}
          curvature={0.08}
          mouseStrength={0.08}
          dpr={1}
        />
      </div>
      {children}
    </ClickSpark>
  );
}
