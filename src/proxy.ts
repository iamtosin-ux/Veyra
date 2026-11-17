import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/session";
import { verifyFileLinkToken } from "@/server/fileLinks";

// The inbound email endpoint checks its own shared secret.
const PUBLIC = ["/login", "/setup", "/api/auth/login", "/api/auth/setup", "/api/auth/code", "/api/auth/code/verify", "/api/inbound/email"];

/** Coarse gate: every page and API route requires a valid session except sign-in and first-run setup. */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();
  // Invitation uploads are authorised by their token, not a session.
  if (pathname.startsWith("/upload/") || pathname.startsWith("/api/upload/")) return NextResponse.next();
  // A short-lived signed link opens one evidence file without a session.
  const fileRoute = pathname.match(/^\/api\/evidence\/([\w-]+)\/file$/);
  if (fileRoute && verifyFileLinkToken(req.nextUrl.searchParams.get("t"), fileRoute[1])) return NextResponse.next();
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (userId) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
