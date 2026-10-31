import { and, asc, eq, isNull } from "drizzle-orm";
import { captureRules, clinicSettings, procedureLibrary, timelinePhases, timelineTemplates, timelineVersions } from "../../db/schema";
import type { Database } from "../../db/types";
import { parseClinicSettings } from "../clinic-settings/schema";
import { defaultCaptureRules } from "../timeline/capture-schedule";

/**
 * The procedure catalog. The platform keeps one library (procedure_library: scalp, beard, mustache,
 * eyebrows…); a clinic adopts a procedure by getting its own copy, a timeline template with a first
 * published version (phases and the default capture schedule), which it can then edit freely.
 */

export type LibraryProcedure = { key: string; vertical: "hair" | "dental" | "wound"; nameHe: string };

export async function listLibrary(db: Database): Promise<LibraryProcedure[]> {
  return db
    .select({ key: procedureLibrary.key, vertical: procedureLibrary.vertical, nameHe: procedureLibrary.nameHe })
    .from(procedureLibrary)
    .orderBy(asc(procedureLibrary.sortOrder));
}

/** Creates a clinic procedure (template + published v1). Runs inside the caller's transaction if given one. */
export async function createClinicProcedure(
  db: Database,
  input: { clinicId: string; name: string; libraryKey: string | null; followUpMonths: number; staffId: string | null },
): Promise<{ templateId: string; versionId: string }> {
  const [template] = await db
    .insert(timelineTemplates)
    .values({ clinicId: input.clinicId, name: input.name, libraryKey: input.libraryKey })
    .returning({ id: timelineTemplates.id });

  const [version] = await db
    .insert(timelineVersions)
    .values({ templateId: template.id, version: 1, status: "published", publishedAt: new Date(), publishedBy: input.staffId })
    .returning({ id: timelineVersions.id });

  await db.insert(timelinePhases).values([
    { versionId: version.id, phase: "pre_op", name: "לפני הניתוח", sortOrder: 0 },
    { versionId: version.id, phase: "post_op", fromDay: 0, toDay: input.followUpMonths * 30, name: "החלמה", sortOrder: 1 },
  ]);

  await db.insert(captureRules).values(
    defaultCaptureRules(input.followUpMonths).map((rule) =>
      rule.phase === "pre_op"
        ? { versionId: version.id, phase: rule.phase, maxCount: rule.maxCount, angles: [...rule.angles] }
        : {
            versionId: version.id,
            phase: rule.phase,
            fromDay: rule.fromDay,
            toDay: rule.toDay,
            everyDays: rule.everyDays,
            angles: [...rule.angles],
          },
    ),
  );
  return { templateId: template.id, versionId: version.id };
}

export type AdoptResult = { status: "adopted" | "exists"; templateId: string } | { status: "unknown" };

/** Gives the clinic its own copy of a library procedure; returns the existing copy if it has one. */
export async function adoptLibraryProcedure(
  db: Database,
  input: { clinicId: string; libraryKey: string; staffId: string | null },
): Promise<AdoptResult> {
  const [procedure] = await db.select().from(procedureLibrary).where(eq(procedureLibrary.key, input.libraryKey)).limit(1);
  if (!procedure) return { status: "unknown" };

  const [existing] = await db
    .select({ id: timelineTemplates.id })
    .from(timelineTemplates)
    .where(
      and(
        eq(timelineTemplates.clinicId, input.clinicId),
        eq(timelineTemplates.libraryKey, input.libraryKey),
        isNull(timelineTemplates.archivedAt),
      ),
    )
    .limit(1);
  if (existing) return { status: "exists", templateId: existing.id };

  const [settingsRow] = await db
    .select({ settings: clinicSettings.settings })
    .from(clinicSettings)
    .where(eq(clinicSettings.clinicId, input.clinicId))
    .limit(1);
  const settings = parseClinicSettings(settingsRow?.settings ?? {});

  const { templateId } = await db.transaction((tx) =>
    createClinicProcedure(tx as unknown as Database, {
      clinicId: input.clinicId,
      name: procedure.nameHe,
      libraryKey: procedure.key,
      followUpMonths: settings.followUpMonths,
      staffId: input.staffId,
    }),
  );
  return { status: "adopted", templateId };
}
