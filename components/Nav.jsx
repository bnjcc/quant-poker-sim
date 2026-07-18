"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { QueenDiamondLogo } from "@/components/QueenDiamondLogo";
const LINKS = [
  { href: "/", label: "Dashboard", icon: "grid", group: "Model" },
  {
    href: "/range-calibrate",
    label: "Range-first calibration",
    icon: "range",
    group: "Model",
  },
  {
    href: "/profile",
    label: "Strategy profile",
    icon: "profile",
    group: "Model",
  },
  {
    href: "/experiments/new",
    label: "New experiment",
    icon: "spark",
    group: "Lab",
  },
  {
    href: "/experiments",
    label: "Previous experiments",
    icon: "history",
    group: "Lab",
  },
  { href: "/accuracy", label: "Model accuracy", icon: "target", group: "Lab" },
  { href: "/compare", label: "Compare", icon: "compare", group: "Lab" },
  {
    href: "/opponents",
    label: "Opponent profiles",
    icon: "users",
    group: "Library",
  },
  {
    href: "/glossary",
    label: "Stats glossary",
    icon: "book",
    group: "Library",
  },
  { href: "/settings", label: "Settings", icon: "settings", group: "Library" },
];
const ICON_PATHS = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  cards: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M9 8h6M9 12h4" />
    </>
  ),
  range: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
      <path d="m4 6 6-4 6 7 5-4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.7-4 3.4-6 8-6s7.3 2 8 6" />
    </>
  ),
  spark: (
    <>
      <path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" />
      <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  compare: (
    <>
      <path d="M7 4v16M17 4v16M3 8l4-4 4 4M13 16l4 4 4-4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c.4-4 2.4-6 6-6s5.6 2 6 6M16 5c2.2.2 3 1.3 3 3s-.8 2.8-3 3M17 14c2.5.4 3.8 2.4 4 5" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A3.5 3.5 0 0 1 7.5 3H11v17H7.5A3.5 3.5 0 0 0 4 21V4.5ZM20 4.5A3.5 3.5 0 0 0 16.5 3H13v17h3.5A3.5 3.5 0 0 1 20 21V4.5Z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
};
function NavIcon({ name }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
function Brand() {
  return (
    <div className="brand-lockup">
      <QueenDiamondLogo />
      <span>
        <span className="brand-name">
          <span className="brand-quant">uant</span>
          <span className="brand-poker">Poker</span>
        </span>
        <span className="brand-subtitle">Strategy intelligence</span>
      </span>
    </div>
  );
}
export function Nav() {
  const path = usePathname();
  const cloudMode = isSupabaseConfigured();
  const [email, setEmail] = useState(null);
  useEffect(() => {
    if (!cloudMode) return;
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, [cloudMode]);
  if (path === "/login" || path.startsWith("/auth/")) return null;
  const signOut = async () => {
    await createClient().auth.signOut({ scope: "local" });
    window.location.assign("/login");
  };
  const navLinks = (links = LINKS, mobile = false) =>
    links.map((link) => {
      const active =
        link.href === "/" ? path === "/" : path.startsWith(link.href);
      return (
        <Link
          key={link.href}
          href={link.href}
          className={`nav-link ${active ? "nav-link-active" : ""} ${mobile ? "shrink-0" : ""}`}
          aria-current={active ? "page" : undefined}
        >
          <NavIcon name={link.icon} />
          <span>{link.label}</span>
          {active && <span className="nav-link-pip" aria-hidden="true" />}
        </Link>
      );
    });
  return (
    <>
      <header className="mobile-nav md:hidden w-full px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" aria-label="QuantPoker dashboard">
            <Brand />
          </Link>
          {cloudMode && (
            <button
              className="text-xs text-accent"
              type="button"
              onClick={signOut}
            >
              Sign out
            </button>
          )}
        </div>
        <nav
          className="flex gap-1 overflow-x-auto mt-2 pb-1"
          aria-label="Mobile main navigation"
        >
          {navLinks(LINKS, true)}
        </nav>
      </header>
      <aside className="app-sidebar w-64 shrink-0 px-4 py-5 hidden md:flex md:flex-col sticky top-0 h-screen">
        <Link
          href="/"
          className="sidebar-brand"
          aria-label="QuantPoker dashboard"
        >
          <Brand />
        </Link>
        <nav className="flex flex-col gap-5 mt-8" aria-label="Main">
          {["Model", "Lab", "Library"].map((group) => (
            <div key={group} className="nav-group">
              <div className="nav-group-label">{group}</div>
              <div className="flex flex-col gap-1">
                {navLinks(LINKS.filter((link) => link.group === group))}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer mt-auto text-[11px] text-muted leading-relaxed space-y-3">
          <div>
            {cloudMode ? (
              <>
                <div className="sidebar-status">
                  <span className="status-dot" />
                  Cloud sync enabled
                </div>
                <div
                  className="text-ink truncate mt-1"
                  title={email ?? undefined}
                >
                  {email ?? "Cloud account"}
                </div>
                <button
                  className="text-accent hover:underline mt-1"
                  type="button"
                  onClick={signOut}
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="sidebar-status">
                <span className="status-dot" />
                Browser storage
              </div>
            )}
          </div>
          <div>
            Simulated results are estimates against heuristic opponents — not
            proof of real-world profitability.
          </div>
        </div>
      </aside>
    </>
  );
}
