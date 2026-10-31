"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { Database } from "@/db/types";
import { canStaff } from "@/lib/authz/policy";
import { adoptLibraryProcedure } from "@/lib/catalog/procedures";
import { findPatientByNationalId, patientOfTreatment, staffMayAccess } from "@/lib/clinic-patients/patients";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { createPatient } from "@/lib/patients/create-patient";
import { addTreatment, cancelTreatment, completeTreatment } from "@/lib/treatments/lifecycle";
import { reschedulePlannedSurgery, setActualSurgeryDate } from "@/lib/treatments/surgery-date";

export type FormState = {
  status: "idle" | "error" | "duplicate" | "done";
  message?: string;
  field?: string;
  patientId?: string;
  values?: Record<string, string>;
};

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** "t:<templateId>" is one of the clinic's procedures; "l:<key>" a library procedure it adopts now. */
async function resolveProcedure(db: Database, clinicId: string, value: string, staffId: string): Promise<string | null> {
  if (value.startsWith("t:")) return value.slice(2) || null;
  if (value.startsWith("l:")) {
    const adopted = await adoptLibraryProcedure(db, { clinicId, libraryKey: value.slice(2), staffId });
    return adopted.status === "unknown" ? null : adopted.templateId;
  }
  return null;
}

const invalidMessages = {
  fullName: "שם מלא, בין 2 ל-120 תווים.",
  nationalId: "מספר תעודת הזהות לא תקין. בדקו את ספרת הביקורת.",
  phone: "מספר נייד ישראלי, למשל 050-1234567.",
  plannedSurgeryDate: "תאריך הניתוח חסר או לא תקין.",
  branch: "בחרו סניף.",
} as const;

export async function createPatientAction(_prev: FormState, form: FormData): Promise<FormState> {
  const context = await getStaffContext();
  const values = Object.fromEntries(["fullName", "nationalId", "phone", "procedure", "branchId", "plannedSurgeryDate"].map((k) => [k, text(form, k)]));
  if (!canStaff(context.actor, "patient.create", context.settings)) {
    return { status: "error", message: "אין לך הרשאה ליצור מטופלים.", values };
  }
  const db = getDb();
  const templateId = await resolveProcedure(db, context.actor.clinicId, values.procedure, context.actor.staffId);
  if (!templateId) return { status: "error", field: "procedure", message: "בחרו טיפול.", values };

  const result = await createPatient(db, {
    clinicId: context.actor.clinicId,
    fullName: values.fullName,
    nationalId: values.nationalId,
    phone: values.phone,
    plannedSurgeryDate: values.plannedSurgeryDate,
    templateId,
    branchId: values.branchId || undefined,
    createdByStaffId: context.actor.staffId,
  });
  switch (result.status) {
    case "created":
      redirect(`/clinic/patients/${result.patientId}`);
    case "invalid":
      return { status: "error", field: result.field, message: invalidMessages[result.field], values };
    case "no_timeline":
      return { status: "error", field: "procedure", message: "לטיפול הזה אין ציר זמן מפורסם.", values };
    case "duplicate": {
      const patientId = await findPatientByNationalId(db, context, values.nationalId);
      return { status: "duplicate", patientId: patientId ?? undefined, values };
    }
  }
}

export async function addTreatmentAction(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const context = await getStaffContext();
  const values = Object.fromEntries(["procedure", "branchId", "plannedSurgeryDate"].map((k) => [k, text(form, k)]));
  const db = getDb();
  if (!(await staffMayAccess(db, context, patientId, "patient.edit"))) return { status: "error", message: "אין לך הרשאה לעדכן את המטופל הזה.", values };

  const templateId = await resolveProcedure(db, context.actor.clinicId, values.procedure, context.actor.staffId);
  if (!templateId) return { status: "error", field: "procedure", message: "בחרו טיפול.", values };
  const result = await addTreatment(db, {
    clinicId: context.actor.clinicId,
    patientId,
    templateId,
    branchId: values.branchId || undefined,
    plannedSurgeryDate: values.plannedSurgeryDate,
    staffId: context.actor.staffId,
  });
  switch (result.status) {
    case "created":
      refresh();
      return { status: "done" };
    case "already_active":
      return { status: "error", field: "procedure", message: "למטופל כבר יש טיפול פעיל מהסוג הזה. אפשר לפתוח חדש אחרי שהקודם יסתיים.", values };
    case "invalid":
      return { status: "error", field: result.field, message: invalidMessages[result.field], values };
    case "no_timeline":
      return { status: "error", field: "procedure", message: "לטיפול הזה אין ציר זמן מפורסם.", values };
    case "unknown_patient":
      return { status: "error", message: "המטופל לא נמצא.", values };
  }
}

export type TreatmentStep = "perform" | "reschedule" | "complete" | "cancel";

/** Lifecycle steps on one treatment, from the patient card. */
export async function treatmentStepAction(treatmentId: string, step: TreatmentStep, _prev: FormState, form: FormData): Promise<FormState> {
  const context = await getStaffContext();
  const db = getDb();
  const clinicId = context.actor.clinicId;
  const patientId = await patientOfTreatment(db, clinicId, treatmentId);
  const capability = step === "reschedule" ? "patient.edit" : "treatment.mark_performed";
  if (!patientId || !(await staffMayAccess(db, context, patientId, capability))) {
    return { status: "error", message: "אין לך הרשאה לפעולה הזו." };
  }

  const date = text(form, "date");
  const staffId = context.actor.staffId;
  let ok = false;
  try {
    if (step === "perform") ok = await setActualSurgeryDate(db, { clinicId, treatmentId, actualDate: date, staffId });
    if (step === "reschedule") ok = await reschedulePlannedSurgery(db, { clinicId, treatmentId, plannedDate: date, staffId });
  } catch {
    return { status: "error", field: "date", message: "תאריך לא תקין." };
  }
  if (step === "complete") ok = await completeTreatment(db, { clinicId, treatmentId, staffId });
  if (step === "cancel") ok = await cancelTreatment(db, { clinicId, treatmentId, staffId });
  if (!ok) return { status: "error", message: "הפעולה לא מתאימה למצב הנוכחי של הטיפול." };
  refresh();
  return { status: "done" };
}
