import { and, desc, eq, exists, inArray, max, sql, type SQL } from "drizzle-orm";
import {
  auditLog,
  branches,
  clinics,
  consents,
  journalEntries,
  journalNotes,
  legalDocuments,
  patientAssignments,
  patients,
  photos,
  timelineTemplates,
  treatments,
} from "../../db/schema";
import type { Database } from "../../db/types";
import { canAccessPatient, patientScope, type PatientScope, type StaffActor } from "../authz/policy";
import type { ClinicSettings } from "../clinic-settings/schema";
import { decryptField, getKeyring, nationalIdIndex, phoneIndex, type Keyring } from "../crypto";
import { currentDocument } from "../legal/documents";
import { isActiveStatus, type TreatmentStatus } from "../treatments/lifecycle";
import { currentPosition, entryPosition, localDate, type IsoDate, type TreatmentTiming } from "../timeline/days";
import { normalizeIsraeliId } from "../validation/israeli-id";
import { normalizeIsraeliMobile } from "../validation/phone";

/**
 * The clinic dashboard's view of patients. Every query goes through the access policy:
 * lists are filtered by patientScope(), one patient is opened only if canAccessPatient() allows it.
 * Identifying fields are decrypted here, in memory, for the staff member's screen only.
 */

export type StaffContext = { actor: StaffActor; settings: ClinicSettings; keyring?: Keyring };

export type TreatmentLine = {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  status: TreatmentStatus;
  plannedSurgeryDate: IsoDate;
  actualSurgeryDate: IsoDate | null;
  /** Post-op day today, for performed treatments. */
  day: number | null;
};

export type PatientRow = {
  id: string;
  fullName: string;
  phoneTail: string;
  treatments: TreatmentLine[];
  lastCaptureAt: Date | null;
  /** Null when the clinic has no consent document. */
  consentSigned: boolean | null;
};

export type PatientFilter = {
  status?: "active" | "archive" | "all";
  branchId?: string;
  /** Name (substring), full ID number or full mobile number. */
  query?: string;
};

/** Patients with a treatment in one of these branches (staff limited to branches). */
function inBranches(branchIds: readonly string[] | undefined): SQL | undefined {
  if (!branchIds) return undefined;
  if (branchIds.length === 0) return sql`false`;
  return sql`exists (select 1 from ${treatments} where ${treatments.patientId} = ${patients.id} and ${inArray(treatments.branchId, [...branchIds])})`;
}

function scopeWhere(scope: PatientScope): SQL {
  switch (scope.kind) {
    case "none":
      return sql`false`;
    case "self":
      return and(eq(patients.clinicId, scope.clinicId), eq(patients.id, scope.patientId))!;
    case "clinic":
      return and(eq(patients.clinicId, scope.clinicId), inBranches(scope.branchIds))!;
    case "assigned":
      return and(
        eq(patients.clinicId, scope.clinicId),
        exists(
          sql`(select 1 from ${patientAssignments} where ${patientAssignments.patientId} = ${patients.id} and ${patientAssignments.staffId} = ${scope.staffId})`,
        ),
        inBranches(scope.branchIds),
      )!;
  }
}

function timingOf(t: { status: TreatmentStatus; planned: string; actual: string | null }): TreatmentTiming {
  return t.status !== "scheduled" && t.actual
    ? { status: "performed", actualSurgeryDate: t.actual as IsoDate }
    : { status: "scheduled", plannedSurgeryDate: t.planned as IsoDate };
}

async function loadTreatmentLines(db: Database, clinicId: string, patientIds: string[], timeZone: string, now: Date) {
  if (patientIds.length === 0) return new Map<string, TreatmentLine[]>();
  const rows = await db
    .select({
      id: treatments.id,
      patientId: treatments.patientId,
      name: timelineTemplates.name,
      branchId: treatments.branchId,
      branchName: branches.name,
      status: treatments.status,
      planned: treatments.plannedSurgeryDate,
      actual: treatments.actualSurgeryDate,
    })
    .from(treatments)
    .innerJoin(timelineTemplates, eq(timelineTemplates.id, treatments.templateId))
    .innerJoin(branches, eq(branches.id, treatments.branchId))
    .where(and(eq(treatments.clinicId, clinicId), inArray(treatments.patientId, patientIds)))
    .orderBy(desc(treatments.createdAt));

  const byPatient = new Map<string, TreatmentLine[]>();
  for (const row of rows) {
    const position = row.status === "performed" ? currentPosition(now, timingOf(row), timeZone) : null;
    const line: TreatmentLine = {
      id: row.id,
      name: row.name,
      branchId: row.branchId,
      branchName: row.branchName,
      status: row.status,
      plannedSurgeryDate: row.planned as IsoDate,
      actualSurgeryDate: row.actual as IsoDate | null,
      day: position?.phase === "post_op" ? position.day : null,
    };
    byPatient.set(row.patientId, [...(byPatient.get(row.patientId) ?? []), line]);
  }
  // Active treatments first, then the archive; newest first within each.
  for (const [id, lines] of byPatient) {
    byPatient.set(id, [...lines.filter((l) => isActiveStatus(l.status)), ...lines.filter((l) => !isActiveStatus(l.status))]);
  }
  return byPatient;
}

export async function listPatients(db: Database, context: StaffContext, filter: PatientFilter = {}, now = new Date()): Promise<PatientRow[]> {
  const { actor } = context;
  const keyring = context.keyring ?? getKeyring();
  const where: (SQL | undefined)[] = [scopeWhere(patientScope(actor, context.settings))];

  // An exact ID or mobile number is looked up through its blind index; anything else filters names.
  const query = filter.query?.trim() ?? "";
  let nameQuery = "";
  if (query) {
    const id = /^\d{5,9}$/.test(query) ? normalizeIsraeliId(query) : null;
    const phone = normalizeIsraeliMobile(query);
    if (phone) where.push(eq(patients.phoneIdx, phoneIndex(phone, actor.clinicId, keyring)));
    else if (id) where.push(eq(patients.nationalIdIdx, nationalIdIndex(id, actor.clinicId, keyring)));
    else nameQuery = query.replace(/\s+/g, " ").toLowerCase();
  }

  const status = filter.status ?? "active";
  if (status !== "all" || filter.branchId) {
    const statuses: TreatmentStatus[] =
      status === "active" ? ["scheduled", "performed"] : status === "archive" ? ["completed", "cancelled"] : ["scheduled", "performed", "completed", "cancelled"];
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(treatments)
          .where(
            and(
              eq(treatments.patientId, patients.id),
              inArray(treatments.status, statuses),
              filter.branchId ? eq(treatments.branchId, filter.branchId) : undefined,
            ),
          ),
      ),
    );
  }
  // The archive holds patients with nothing active.
  if (status === "archive") {
    where.push(
      sql`not exists (select 1 from ${treatments} where ${treatments.patientId} = ${patients.id} and ${treatments.status} in ('scheduled', 'performed'))`,
    );
  }

  const [clinic] = await db.select({ timeZone: clinics.timeZone }).from(clinics).where(eq(clinics.id, actor.clinicId));
  const rows = await db
    .select({ id: patients.id, fullNameEnc: patients.fullNameEnc, phoneEnc: patients.phoneEnc, createdAt: patients.createdAt })
    .from(patients)
    .where(and(...where))
    .orderBy(desc(patients.createdAt))
    .limit(500);

  const people = rows
    .map((row) => ({
      id: row.id,
      fullName: decryptField(row.fullNameEnc, { context: "patients.full_name", rowId: row.id }, keyring),
      phone: decryptField(row.phoneEnc, { context: "patients.phone", rowId: row.id }, keyring),
    }))
    .filter((p) => !nameQuery || p.fullName.toLowerCase().includes(nameQuery));
  const ids = people.map((p) => p.id);

  const [lines, captures, consent] = await Promise.all([
    loadTreatmentLines(db, actor.clinicId, ids, clinic?.timeZone ?? "Asia/Jerusalem", now),
    ids.length === 0
      ? Promise.resolve([])
      : db
          .select({ patientId: treatments.patientId, last: max(journalEntries.capturedAt) })
          .from(journalEntries)
          .innerJoin(treatments, eq(treatments.id, journalEntries.treatmentId))
          .where(and(eq(treatments.clinicId, actor.clinicId), inArray(treatments.patientId, ids)))
          .groupBy(treatments.patientId),
    signedCurrentConsent(db, actor.clinicId, ids),
  ]);
  const lastCapture = new Map(captures.map((c) => [c.patientId, c.last]));

  return people.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    phoneTail: p.phone.slice(-4),
    treatments: lines.get(p.id) ?? [],
    lastCaptureAt: lastCapture.get(p.id) ?? null,
    consentSigned: consent ? consent.has(p.id) : null,
  }));
}

/** Patients (of the given ones) who signed the clinic's current consent; null when there is none. */
async function signedCurrentConsent(db: Database, clinicId: string, patientIds: string[]): Promise<Set<string> | null> {
  const document = await currentDocument(db, clinicId, "consent");
  if (!document) return null;
  if (patientIds.length === 0) return new Set();
  const rows = await db
    .select({ patientId: consents.patientId })
    .from(consents)
    .where(and(eq(consents.clinicId, clinicId), eq(consents.documentId, document.id), inArray(consents.patientId, patientIds)));
  return new Set(rows.map((r) => r.patientId));
}

// ─── One patient ──────────────────────────────────────────────────────────────

export type CaptureDay = {
  key: string;
  label: string;
  date: IsoDate;
  photos: { angle: "front" | "top" | "back"; id: string }[];
};

export type TreatmentDetail = TreatmentLine & {
  days: CaptureDay[];
  notes: { date: IsoDate; text: string }[];
};

export type PatientCard = {
  id: string;
  fullName: string;
  phone: string;
  nationalIdTail: string;
  createdAt: Date;
  timeZone: string;
  treatments: TreatmentDetail[];
  consents: { documentId: string; kind: "consent" | "privacy_policy"; version: number; signedAt: Date }[];
};

export type OpenPatientResult = { status: "ok"; card: PatientCard } | { status: "not_found" };

/**
 * Opens one patient for a staff member: checks the policy (unknown and forbidden look the same),
 * decrypts the identity, loads every treatment with its photos and notes, and audits the view.
 */
export async function openPatient(
  db: Database,
  context: StaffContext,
  input: { patientId: string; ip: string | null; now?: Date },
): Promise<OpenPatientResult> {
  const { actor } = context;
  const keyring = context.keyring ?? getKeyring();
  if (!/^[0-9a-f-]{36}$/.test(input.patientId)) return { status: "not_found" };
  if (!(await staffMayAccess(db, context, input.patientId, "patient.view"))) return { status: "not_found" };

  const [person] = await db
    .select({
      id: patients.id,
      fullNameEnc: patients.fullNameEnc,
      phoneEnc: patients.phoneEnc,
      nationalIdEnc: patients.nationalIdEnc,
      createdAt: patients.createdAt,
      timeZone: clinics.timeZone,
    })
    .from(patients)
    .innerJoin(clinics, eq(clinics.id, patients.clinicId))
    .where(and(eq(patients.id, input.patientId), eq(patients.clinicId, actor.clinicId)))
    .limit(1);
  if (!person) return { status: "not_found" };

  const now = input.now ?? new Date();
  const lines = (await loadTreatmentLines(db, actor.clinicId, [person.id], person.timeZone, now)).get(person.id) ?? [];
  const treatmentIds = lines.map((l) => l.id);

  const [entryRows, noteRows, consentRows] = await Promise.all([
    treatmentIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            treatmentId: journalEntries.treatmentId,
            phase: journalEntries.phase,
            capturedAt: journalEntries.capturedAt,
            photoId: photos.id,
            angle: photos.angle,
          })
          .from(journalEntries)
          .innerJoin(photos, eq(photos.entryId, journalEntries.id))
          .where(inArray(journalEntries.treatmentId, treatmentIds))
          .orderBy(journalEntries.capturedAt),
    treatmentIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: journalNotes.id, treatmentId: journalNotes.treatmentId, date: journalNotes.noteDate, bodyEnc: journalNotes.bodyEnc })
          .from(journalNotes)
          .where(and(eq(journalNotes.clinicId, actor.clinicId), inArray(journalNotes.treatmentId, treatmentIds)))
          .orderBy(desc(journalNotes.noteDate)),
    db
      .select({ documentId: consents.documentId, kind: legalDocuments.kind, version: legalDocuments.version, signedAt: consents.signedAt })
      .from(consents)
      .innerJoin(legalDocuments, eq(legalDocuments.id, consents.documentId))
      .where(and(eq(consents.clinicId, actor.clinicId), eq(consents.patientId, person.id)))
      .orderBy(desc(consents.signedAt)),
  ]);

  const details: TreatmentDetail[] = lines.map((line) => {
    const timing = timingOf({ status: line.status, planned: line.plannedSurgeryDate, actual: line.actualSurgeryDate });
    const days = new Map<string, CaptureDay>();
    for (const row of entryRows.filter((r) => r.treatmentId === line.id)) {
      const at = entryPosition({ phase: row.phase, capturedAt: row.capturedAt }, timing, person.timeZone);
      const key = at.phase === "pre_op" ? "pre" : String(at.day);
      const label = at.phase === "pre_op" ? "לפני הניתוח" : at.day === 0 ? "יום הניתוח" : `יום ${at.day}`;
      const day = days.get(key) ?? { key, label, date: localDate(row.capturedAt, person.timeZone), photos: [] };
      day.photos = [...day.photos.filter((p) => p.angle !== row.angle), { angle: row.angle, id: row.photoId }];
      days.set(key, day);
    }
    return {
      ...line,
      days: [...days.values()],
      notes: noteRows
        .filter((n) => n.treatmentId === line.id)
        .map((n) => ({ date: n.date as IsoDate, text: decryptField(n.bodyEnc, { context: "journal_notes.body", rowId: n.id }, keyring) })),
    };
  });

  await db.insert(auditLog).values({
    clinicId: actor.clinicId,
    actorKind: "staff",
    actorId: actor.staffId,
    action: "patient.view",
    patientId: person.id,
    ip: input.ip,
  });

  const nationalId = decryptField(person.nationalIdEnc, { context: "patients.national_id", rowId: person.id }, keyring);
  return {
    status: "ok",
    card: {
      id: person.id,
      fullName: decryptField(person.fullNameEnc, { context: "patients.full_name", rowId: person.id }, keyring),
      phone: decryptField(person.phoneEnc, { context: "patients.phone", rowId: person.id }, keyring),
      nationalIdTail: nationalId.slice(-3),
      createdAt: person.createdAt,
      timeZone: person.timeZone,
      treatments: details,
      consents: consentRows,
    },
  };
}

type PatientCapability = Parameters<typeof canAccessPatient>[1];

/** Whether the staff member may act on this patient (same clinic, capability, visibility). */
export async function staffMayAccess(db: Database, context: StaffContext, patientId: string, capability: PatientCapability): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(patientId)) return false;
  const [row] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, context.actor.clinicId)))
    .limit(1);
  if (!row) return false;
  const [assigned, treated] = await Promise.all([
    db.select({ staffId: patientAssignments.staffId }).from(patientAssignments).where(eq(patientAssignments.patientId, patientId)),
    db.selectDistinct({ branchId: treatments.branchId }).from(treatments).where(eq(treatments.patientId, patientId)),
  ]);
  return canAccessPatient(
    context.actor,
    capability,
    {
      clinicId: context.actor.clinicId,
      patientId,
      assignedStaffIds: assigned.map((a) => a.staffId),
      branchIds: treated.map((t) => t.branchId),
    },
    context.settings,
  );
}

/** The patient a treatment belongs to, within the staff member's clinic. */
export async function patientOfTreatment(db: Database, clinicId: string, treatmentId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/.test(treatmentId)) return null;
  const [row] = await db
    .select({ patientId: treatments.patientId })
    .from(treatments)
    .where(and(eq(treatments.id, treatmentId), eq(treatments.clinicId, clinicId)))
    .limit(1);
  return row?.patientId ?? null;
}

/** Storage key of a photo the staff member may see (for the dashboard's photo route). */
export async function photoKeyForStaff(db: Database, context: StaffContext, photoId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/.test(photoId)) return null;
  const [row] = await db
    .select({ storageKey: photos.storageKey, patientId: treatments.patientId })
    .from(photos)
    .innerJoin(journalEntries, eq(journalEntries.id, photos.entryId))
    .innerJoin(treatments, eq(treatments.id, journalEntries.treatmentId))
    .where(and(eq(photos.id, photoId), eq(treatments.clinicId, context.actor.clinicId)))
    .limit(1);
  if (!row) return null;
  return (await staffMayAccess(db, context, row.patientId, "patient.view")) ? row.storageKey : null;
}

/** The existing patient with this ID number, for the "already a patient" path of the new-patient form. */
export async function findPatientByNationalId(db: Database, context: StaffContext, nationalId: string): Promise<string | null> {
  const id = normalizeIsraeliId(nationalId);
  if (!id) return null;
  const keyring = context.keyring ?? getKeyring();
  const [row] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.clinicId, context.actor.clinicId), eq(patients.nationalIdIdx, nationalIdIndex(id, context.actor.clinicId, keyring))))
    .limit(1);
  if (!row) return null;
  return (await staffMayAccess(db, context, row.id, "patient.view")) ? row.id : null;
}
