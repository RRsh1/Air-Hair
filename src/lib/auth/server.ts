import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";
import { getDb } from "@/db/client";
import { sendPasswordLink } from "@/lib/notifications/mailer";
import { buildAuth, type Auth } from "./build-auth";
import { loadStaffByAuthUser, resolveStaffAccess, type StaffAccess } from "./staff-access";

let instance: Auth | undefined;

export function getAuth(): Auth {
  if (!instance) {
    const secret = process.env.BETTER_AUTH_SECRET;
    const baseURL = process.env.BETTER_AUTH_URL;
    if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must be set (32+ characters)");
    if (!baseURL) throw new Error("BETTER_AUTH_URL must be set");
    instance = buildAuth(getDb(), {
      secret,
      baseURL,
      sendPasswordLink,
      secureCookies: process.env.NODE_ENV === "production",
      // Vercel sets this header itself and overwrites client values; elsewhere use the default.
      clientIpHeader: process.env.VERCEL ? "x-vercel-forwarded-for" : undefined,
      runInBackground: (task) => after(() => task.catch((error) => console.error("background task failed", error))),
    });
  }
  return instance;
}

/** Session + staff record for the current request, memoized per request. */
export const getStaffAccess = cache(async (): Promise<StaffAccess> => {
  // Read headers first: it marks the page as dynamic before any auth setup runs.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return resolveStaffAccess(null, null);
  const staff = await loadStaffByAuthUser(getDb(), session.user.id);
  return resolveStaffAccess(session.user, staff);
});

/**
 * Guard for every clinic dashboard page and server action.
 * The proxy only does an optimistic cookie check; this is the real one.
 */
export async function requireStaff() {
  const access = await getStaffAccess();
  switch (access.state) {
    case "ok":
      return access;
    case "needs_2fa_setup":
      redirect("/clinic/setup-2fa");
    case "disabled":
    case "not_staff":
      redirect("/clinic/login?error=no_access");
    case "anonymous":
      redirect("/clinic/login");
  }
}
