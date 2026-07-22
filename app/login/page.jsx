import { safeRedirectPath } from "@/lib/auth/redirect";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { QueenDiamondLogo } from "@/components/QueenDiamondLogo";
function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}
export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const mode = firstParam(params.mode) === "sign-up" ? "sign-up" : "sign-in";
  const message = firstParam(params.error) ?? firstParam(params.message);
  const next = safeRedirectPath(firstParam(params.next));
  if (!isSupabaseConfigured()) {
    return (
      <div className="panel browser-mode-card auth-standalone-card px-7 py-8 max-w-md mx-auto mt-16">
        <div className="auth-logo-lockup" aria-label="QuantPoker">
          <QueenDiamondLogo className="auth-logo" />
          <span>
            <span className="auth-brand-quant">uant</span>
            <span className="auth-brand-poker">Poker</span>
          </span>
        </div>
        <h1 className="text-xl font-bold mb-2">Browser-only mode</h1>
        <p className="text-sm text-muted mb-4">
          Supabase environment variables are not set, so QuantPoker is using
          local browser storage.
        </p>
        {/* Keep browser-only mode free of a client navigation runtime. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="btn btn-primary">
          Continue to QuantPoker
        </a>
      </div>
    );
  }
  const toggleParams = new URLSearchParams({
    mode: mode === "sign-in" ? "sign-up" : "sign-in",
  });
  if (next !== "/") toggleParams.set("next", next);
  return (
    <main className="auth-page px-5 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="auth-shell">
        <section className="panel auth-card px-7 py-8">
          <div className="auth-logo-lockup" aria-label="QuantPoker">
            <QueenDiamondLogo className="auth-logo" />
            <span>
              <span className="auth-brand-quant">uant</span>
              <span className="auth-brand-poker">Poker</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold mb-6">
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </h1>
          <form action="/auth/password" method="post" className="space-y-5">
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="next" value={next} />
            {mode === "sign-up" && (
              <label className="block">
                <span className="label">Username</span>
                <input
                  className="field mt-1"
                  name="username"
                  type="text"
                  autoComplete="username"
                  minLength={3}
                  maxLength={24}
                  pattern="[A-Za-z0-9_]+"
                  placeholder="River_Reader"
                  required
                />
                <span className="block text-[11px] text-muted mt-1">
                  3–24 letters, numbers, or underscores. Capitalization is
                  preserved, and friends can search without matching case.
                </span>
              </label>
            )}
            <label className="block">
              <span className="label">Email</span>
              <input
                className="field mt-1"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input
                className="field mt-1"
                name="password"
                type="password"
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                minLength={8}
                required
              />
            </label>
            {message && (
              <div
                className="text-sm rounded-md border border-line bg-panel2 px-3 py-2"
                role="status"
              >
                {message}
              </div>
            )}
            <button
              className="btn btn-primary w-full justify-center py-3"
              type="submit"
            >
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </button>
          </form>
          <a
            className="inline-block text-sm text-accent mt-4 hover:underline"
            href={`/login?${toggleParams.toString()}`}
          >
            {mode === "sign-in"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </a>
        </section>
      </div>
    </main>
  );
}
