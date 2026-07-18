"use client";

import Link from "next/link";
import { Card } from "@/types/poker";
import { cardToString } from "@/lib/poker/deck";

const SUIT_GLYPH: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function CardGlyph({ card, size = "md" }: { card: Card; size?: "sm" | "md" | "lg" }) {
  const red = card.suit === "h" || card.suit === "d";
  const cls =
    size === "lg"
      ? "text-lg px-2 py-1 min-w-[2.4rem]"
      : size === "sm"
        ? "text-xs px-1 py-0.5 min-w-[1.6rem]"
        : "text-sm px-1.5 py-0.5 min-w-[2rem]";
  return (
    <span
      className={`playing-card mono inline-flex items-center justify-center font-bold ${cls}`}
      style={{ color: red ? "var(--suit-red)" : "#18212b" }}
      aria-label={cardToString(card)}
    >
      {cardToString(card)[0]}
      {SUIT_GLYPH[card.suit]}
    </span>
  );
}

export function CardRow({ cards, size = "md" }: { cards: Card[]; size?: "sm" | "md" | "lg" }) {
  return (
    <span className="inline-flex gap-1">
      {cards.map((c, i) => (
        <CardGlyph key={i} card={c} size={size} />
      ))}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "gain" | "loss" | "neutral";
  title?: string;
}) {
  const color = tone === "gain" ? "var(--gain)" : tone === "loss" ? "var(--loss)" : "var(--ink)";
  return (
    <div className="panel stat-card px-4 py-3" title={title}>
      <div className="label">{label}</div>
      <div className="mono stat-value text-xl font-bold mt-1" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

/** Percentage meter whose fill and text always describe the same value. */
export function PercentageBar({ value, label }: { value: number; label?: string }) {
  const bounded = Math.max(0, Math.min(1, value));
  const pct = bounded * 100;
  const display = label ?? `${Math.round(pct)}%`;
  return (
    <div className="flex items-center gap-2" title={`Percentage: ${display}`}>
      <div className="h-1.5 w-16 rounded bg-panel2 overflow-hidden">
        <div className="h-full rounded bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted mono">{display}</span>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="panel px-8 py-12 text-center">
      <div className="text-lg font-semibold">{title}</div>
      <p className="text-sm text-muted mt-2 max-w-md mx-auto">{body}</p>
      {action && (
        <Link href={action.href} className="btn btn-primary mt-5">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="page-header flex items-start justify-between gap-4 mb-7">
      <div className="min-w-0">
        <div className="page-eyebrow"><span /> QuantPoker workspace</div>
        <h1 className="page-title text-3xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-muted mt-1 max-w-2xl">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function WarningNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-ink">
      <span className="font-semibold text-accent">Heads up: </span>
      {children}
    </div>
  );
}

export function fmtBB(x: number, digits = 1): string {
  return `${x >= 0 ? "+" : ""}${x.toFixed(digits)} bb`;
}

export function fmtChips(x: number): string {
  return `${x >= 0 ? "+" : ""}${x.toLocaleString()}`;
}

export function fmtPct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}
