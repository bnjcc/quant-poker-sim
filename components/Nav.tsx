"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/calibrate", label: "Calibration session" },
  { href: "/profile", label: "Strategy profile" },
  { href: "/experiments/new", label: "New experiment" },
  { href: "/experiments", label: "Experiments" },
  { href: "/compare", label: "Compare" },
  { href: "/opponents", label: "Opponent profiles" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r border-line px-4 py-6 hidden md:flex md:flex-col gap-6 sticky top-0 h-screen">
      <Link href="/" className="block">
        <div className="mono text-lg font-bold tracking-tight">
          Range<span className="text-accent">Bench</span>
        </div>
        <div className="text-[11px] text-muted mt-0.5">poker strategy backtesting</div>
      </Link>
      <nav className="flex flex-col gap-1" aria-label="Main">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                active ? "bg-panel2 text-ink border border-line" : "text-muted hover:text-ink"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto text-[11px] text-muted leading-relaxed">
        Simulated results are estimates against heuristic opponents — not proof of real-world profitability.
      </div>
    </aside>
  );
}
