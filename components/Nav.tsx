"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/calibrate", label: "Calibration session" },
  { href: "/range-calibrate", label: "Range-first calibration" },
  { href: "/profile", label: "Strategy profile" },
  { href: "/experiments/new", label: "New experiment" },
  { href: "/experiments", label: "Previous experiments" },
  { href: "/accuracy", label: "Model accuracy" },
  { href: "/compare", label: "Compare" },
  { href: "/opponents", label: "Opponent profiles" },
  { href: "/glossary", label: "Stats glossary" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  const cloudMode = isSupabaseConfigured();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudMode) return;
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [cloudMode]);

  if (path === "/login" || path.startsWith("/auth/")) return null;

  const signOut = async () => {
    await createClient().auth.signOut({ scope: "local" });
    window.location.assign("/login");
  };

  const navLinks = (mobile = false) => LINKS.map((link) => {
    const active = link.href === "/" ? path === "/" : path.startsWith(link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        className={`rounded-md px-3 py-2 text-sm transition-colors whitespace-nowrap ${
          active ? "bg-panel2 text-ink border border-line" : "text-muted hover:text-ink"
        } ${mobile ? "shrink-0" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {link.label}
      </Link>
    );
  });

  return (
    <>
      <header className="md:hidden w-full border-b border-line bg-bg px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="mono font-bold tracking-tight">
            Quant<span className="text-accent">Poker</span>
          </Link>
          {cloudMode && (
            <button className="text-xs text-accent" type="button" onClick={signOut}>Sign out</button>
          )}
        </div>
        <nav className="flex gap-1 overflow-x-auto mt-2 pb-1" aria-label="Mobile main navigation">
          {navLinks(true)}
        </nav>
      </header>
      <aside className="w-56 shrink-0 border-r border-line px-4 py-6 hidden md:flex md:flex-col gap-6 sticky top-0 h-screen">
      <Link href="/" className="block">
        <div className="mono text-lg font-bold tracking-tight">
          Quant<span className="text-accent">Poker</span>
        </div>
        <div className="text-[11px] text-muted mt-0.5">poker strategy backtesting</div>
      </Link>
      <nav className="flex flex-col gap-1" aria-label="Main">
        {navLinks()}
      </nav>
      <div className="mt-auto text-[11px] text-muted leading-relaxed space-y-3">
        <div>
          {cloudMode ? (
            <>
              <div className="text-ink truncate" title={email ?? undefined}>{email ?? "Cloud account"}</div>
              <div>Supabase sync enabled</div>
              <button className="text-accent hover:underline mt-1" type="button" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <div>Browser-only storage</div>
          )}
        </div>
        <div>Simulated results are estimates against heuristic opponents — not proof of real-world profitability.</div>
      </div>
      </aside>
    </>
  );
}
