import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { auditLog, patients, timelineTemplates, timelineVersions, treatments } from "../../db/schema";
import type { Database } from "../../db/types";
import { activeBranchId, mainBranchId } from "../branches/branches";
import type { IsoDate } from "../timeline/days";

/**
 * A patient has many treatments over the years, each with its own procedure, branch, protocol
 * version, day 0 and status. A returning patient (a beard transplant a year after the scalp) gets a
 * new treatment on the same account; earlier treatments are never touched.
 *
 *   scheduled → performed → completed      (or cancelled from scheduled / performed)
 *
 * Completed and cancelled treatments are a read-only archive. The database allows at most one
 * active (scheduled or performed) treatment per patient and procedure.
 */

export const activeStatuses = ["scheduled", "performed"] as const;
export type TreatmentStatus = (typeof treatments.$inferSelect)["status"];

export function isActiveStatus(status: TreatmentStatus): status is (typeof activeStatuses)[number] {
  return status === "scheduled" || status === "performed";
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(value: string): value is IsoDate {
  return ISO.test(value) && !Number.isNaN(Date.parse(value));
}

/** The published version of a clinic procedure (timeline template); the oldest active one by default. */
export async function findPublishedTemplate(db: Database, clinicId: string, templateId?: string) {
  const [row] = await db
    .select({ templateId: timelineTemplates.id, versionId: timelineVersions.id })
    .from(timelineTemplates)
    .innerJoin(
      timelineVersions,
      and(eq(timelineVersions.templateId, timelineTemplates.id), eq(timelineVersions.status, "published")),
    )
    .where(
      and(
        eq(timelineTemplates.clinicId, clinicId),
        isNull(timelineTemplates.archivedAt),
        templateId ? eq(timelineTemplates.id, templateId) : undefined,
      ),
    )
    .orderBy(asc(timelineTemplates.createdAt))
    .limit(1);
  return row ?? null;
}

/** The given branch if it's an active branch of the clinic; the main branch when none is given. */
export async function resolveBranch(db: Database, clinicId: string, branchId?: string): Promise<string | null> {
  return branchId ? activeBranchId(db, clinicId, branchId) : mainBranchId(db, clinicId);
}

export type AddTreatmentInput = {
  clinicId: string;
  patientId: string;
  plannedSurgeryDate: string;
  /** Clinic procedure (timeline template); defaults to the clinic's oldest active one. */
  templateId?: string;
  /** Defaults to the main branch. */
  branchId?: string;
  staffId: string | null;
};

export type AddTreatmentResult =
  | { status: "created"; treatmentId: string }
  | { status: "invalid"; field: "plannedSurgeryDate" | "branch" }
  | { status: "unknown_patient" }
  | { status: "no_timeline" }
  | { status: "already_active" };

/** Opens another treatment for an existing patient (a returning patient, another procedure). */
export async function addTreatment(db: Database, input: AddTreatmentInput): Promise<AddTreatmentResult> {
  if (!isIsoDate(input.plannedSurgeryDate)) return { status: "invalid", field: "plannedSurgeryDate" };

  const [patient] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, input.patientId), eq(patients.clinicId, input.clinicId)))
    .limit(1);
  if (!patient) return { status: "unknown_patient" };

  const template = await findPublishedTemplate(db, input.clinicId, input.templateId);
  if (!template) return { status: "no_timeline" };
  const branchId = await resolveBranch(db, input.clinicId, input.branchId);
  if (!branchId) return { status: "invalid", field: "branch" };

  const [active] = await db
    .select({ id: treatments.id })
    .from(treatments)
    .where(
      and(
        eq(treatments.patientId, input.patientId),
        eq(treatments.templateId, template.templateId),
        inArray(treatments.status, [...activeStatuses]),
      ),
    )
    .limit(1);
  if (active) return { status: "already_active" };

  try {
    const treatmentId = await db.transaction(async (tx) => {
      const id = await insertTreatment(tx as unknown as Database, {
        clinicId: input.clinicId,
        patientId: input.patientId,
        branchId,
        plannedSurgeryDate: input.plannedSurgeryDate as IsoDate,
        ...template,
      });
      await tx.insert(auditLog).values({
        clinicId: input.clinicId,
        actorKind: input.staffId ? "staff" : "system",
        actorId: input.staffId,
        action: "treatment.create",
        patientId: input.patientId,
        metadata: { treatmentId: id },
      });
      return id;
    });
    return { status: "created", treatmentId };
  } catch (error) {
    // Two requests at once: the partial unique index lets only one through.
    if (isUniqueViolation(error)) return { status: "already_active" };
    throw error;
  }
}

/** Inserts the treatment row; callers validate and audit. */
export async function insertTreatment(
  db: Database,
  values: { clinicId: string; patientId: string; branchId: string; templateId: string; versionId: string; plannedSurgeryDate: IsoDate },
): Promise<string> {
  const [row] = await db.insert(treatments).values(values).returning({ id: treatments.id });
  return row.id;
}

type Transition = { clinicId: string; treatmentId: string; staffId: string | null; now?: Date };

/** Ends the follow-up of a performed treatment. Its photos and notes stay, read-only. */
export async function completeTreatment(db: Database, input: Transition): Promise<boolean> {
  return transition(db, input, ["performed"], { status: "completed", completedAt: input.now ?? new Date() }, "treatment.complete");
}

/** Cancels a treatment that hasn't been completed (a surgery that won't happen, or a stopped follow-up). */
export async function cancelTreatment(db: Database, input: Transition): Promise<boolean> {
  return transition(db, input, ["scheduled", "performed"], { status: "cancelled", cancelledAt: input.now ?? new Date() }, "treatment.cancel");
}

async function transition(
  db: Database,
  input: Transition,
  from: TreatmentStatus[],
  set: Partial<typeof treatments.$inferInsert>,
  action: string,
): Promise<boolean> {
  const updated = await db
    .update(treatments)
    .set(set)
    .where(and(eq(treatments.id, input.treatmentId), eq(treatments.clinicId, input.clinicId), inArray(treatments.status, from)))
    .returning({ patientId: treatments.patientId });
  if (updated.length === 0) return false;
  await db.insert(auditLog).values({
    clinicId: input.clinicId,
    actorKind: input.staffId ? "staff" : "system",
    actorId: input.staffId,
    action,
    patientId: updated[0].patientId,
    metadata: { treatmentId: input.treatmentId },
  });
  return true;
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
