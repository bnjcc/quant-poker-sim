import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function loginRedirect(request: NextRequest, values: Record<string, string>): NextResponse {
  const destination = new URL("/login", request.url);
  Object.entries(values).forEach(([key, value]) => destination.searchParams.set(key, value));
  return NextResponse.redirect(destination, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = form.get("email");
  const password = form.get("password");
  const mode = form.get("mode") === "sign-up" ? "sign-up" : "sign-in";
  const nextValue = form.get("next");
  const next = safeRedirectPath(typeof nextValue === "string" ? nextValue : null);

  if (typeof email !== "string" || typeof password !== "string") {
    return loginRedirect(request, { mode, next, error: "Email and password are required." });
  }

  const supabase = await createServerSupabaseClient();
  if (mode === "sign-in") {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return loginRedirect(request, { mode, next, error: error.message });
    return NextResponse.redirect(new URL(next, request.url), 303);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${new URL(request.url).origin}/auth/confirm` },
  });
  if (error) return loginRedirect(request, { mode, next, error: error.message });
  if (data.session) return NextResponse.redirect(new URL(next, request.url), 303);
  return loginRedirect(request, {
    mode: "sign-in",
    next,
    message: "Check your email to confirm your account, then sign in.",
  });
}
