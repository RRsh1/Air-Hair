import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only: sends visitors without a session cookie to the login page.
 * It does NOT validate the session; every protected page and action calls requireStaff().
 */
const PUBLIC_CLINIC_PATHS = ["/clinic/login", "/clinic/forgot-password", "/clinic/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_CLINIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }
  if (!getSessionCookie(request, { cookiePrefix: "hairair" })) {
    return NextResponse.redirect(new URL("/clinic/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/clinic/:path*"],
};
