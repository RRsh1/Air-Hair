import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { patientCookieName, patientCookieOptions } from "@/lib/patient-auth/cookie";

/**
 * Optimistic work only; nothing here is a security decision.
 *  - /clinic: sends visitors without a session cookie to the login page. Every protected page and
 *    action still calls requireStaff().
 *  - /c/<slug>: slides the patient cookie's 30-day lifetime on each visit (the session row is
 *    the authority and is extended in loadPatientSession; a stale cookie simply fails there).
 */
const PUBLIC_CLINIC_PATHS = ["/clinic/login", "/clinic/forgot-password", "/clinic/reset-password"];
const SLUG = /^\/c\/([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)(?:\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/c/")) {
    const response = NextResponse.next();
    const slug = SLUG.exec(pathname)?.[1];
    const token = request.cookies.get(patientCookieName)?.value;
    if (slug && token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      response.cookies.set(patientCookieName, token, patientCookieOptions(slug));
    }
    return response;
  }

  if (PUBLIC_CLINIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }
  if (!getSessionCookie(request, { cookiePrefix: "hairair" })) {
    return NextResponse.redirect(new URL("/clinic/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/clinic/:path*", "/c/:path*"],
};
