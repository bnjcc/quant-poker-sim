"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeRedirectPath } from "@/lib/auth/redirect";

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
      <div className="panel px-6 py-6 max-w-md mx-auto mt-16">
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
    <div className="panel px-6 py-6 max-w-md mx-auto mt-16">
      <div className="mono text-lg font-bold tracking-tight mb-1">
        Quant<span className="text-accent">Poker</span>
      </div>
      <h1 className="text-xl font-bold mb-2">{mode === "sign-in" ? "Sign in" : "Create your account"}</h1>
      <p className="text-sm text-muted mb-5">
        Your calibrations, experiments, and hand histories sync privately through Supabase.
      </p>
      <form onSubmit={submit} className="space-y-4">
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
        <button className="btn btn-primary w-full" disabled={busy} type="submit">
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
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="text-muted text-sm">Loading…</div>}><LoginForm /></Suspense>;
}
