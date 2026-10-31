/**
 * The treatment the patient is looking at, when they have more than one. Kept in a cookie scoped to
 * the clinic's patient app; it's a preference, not a credential: loadPatientJournal only honours an
 * id among the signed-in patient's own treatments and otherwise falls back to the default.
 */
export const treatmentCookieName = "ha_treatment";

export function treatmentCookieOptions(slug: string) {
  return {
    path: `/c/${slug}`,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  };
}
