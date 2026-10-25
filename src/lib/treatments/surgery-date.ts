import { and, eq } from "drizzle-orm";
import { auditLog, treatments } from "../../db/schema";
import type { Database } from "../../db/types";
import type { IsoDate } from "../timeline/days";

/**
 * Surgery date changes. While scheduled, the planned date can move freely (postponements).
 * Marking performed records the actual date, which becomes day 0. A later correction re-orders
 * post-op photos (day numbers are derived) and is written to the audit log.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(date: string): asserts date is IsoDate {
  if (!ISO.test(date) || Number.isNaN(Date.parse(date))) throw new Error(`Invalid date: ${date}`);
}

export async function reschedulePlannedSurgery(
  db: Database,
  input: { clinicId: string; treatmentId: string; plannedDate: string; staffId: string | null },
): Promise<boolean> {
  assertDate(input.plannedDate);
  const updated = await db
    .update(treatments)
    .set({ plannedSurgeryDate: input.plannedDate })
    .where(and(eq(treatments.id, input.treatmentId), eq(treatments.clinicId, input.clinicId), eq(treatments.status, "scheduled")))
    .returning({ patientId: treatments.patientId });
  if (updated.length === 0) return false;
  await db.insert(auditLog).values({
    clinicId: input.clinicId,
    actorKind: input.staffId ? "staff" : "system",
    actorId: input.staffId,
    action: "treatment.reschedule",
    patientId: updated[0].patientId,
    metadata: { plannedDate: input.plannedDate },
  });
  return true;
}

/** Marks the surgery performed, or corrects the actual date of a performed surgery. */
export async function setActualSurgeryDate(
  db: Database,
  input: { clinicId: string; treatmentId: string; actualDate: string; staffId: string | null; now?: Date },
): Promise<boolean> {
  assertDate(input.actualDate);
  const updated = await db
    .update(treatments)
    .set({
      status: "performed",
      actualSurgeryDate: input.actualDate,
      performedMarkedAt: input.now ?? new Date(),
      performedMarkedBy: input.staffId,
    })
    .where(and(eq(treatments.id, input.treatmentId), eq(treatments.clinicId, input.clinicId)))
    .returning({ patientId: treatments.patientId });
  if (updated.length === 0) return false;
  await db.insert(auditLog).values({
    clinicId: input.clinicId,
    actorKind: input.staffId ? "staff" : "system",
    actorId: input.staffId,
    action: "treatment.performed",
    patientId: updated[0].patientId,
    metadata: { actualDate: input.actualDate },
  });
  return true;
}
