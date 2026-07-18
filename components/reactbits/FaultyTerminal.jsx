"use client";
import { useEffect, useRef } from "react";
const THEME_TINTS = {
  red: "#ff3347",
  purple: "#a970ff",
  cyan: "#27d7e8",
  green: "#4ade80",
  gold: "#e2b34c",
  blue: "#60a5fa",
  orange: "#fb923c",
  pink: "#f472b6",
};
function currentTint() {
  const theme = document.documentElement.dataset.theme;
  return theme && theme in THEME_TINTS ? THEME_TINTS[theme] : THEME_TINTS.red;
}
/**
 * Faulty Terminal atmosphere rendered entirely in an OffscreenCanvas worker.
 * Animation never updates React state or listens for pointer movement, so only
 * the background canvas is repainted.
 */
export function FaultyTerminalBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (
      !canvas ||
      typeof Worker === "undefined" ||
      !("transferControlToOffscreen" in canvas)
    )
      return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const worker = new Worker("/faulty-terminal.worker.js");
    const offscreen = canvas.transferControlToOffscreen();
    const size = () => ({
      width: canvas.clientWidth || window.innerWidth,
      height: canvas.clientHeight || window.innerHeight,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    });
    worker.postMessage(
      {
        type: "init",
        canvas: offscreen,
        ...size(),
        tint: currentTint(),
        reducedMotion,
      },
      [offscreen],
    );
    const resizeObserver = new ResizeObserver(() =>
      worker.postMessage({ type: "resize", ...size() }),
    );
    resizeObserver.observe(canvas);
    const themeObserver = new MutationObserver(() => {
      worker.postMessage({ type: "tint", tint: currentTint() });
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const syncVisibility = () =>
      worker.postMessage({ type: "visibility", visible: !document.hidden });
    document.addEventListener("visibilitychange", syncVisibility, {
      passive: true,
    });
    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      worker.postMessage({ type: "dispose" });
      worker.terminate();
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      className="faulty-terminal-background"
      aria-hidden="true"
    />
  );
}
