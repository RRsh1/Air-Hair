import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { auditLog, patientAssignments, patients, timelineTemplates, timelineVersions, treatments } from "../../db/schema";
import type { Database } from "../../db/types";
import { encryptField, getKeyring, nationalIdIndex, phoneIndex, type Keyring } from "../crypto";
import type { IsoDate } from "../timeline/days";
import { normalizeIsraeliId } from "../validation/israeli-id";
import { normalizeIsraeliMobile } from "../validation/phone";

/**
 * Creates a patient with an encrypted identity and a scheduled treatment that follows the
 * clinic's current published timeline. Used by the clinic dashboard and by dev scripts.
 */

export type CreatePatientInput = {
  clinicId: string;
  fullName: string;
  nationalId: string;
  phone: string;
  plannedSurgeryDate: IsoDate;
  createdByStaffId?: string | null;
  assignedStaffIds?: string[];
  /** Defaults to the clinic's oldest active template. */
  templateId?: string;
};

export type CreatePatientResult =
  | { status: "created"; patientId: string; treatmentId: string }
  | { status: "invalid"; field: "fullName" | "nationalId" | "phone" | "plannedSurgeryDate" }
  | { status: "duplicate" }
  | { status: "no_timeline" };

export async function createPatient(
  db: Database,
  input: CreatePatientInput,
  keyring: Keyring = getKeyring(),
): Promise<CreatePatientResult> {
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (fullName.length < 2 || fullName.length > 120) return { status: "invalid", field: "fullName" };
  const nationalId = normalizeIsraeliId(input.nationalId);
  if (!nationalId) return { status: "invalid", field: "nationalId" };
  const phone = normalizeIsraeliMobile(input.phone);
  if (!phone) return { status: "invalid", field: "phone" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.plannedSurgeryDate) || Number.isNaN(Date.parse(input.plannedSurgeryDate))) {
    return { status: "invalid", field: "plannedSurgeryDate" };
  }

  const template = await findTemplate(db, input.clinicId, input.templateId);
  if (!template) return { status: "no_timeline" };

  const nationalIdIdx = nationalIdIndex(nationalId, input.clinicId, keyring);
  const [existing] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.clinicId, input.clinicId), eq(patients.nationalIdIdx, nationalIdIdx)))
    .limit(1);
  if (existing) return { status: "duplicate" };

  // The id is generated here because each ciphertext is bound to its row.
  const patientId = randomUUID();
  const bind = (context: "patients.full_name" | "patients.national_id" | "patients.phone") => ({ context, rowId: patientId });

  return db.transaction(async (tx) => {
    await tx.insert(patients).values({
      id: patientId,
      clinicId: input.clinicId,
      fullNameEnc: encryptField(fullName, bind("patients.full_name"), keyring),
      nationalIdEnc: encryptField(nationalId, bind("patients.national_id"), keyring),
      nationalIdIdx,
      phoneEnc: encryptField(phone, bind("patients.phone"), keyring),
      phoneIdx: phoneIndex(phone, input.clinicId, keyring),
      keyVersion: keyring.currentVersion,
      createdBy: input.createdByStaffId ?? null,
    });

    const [treatment] = await tx
      .insert(treatments)
      .values({
        clinicId: input.clinicId,
        patientId,
        plannedSurgeryDate: input.plannedSurgeryDate,
        templateId: template.templateId,
        versionId: template.versionId,
      })
      .returning({ id: treatments.id });

    const assigned = [...new Set(input.assignedStaffIds ?? [])];
    if (assigned.length > 0) {
      await tx.insert(patientAssignments).values(assigned.map((staffId) => ({ clinicId: input.clinicId, patientId, staffId })));
    }

    await tx.insert(auditLog).values({
      clinicId: input.clinicId,
      actorKind: input.createdByStaffId ? "staff" : "system",
      actorId: input.createdByStaffId ?? null,
      action: "patient.create",
      patientId,
    });

    return { status: "created" as const, patientId, treatmentId: treatment.id };
  });
}

async function findTemplate(db: Database, clinicId: string, templateId?: string) {
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
