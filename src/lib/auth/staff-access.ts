import { and, eq } from "drizzle-orm";
import { clinics, clinicSettings, staffUsers } from "../../db/schema";
import type { Database } from "../../db/types";
import type { StaffRole } from "../authz/capabilities";
import type { StaffActor } from "../authz/policy";
import { parseClinicSettings, type ClinicSettings } from "../clinic-settings/schema";

/**
 * Decides what a signed-in Better Auth user may reach. Pure decision + one DB loader,
 * kept free of Next.js so it can be tested directly.
 */

export type StaffRecord = {
  id: string;
  clinicId: string;
  clinicName: string;
  role: StaffRole;
  fullName: string;
  disabledAt: Date | null;
  settings: ClinicSettings;
};

export type SessionUser = { id: string; email: string; twoFactorEnabled?: boolean | null };

export type StaffAccess =
  | { state: "anonymous" }
  | { state: "not_staff" }
  | { state: "disabled" }
  | { state: "needs_2fa_setup"; staff: StaffRecord }
  | { state: "ok"; staff: StaffRecord; actor: StaffActor };

export function resolveStaffAccess(user: SessionUser | null, staff: StaffRecord | null): StaffAccess {
  if (!user) return { state: "anonymous" };
  if (!staff) return { state: "not_staff" };
  if (staff.disabledAt) return { state: "disabled" };
  if (!user.twoFactorEnabled) return { state: "needs_2fa_setup", staff };
  return {
    state: "ok",
    staff,
    actor: { kind: "staff", staffId: staff.id, clinicId: staff.clinicId, role: staff.role },
  };
}

export async function loadStaffByAuthUser(db: Database, authUserId: string): Promise<StaffRecord | null> {
  const rows = await db
    .select({
      id: staffUsers.id,
      clinicId: staffUsers.clinicId,
      clinicName: clinics.name,
      role: staffUsers.role,
      fullName: staffUsers.fullName,
      disabledAt: staffUsers.disabledAt,
      settings: clinicSettings.settings,
    })
    .from(staffUsers)
    .innerJoin(clinics, eq(clinics.id, staffUsers.clinicId))
    .leftJoin(clinicSettings, eq(clinicSettings.clinicId, staffUsers.clinicId))
    .where(and(eq(staffUsers.authUserId, authUserId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { ...row, settings: parseClinicSettings(row.settings) };
}
