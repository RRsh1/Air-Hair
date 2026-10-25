import { eq } from "drizzle-orm";
import { staffUsers } from "../../db/schema";
import type { Database } from "../../db/types";
import type { Auth } from "../auth/build-auth";

/**
 * Disables a staff member immediately: marks the record AND revokes every Better Auth session,
 * so a departing or compromised account is locked out now, not when its session expires.
 * The session.create hook then refuses any new sign-in for this account.
 */
export async function disableStaff(db: Database, auth: Auth, staffId: string): Promise<void> {
  const [staff] = await db
    .update(staffUsers)
    .set({ disabledAt: new Date() })
    .where(eq(staffUsers.id, staffId))
    .returning({ authUserId: staffUsers.authUserId });
  if (!staff) throw new Error("Staff member not found");
  if (staff.authUserId) {
    const ctx = await auth.$context;
    await ctx.internalAdapter.deleteUserSessions(staff.authUserId);
  }
}

export async function enableStaff(db: Database, staffId: string): Promise<void> {
  await db.update(staffUsers).set({ disabledAt: null }).where(eq(staffUsers.id, staffId));
}
