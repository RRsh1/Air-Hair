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
import { MAX_DIMENSION, MAX_UPLOAD_BYTES, sanitizeJpeg } from "./jpeg";
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

  const timing = toTiming(row);

  const [ruleRows, contentRows, entries] = await Promise.all([
    db.select().from(captureRules).where(eq(captureRules.versionId, row.versionId)),
    db
      .select()
      .from(timelineContent)
      .where(eq(timelineContent.versionId, row.versionId))
      .orderBy(asc(timelineContent.sortOrder)),
    loadEntries(db, row.treatmentId),
  ]);

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

function toTiming(row: { status: "scheduled" | "performed"; planned: string; actual: string | null }): TreatmentTiming {
  return row.status === "performed" && row.actual
    ? { status: "performed", actualSurgeryDate: row.actual as IsoDate }
    : { status: "scheduled", plannedSurgeryDate: row.planned as IsoDate };
}

async function loadEntries(db: Database, treatmentId: string): Promise<JournalEntryView[]> {
  const entryRows = await db
    .select({ id: journalEntries.id, phase: journalEntries.phase, capturedAt: journalEntries.capturedAt })
    .from(journalEntries)
    .where(eq(journalEntries.treatmentId, treatmentId))
    .orderBy(asc(journalEntries.capturedAt));
  if (entryRows.length === 0) return [];

  const photoRows = await db
    .select({ id: photos.id, entryId: photos.entryId, angle: photos.angle, width: photos.width, height: photos.height })
    .from(photos)
    .where(inArray(photos.entryId, entryRows.map((entry) => entry.id)));

  const entries: JournalEntryView[] = entryRows.map((entry) => ({ ...entry, photos: {} }));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const photo of photoRows) {
    byId.get(photo.entryId)!.photos[photo.angle] = { id: photo.id, width: photo.width, height: photo.height };
  }
  return entries;
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

/**
 * Stores a patient's photo for one angle of today's capture (a retake replaces the old file).
 *
 * Concurrency: the treatment row is locked for the write, and the open entry and allowed angles
 * are re-read under that lock, so parallel uploads (three angles at once, a double tap) share one
 * entry and can't exceed the schedule. The cleaned file is written first; if the database write
 * doesn't happen, the file is deleted again.
 */
export async function savePatientPhoto(
  db: Database,
  storage: ObjectStorage,
  input: { journal: PatientJournal; angle: PhotoAngle; bytes: Uint8Array; ip: string | null; now?: Date },
): Promise<SavePhotoResult> {
  const now = input.now ?? new Date();
  const { journal, angle } = input;

  if (!anglesOpenNow(journal, now).includes(angle)) return { status: "not_allowed" };
  if (input.bytes.length === 0 || input.bytes.length > MAX_UPLOAD_BYTES) return { status: "invalid_image", reason: "size" };
  const image = sanitizeJpeg(input.bytes);
  if (!image) return { status: "invalid_image", reason: "format" };
  if (image.width > MAX_DIMENSION || image.height > MAX_DIMENSION) return { status: "invalid_image", reason: "dimensions" };

  const photoId = randomUUID();
  const storageKey = `clinics/${journal.clinicId}/patients/${journal.patientId}/photos/${photoId}.jpg`;
  await storage.put(storageKey, image.bytes, "image/jpeg");

  let outcome: { entryId: string; replacedKey: string | null } | null;
  try {
    outcome = await db.transaction(async (tx) => {
      const [treatment] = await tx
        .select({ status: treatments.status, planned: treatments.plannedSurgeryDate, actual: treatments.actualSurgeryDate })
        .from(treatments)
        .where(and(eq(treatments.id, journal.treatmentId), eq(treatments.clinicId, journal.clinicId)))
        .for("update");
      if (!treatment) return null;

      const fresh: PatientJournal = {
        ...journal,
        timing: toTiming(treatment),
        entries: await loadEntries(tx as unknown as Database, journal.treatmentId),
      };
      if (!anglesOpenNow(fresh, now).includes(angle)) return null;

      const open = openEntryFor(fresh, now);
      const entryId =
        open?.id ??
        (
          await tx
            .insert(journalEntries)
            .values({ treatmentId: journal.treatmentId, phase: phaseForNewEntry(fresh.timing), capturedAt: now })
            .returning({ id: journalEntries.id })
        )[0].id;

      const [previous] = await tx
        .delete(photos)
        .where(and(eq(photos.entryId, entryId), eq(photos.angle, angle)))
        .returning({ storageKey: photos.storageKey });

      await tx.insert(photos).values({
        id: photoId,
        entryId,
        angle,
        storageKey,
        width: image.width,
        height: image.height,
        bytes: image.bytes.length,
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
      return { entryId, replacedKey: previous?.storageKey ?? null };
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => {});
    throw error;
  }

  if (!outcome) {
    await storage.delete(storageKey);
    return { status: "not_allowed" };
  }
  if (outcome.replacedKey) await storage.delete(outcome.replacedKey);
  return { status: "saved", photoId, entryId: outcome.entryId };
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
