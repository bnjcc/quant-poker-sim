import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";
import { safeRedirectPath } from "@/lib/auth/redirect";
const PUBLIC_PATHS = ["/login", "/auth/confirm", "/auth/password"];
export async function updateSession(request) {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  const isPublic = PUBLIC_PATHS.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`),
  );
  if (
    (error || !data?.claims) &&
    request.nextUrl.pathname === "/login" &&
    request.method === "GET"
  ) {
    const rewrite = NextResponse.rewrite(new URL("/login.html", request.url));
    response.cookies.getAll().forEach((cookie) => rewrite.cookies.set(cookie));
    return rewrite;
  }
  if ((error || !data?.claims) && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }
  if (!error && data?.claims && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(
      new URL(
        safeRedirectPath(request.nextUrl.searchParams.get("next")),
        request.url,
      ),
    );
  }
  return response;
}
