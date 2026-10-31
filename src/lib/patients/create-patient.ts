import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auditLog, patientAssignments, patients } from "../../db/schema";
import type { Database } from "../../db/types";
import { encryptField, getKeyring, nationalIdIndex, phoneIndex, type Keyring } from "../crypto";
import { findPublishedTemplate, insertTreatment, isIsoDate, resolveBranch } from "../treatments/lifecycle";
import { normalizeIsraeliId } from "../validation/israeli-id";
import { normalizeIsraeliMobile } from "../validation/phone";

/**
 * Creates a patient with an encrypted identity and a first scheduled treatment that follows the
 * clinic's current published timeline. Used by the clinic dashboard and by dev scripts.
 * A patient who comes back for another procedure keeps this account: see addTreatment.
 */

export type CreatePatientInput = {
  clinicId: string;
  fullName: string;
  nationalId: string;
  phone: string;
  plannedSurgeryDate: string;
  createdByStaffId?: string | null;
  assignedStaffIds?: string[];
  /** Defaults to the clinic's oldest active template. */
  templateId?: string;
  /** Branch of the first treatment; defaults to the main branch. */
  branchId?: string;
};

export type CreatePatientResult =
  | { status: "created"; patientId: string; treatmentId: string }
  | { status: "invalid"; field: "fullName" | "nationalId" | "phone" | "plannedSurgeryDate" | "branch" }
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
  const plannedSurgeryDate = input.plannedSurgeryDate;
  if (!isIsoDate(plannedSurgeryDate)) return { status: "invalid", field: "plannedSurgeryDate" };

  const template = await findPublishedTemplate(db, input.clinicId, input.templateId);
  if (!template) return { status: "no_timeline" };
  const branchId = await resolveBranch(db, input.clinicId, input.branchId);
  if (!branchId) return { status: "invalid", field: "branch" };

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

    const treatmentId = await insertTreatment(tx as unknown as Database, {
      clinicId: input.clinicId,
      patientId,
      branchId,
      plannedSurgeryDate,
      ...template,
    });

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

    return { status: "created" as const, patientId, treatmentId };
  });
}
