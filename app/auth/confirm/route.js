import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/redirect";
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeRedirectPath(url.searchParams.get("next"));
  const supabase = await createServerSupabaseClient();
  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("The confirmation link is incomplete or expired.") };
  if (!result.error) return NextResponse.redirect(new URL(next, url.origin));
  const login = new URL("/login", url.origin);
  login.searchParams.set("error", result.error.message);
  return NextResponse.redirect(login);
}
