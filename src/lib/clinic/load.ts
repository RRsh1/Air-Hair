import { eq } from "drizzle-orm";
import { clinics, clinicSettings } from "../../db/schema";
import type { Database } from "../../db/types";
import { parseClinicSettings, type ClinicSettings } from "../clinic-settings/schema";

export type ClinicRecord = { id: string; slug: string; name: string; timeZone: string; settings: ClinicSettings };

export async function loadClinicBySlug(db: Database, slug: string): Promise<ClinicRecord | null> {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const [row] = await db
    .select({ id: clinics.id, slug: clinics.slug, name: clinics.name, timeZone: clinics.timeZone, settings: clinicSettings.settings })
    .from(clinics)
    .leftJoin(clinicSettings, eq(clinicSettings.clinicId, clinics.id))
    .where(eq(clinics.slug, slug))
    .limit(1);
  return row ? { ...row, settings: parseClinicSettings(row.settings) } : null;
}

/** Alphanumeric SMS sender: the clinic's setting, else a Latin fallback. */
export function smsSenderFor(clinic: ClinicRecord): string {
  return clinic.settings.smsSenderName ?? "HairAir";
}
