import { eq } from "drizzle-orm";
import { auditLog, clinics, clinicSettings } from "../../db/schema";
import type { Database } from "../../db/types";
import { parseClinicSettings, type ClinicSettings } from "./schema";

/**
 * Saves the clinic's name and a partial settings change. Settings are read, merged and parsed
 * whole (parseClinicSettings), so an invalid value is refused and unknown keys never stick.
 */

export type SaveClinicInput = {
  clinicId: string;
  name?: string;
  settings?: Partial<ClinicSettings>;
  staffId: string | null;
};

export type SaveClinicResult = { status: "saved"; settings: ClinicSettings } | { status: "invalid"; field: string };

export async function saveClinicProfile(db: Database, input: SaveClinicInput): Promise<SaveClinicResult> {
  const name = input.name?.trim().replace(/\s+/g, " ");
  if (name !== undefined && (name.length < 2 || name.length > 80)) return { status: "invalid", field: "name" };

  const [row] = await db.select({ settings: clinicSettings.settings }).from(clinicSettings).where(eq(clinicSettings.clinicId, input.clinicId));
  const current = parseClinicSettings(row?.settings ?? {});
  let next: ClinicSettings;
  try {
    next = parseClinicSettings({ ...current, ...input.settings });
  } catch (error) {
    const path = (error as { issues?: { path: PropertyKey[] }[] }).issues?.[0]?.path?.[0];
    return { status: "invalid", field: typeof path === "string" ? path : "settings" };
  }

  const changed = Object.keys(input.settings ?? {}).filter((key) => JSON.stringify(current[key as keyof ClinicSettings]) !== JSON.stringify(next[key as keyof ClinicSettings]));
  await db.transaction(async (tx) => {
    if (name !== undefined) await tx.update(clinics).set({ name }).where(eq(clinics.id, input.clinicId));
    await tx
      .insert(clinicSettings)
      .values({ clinicId: input.clinicId, settings: next, updatedBy: input.staffId })
      .onConflictDoUpdate({ target: clinicSettings.clinicId, set: { settings: next, updatedAt: new Date(), updatedBy: input.staffId } });
    await tx.insert(auditLog).values({
      clinicId: input.clinicId,
      actorKind: input.staffId ? "staff" : "system",
      actorId: input.staffId,
      action: "settings.update",
      metadata: { fields: [...changed, ...(name !== undefined ? ["name"] : [])] },
    });
  });
  return { status: "saved", settings: next };
}
