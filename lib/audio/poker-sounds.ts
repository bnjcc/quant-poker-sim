"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChosenAction } from "@/types/decision";

const SOUND_STORAGE_KEY = "quantpoker-calibration-sounds";

let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return null;
  audioContext ??= new AudioContextClass();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function noiseBurst(ctx: AudioContext, at: number, duration: number, volume: number, frequency: number) {
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) {
    const fade = 1 - index / samples.length;
    samples[index] = (Math.random() * 2 - 1) * fade;
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at);
  source.stop(at + duration);
}

function tone(ctx: AudioContext, at: number, frequency: number, duration: number, volume: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, at);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, at + duration);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration);
}

function playCardDeal(count: number) {
  const ctx = context();
  if (!ctx) return;
  const cards = Math.max(1, Math.min(5, count));
  for (let index = 0; index < cards; index++) {
    const at = ctx.currentTime + index * 0.075;
    noiseBurst(ctx, at, 0.07, 0.09, 1_650 + index * 120);
    tone(ctx, at, 145 + index * 7, 0.035, 0.025);
  }
}

function playAction(action: ChosenAction["type"]) {
  const ctx = context();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (action === "fold") {
    noiseBurst(ctx, now, 0.11, 0.08, 980);
    return;
  }
  if (action === "check") {
    tone(ctx, now, 185, 0.055, 0.08);
    return;
  }
  const hits = action === "raise" || action === "bet" ? 3 : 2;
  for (let index = 0; index < hits; index++) {
    tone(ctx, now + index * 0.045, 720 + index * 170, 0.075, 0.055);
  }
}

export function usePokerSounds() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off");
  }, []);

  const unlock = useCallback(() => {
    if (enabled) context();
  }, [enabled]);

  const playDeal = useCallback((count = 1) => {
    if (enabled) playCardDeal(count);
  }, [enabled]);

  const playDecision = useCallback((action: ChosenAction["type"]) => {
    if (enabled) playAction(action);
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off");
      if (next) {
        context();
        playAction("check");
      }
      return next;
    });
  }, []);

  return useMemo(
    () => ({ enabled, playDeal, playDecision, toggle, unlock }),
    [enabled, playDeal, playDecision, toggle, unlock],
  );
}
