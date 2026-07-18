import { updateSession } from "@/lib/supabase/middleware";
export async function middleware(request) {
  return updateSession(request);
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:css|html|js|mjs|svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
