"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { QueenDiamondLogo } from "@/components/QueenDiamondLogo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(searchParams.get("error"));

  if (!isSupabaseConfigured()) {
    return (
      <div className="panel browser-mode-card px-7 py-8 max-w-md mx-auto mt-16">
        <h1 className="text-xl font-bold mb-2">Browser-only mode</h1>
        <p className="text-sm text-muted mb-4">
          Supabase environment variables are not set, so QuantPoker is using local browser storage.
        </p>
        <Link href="/" className="btn btn-primary">Continue to QuantPoker</Link>
      </div>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
      const next = searchParams.get("next");
      router.replace(safeRedirectPath(next));
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) {
      setMessage(error.message);
    } else if (data.session) {
      router.replace("/");
      router.refresh();
      return;
    } else {
      setMessage("Check your email to confirm your account, then sign in.");
    }
    setBusy(false);
  };

  return (
    <div className="auth-shell">
      <section className="auth-story" aria-hidden="true">
        <div className="auth-brand"><QueenDiamondLogo /> <span><span className="auth-brand-quant">uant</span><span className="auth-brand-poker">Poker</span></span></div>
        <div className="auth-story-copy">
          <div className="page-eyebrow"><span /> Strategy intelligence</div>
          <h2>Find the signal<br />inside your game.</h2>
          <p>Model your decisions. Test your assumptions. Build an edge you can actually explain.</p>
        </div>
        <div className="auth-data-card">
          <div><span>SIMULATION CONFIDENCE</span><strong>94.2%</strong></div>
          <div className="auth-chart"><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </div>
      </section>
      <section className="panel auth-card px-7 py-8">
      <div className="auth-mobile-brand brand-lockup mono text-lg font-bold tracking-tight mb-5">
        <QueenDiamondLogo /><span><span>uant</span><span className="text-accent">Poker</span></span>
      </div>
      <div className="page-eyebrow"><span /> Secure workspace</div>
      <h1 className="text-3xl font-bold mb-2">{mode === "sign-in" ? "Welcome back" : "Create your account"}</h1>
      <p className="text-sm text-muted mb-6">Your models, experiments, and hand histories stay private and synchronized.</p>
      <form onSubmit={submit} className="space-y-5">
        <label className="block">
          <span className="label">Email</span>
          <input className="field mt-1" type="email" autoComplete="email" value={email}
            onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="field mt-1" type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
        </label>
        {message && <div className="text-sm rounded-md border border-line bg-panel2 px-3 py-2">{message}</div>}
        <button className="btn btn-primary w-full justify-center py-3" disabled={busy} type="submit">
          {busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button className="text-sm text-accent mt-4 hover:underline" type="button"
        onClick={() => {
          setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
          setMessage(null);
        }}>
        {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
      <div className="auth-trust"><span>Encrypted transport</span><span>Private by default</span></div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="text-muted text-sm">Loading…</div>}><LoginForm /></Suspense>;
}
