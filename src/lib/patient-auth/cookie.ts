/** Patient session cookie settings, shared by the login action and the proxy (no DB imports). */

export const SESSION_DAYS = 30;
export const patientCookieName = "hairair_patient";
export const patientSessionMaxAge = SESSION_DAYS * 86_400;
export const patientCookiePath = (slug: string) => `/c/${slug}`;

export function patientCookieOptions(slug: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: patientCookiePath(slug),
    maxAge: patientSessionMaxAge,
  };
}
