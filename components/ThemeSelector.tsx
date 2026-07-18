"use client";

import { useEffect, useState } from "react";

const THEMES = [
  { id: "red", name: "Black & red", color: "#ff3347" },
  { id: "purple", name: "Black & purple", color: "#a970ff" },
  { id: "cyan", name: "Black & cyan", color: "#27d7e8" },
  { id: "green", name: "Black & green", color: "#4ade80" },
  { id: "gold", name: "Black & gold", color: "#e2b34c" },
  { id: "blue", name: "Black & blue", color: "#60a5fa" },
  { id: "orange", name: "Black & orange", color: "#fb923c" },
  { id: "pink", name: "Black & pink", color: "#f472b6" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "rangebench-ui-theme";

export function ThemeSelector() {
  const [theme, setTheme] = useState<ThemeId>("red");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const selected = THEMES.some((option) => option.id === saved) ? (saved as ThemeId) : "red";
    setTheme(selected);
    document.documentElement.dataset.theme = selected;
  }, []);

  const selectTheme = (next: ThemeId) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <section className="panel px-5 py-4 lg:col-span-2">
      <h2 className="font-semibold">Interface theme</h2>
      <p className="text-sm text-muted mt-1">Choose an accent color. Your choice is saved on this device.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4" role="radiogroup" aria-label="Interface theme">
        {THEMES.map((option) => {
          const selected = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`theme-option ${selected ? "theme-option-selected" : ""}`}
              onClick={() => selectTheme(option.id)}
            >
              <span className="theme-swatch" style={{ background: option.color }} aria-hidden="true" />
              <span>{option.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
