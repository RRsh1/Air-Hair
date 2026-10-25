import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { auditLog, captureRules, clinics, journalEntries, patients, photos, timelineContent, treatments } from "../../db/schema";
import type { Database } from "../../db/types";
import { decryptField, type Keyring } from "../crypto";
import type { ObjectStorage } from "../storage/types";
import { anglesDue, type CaptureRule, type PhotoAngle } from "../timeline/capture-schedule";
import {
  currentPosition,
  entryPosition,
  localDate,
  phaseForNewEntry,
  type IsoDate,
  type Phase,
  type TreatmentTiming,
} from "../timeline/days";
import { inspectJpeg, MAX_DIMENSION, MAX_UPLOAD_BYTES } from "./jpeg";
import { parseContentBody, type ContentBody } from "./content-body";

/** Everything the patient app needs about one patient's current treatment. */
export type PatientJournal = {
  patientId: string;
  firstName: string;
  clinicId: string;
  timeZone: string;
  treatmentId: string;
  timing: TreatmentTiming;
  rules: CaptureRule[];
  entries: JournalEntryView[];
  content: ContentItem[];
};

export type JournalEntryView = {
  id: string;
  phase: Phase;
  capturedAt: Date;
  photos: Partial<Record<PhotoAngle, { id: string; width: number; height: number }>>;
};

export type ContentItem = {
  id: string;
  phase: Phase;
  fromDay: number | null;
  toDay: number | null;
  contentType: "tip" | "recommendation" | "instruction";
  title: string;
  body: ContentBody;
};

export async function loadPatientJournal(
  db: Database,
  input: { clinicId: string; patientId: string; keyring?: Keyring },
): Promise<PatientJournal | null> {
  const [row] = await db
    .select({
      patientId: patients.id,
      fullNameEnc: patients.fullNameEnc,
      timeZone: clinics.timeZone,
      treatmentId: treatments.id,
      status: treatments.status,
      planned: treatments.plannedSurgeryDate,
      actual: treatments.actualSurgeryDate,
      versionId: treatments.versionId,
    })
    .from(patients)
    .innerJoin(clinics, eq(clinics.id, patients.clinicId))
    .innerJoin(treatments, and(eq(treatments.patientId, patients.id), eq(treatments.clinicId, patients.clinicId)))
    .where(and(eq(patients.id, input.patientId), eq(patients.clinicId, input.clinicId)))
    .orderBy(desc(treatments.createdAt))
    .limit(1);
  if (!row) return null;

  const timing: TreatmentTiming =
    row.status === "performed" && row.actual
      ? { status: "performed", actualSurgeryDate: row.actual as IsoDate }
      : { status: "scheduled", plannedSurgeryDate: row.planned as IsoDate };

  const [ruleRows, contentRows, entryRows] = await Promise.all([
    db.select().from(captureRules).where(eq(captureRules.versionId, row.versionId)),
    db
      .select()
      .from(timelineContent)
      .where(eq(timelineContent.versionId, row.versionId))
      .orderBy(asc(timelineContent.sortOrder)),
    db
      .select({ id: journalEntries.id, phase: journalEntries.phase, capturedAt: journalEntries.capturedAt })
      .from(journalEntries)
      .where(eq(journalEntries.treatmentId, row.treatmentId))
      .orderBy(asc(journalEntries.capturedAt)),
  ]);

  const photoRows =
    entryRows.length === 0
      ? []
      : await db
          .select({ id: photos.id, entryId: photos.entryId, angle: photos.angle, width: photos.width, height: photos.height })
          .from(photos)
          .where(inArray(photos.entryId, entryRows.map((entry) => entry.id)));

  const entries: JournalEntryView[] = entryRows.map((entry) => ({ ...entry, photos: {} }));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const photo of photoRows) {
    byId.get(photo.entryId)!.photos[photo.angle] = { id: photo.id, width: photo.width, height: photo.height };
  }

  const fullName = decryptField(row.fullNameEnc, { context: "patients.full_name", rowId: row.patientId }, input.keyring);

  return {
    patientId: row.patientId,
    firstName: fullName.split(" ")[0],
    clinicId: input.clinicId,
    timeZone: row.timeZone,
    treatmentId: row.treatmentId,
    timing,
    rules: ruleRows.map(toCaptureRule),
    entries,
    content: contentRows.map((item) => ({
      id: item.id,
      phase: item.phase,
      fromDay: item.fromDay,
      toDay: item.toDay,
      contentType: item.contentType,
      title: item.title,
      body: parseContentBody(item.body),
    })),
  };
}

function toCaptureRule(row: typeof captureRules.$inferSelect): CaptureRule {
  return row.phase === "pre_op"
    ? { phase: "pre_op", maxCount: row.maxCount ?? 1, angles: row.angles }
    : { phase: "post_op", fromDay: row.fromDay ?? 0, toDay: row.toDay ?? 0, everyDays: row.everyDays ?? 1, angles: row.angles };
}

/** The entry the patient is filling today, if any: same phase and same local date. */
export function openEntryFor(journal: PatientJournal, now: Date): JournalEntryView | null {
  const phase = phaseForNewEntry(journal.timing);
  const today = localDate(now, journal.timeZone);
  return (
    [...journal.entries]
      .reverse()
      .find((entry) => entry.phase === phase && localDate(entry.capturedAt, journal.timeZone) === today) ?? null
  );
}

/** Angles the patient may photograph right now (due today, or a retake of today's photo). */
export function anglesOpenNow(journal: PatientJournal, now: Date): PhotoAngle[] {
  const open = openEntryFor(journal, now);
  const preOpDone = journal.entries.filter((entry) => entry.phase === "pre_op" && entry.id !== open?.id).length;
  const due = anglesDue(journal.rules, currentPosition(now, journal.timing, journal.timeZone), preOpDone);
  const retakes = open ? (Object.keys(open.photos) as PhotoAngle[]) : [];
  return [...new Set([...due, ...retakes])];
}

/** The most recent earlier photo of an angle, used as the alignment overlay. */
export function ghostPhotoFor(journal: PatientJournal, angle: PhotoAngle, now: Date): string | null {
  const open = openEntryFor(journal, now);
  for (const entry of [...journal.entries].reverse()) {
    if (entry.id === open?.id) continue;
    const photo = entry.photos[angle];
    if (photo) return photo.id;
  }
  return null;
}

export type SavePhotoResult =
  | { status: "saved"; photoId: string; entryId: string }
  | { status: "not_allowed" }
  | { status: "invalid_image"; reason: "format" | "size" | "dimensions" };

/** Stores a patient's photo for one angle of today's capture (a retake replaces the old file). */
export async function savePatientPhoto(
  db: Database,
  storage: ObjectStorage,
  input: { journal: PatientJournal; angle: PhotoAngle; bytes: Uint8Array; ip: string | null; now?: Date },
): Promise<SavePhotoResult> {
  const now = input.now ?? new Date();
  const { journal, angle, bytes } = input;

  if (!anglesOpenNow(journal, now).includes(angle)) return { status: "not_allowed" };
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) return { status: "invalid_image", reason: "size" };
  const size = inspectJpeg(bytes);
  if (!size) return { status: "invalid_image", reason: "format" };
  if (size.width > MAX_DIMENSION || size.height > MAX_DIMENSION) return { status: "invalid_image", reason: "dimensions" };

  const photoId = randomUUID();
  const storageKey = `clinics/${journal.clinicId}/patients/${journal.patientId}/photos/${photoId}.jpg`;
  await storage.put(storageKey, bytes, "image/jpeg");

  const open = openEntryFor(journal, now);
  let replacedKey: string | null = null;

  const entryId = await db.transaction(async (tx) => {
    const entryId =
      open?.id ??
      (
        await tx
          .insert(journalEntries)
          .values({ treatmentId: journal.treatmentId, phase: phaseForNewEntry(journal.timing), capturedAt: now })
          .returning({ id: journalEntries.id })
      )[0].id;

    const [previous] = await tx
      .delete(photos)
      .where(and(eq(photos.entryId, entryId), eq(photos.angle, angle)))
      .returning({ storageKey: photos.storageKey });
    replacedKey = previous?.storageKey ?? null;

    await tx.insert(photos).values({
      id: photoId,
      entryId,
      angle,
      storageKey,
      width: size.width,
      height: size.height,
      bytes: bytes.length,
    });
    await tx.insert(auditLog).values({
      clinicId: journal.clinicId,
      actorKind: "patient",
      actorId: journal.patientId,
      action: previous ? "photo.retake" : "photo.upload",
      patientId: journal.patientId,
      metadata: { angle },
      ip: input.ip,
    });
    return entryId;
  });

  if (replacedKey) await storage.delete(replacedKey);
  return { status: "saved", photoId, entryId };
}

/** Storage key of a photo, if it belongs to this patient. */
export async function photoKeyForPatient(
  db: Database,
  input: { clinicId: string; patientId: string; photoId: string },
): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/.test(input.photoId)) return null;
  const [row] = await db
    .select({ storageKey: photos.storageKey })
    .from(photos)
    .innerJoin(journalEntries, eq(journalEntries.id, photos.entryId))
    .innerJoin(treatments, eq(treatments.id, journalEntries.treatmentId))
    .where(and(eq(photos.id, input.photoId), eq(treatments.patientId, input.patientId), eq(treatments.clinicId, input.clinicId)))
    .limit(1);
  return row?.storageKey ?? null;
}

export { entryPosition };
