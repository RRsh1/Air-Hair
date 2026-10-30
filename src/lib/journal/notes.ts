import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { auditLog, journalNotes } from "../../db/schema";
import type { Database } from "../../db/types";
import { decryptField, encryptField, type Keyring } from "../crypto";
import { localDate, type IsoDate } from "../timeline/days";
import type { PatientJournal } from "./patient-journal";

/**
 * The patient's notes, one per day of the recovery. Notes can be written for today and for any
 * earlier day of the treatment, never for the future. The text is encrypted like other patient
 * data; saving an empty note deletes it.
 */

export const MAX_NOTE_LENGTH = 2000;

export type DayNote = { text: string; updatedAt: Date };

export async function loadDayNotes(
  db: Database,
  input: { clinicId: string; treatmentId: string; keyring?: Keyring },
): Promise<Record<IsoDate, DayNote>> {
  const rows = await db
    .select({ id: journalNotes.id, date: journalNotes.noteDate, body: journalNotes.bodyEnc, updatedAt: journalNotes.updatedAt })
    .from(journalNotes)
    .where(and(eq(journalNotes.clinicId, input.clinicId), eq(journalNotes.treatmentId, input.treatmentId)));
  const notes: Record<IsoDate, DayNote> = {};
  for (const row of rows) {
    notes[row.date as IsoDate] = {
      text: decryptField(row.body, { context: "journal_notes.body", rowId: row.id }, input.keyring),
      updatedAt: row.updatedAt,
    };
  }
  return notes;
}

export type SaveNoteResult =
  | { status: "saved"; text: string }
  | { status: "deleted" }
  | { status: "invalid"; reason: "date" | "too_long" };

export async function saveDayNote(
  db: Database,
  input: { journal: PatientJournal; date: string; text: string; ip: string | null; keyring?: Keyring; now?: Date },
): Promise<SaveNoteResult> {
  const now = input.now ?? new Date();
  const { journal } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(`${input.date}T00:00:00Z`))) {
    return { status: "invalid", reason: "date" };
  }
  const date = input.date as IsoDate;
  if (date > localDate(now, journal.timeZone)) return { status: "invalid", reason: "date" };

  const text = input.text.replace(/\r\n?/g, "\n").trim();
  if (text.length > MAX_NOTE_LENGTH) return { status: "invalid", reason: "too_long" };

  const where = and(
    eq(journalNotes.clinicId, journal.clinicId),
    eq(journalNotes.treatmentId, journal.treatmentId),
    eq(journalNotes.noteDate, date),
  );

  if (!text) {
    await db.transaction(async (tx) => {
      const removed = await tx.delete(journalNotes).where(where).returning({ id: journalNotes.id });
      if (removed.length > 0) await audit(tx, journal, "journal_note.delete", input.ip);
    });
    return { status: "deleted" };
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: journalNotes.id }).from(journalNotes).where(where).limit(1).for("update");
    if (existing) {
      await tx
        .update(journalNotes)
        .set({ bodyEnc: encryptField(text, { context: "journal_notes.body", rowId: existing.id }, input.keyring), updatedAt: now })
        .where(eq(journalNotes.id, existing.id));
    } else {
      const id = randomUUID();
      await tx
        .insert(journalNotes)
        .values({
          id,
          clinicId: journal.clinicId,
          patientId: journal.patientId,
          treatmentId: journal.treatmentId,
          noteDate: date,
          bodyEnc: encryptField(text, { context: "journal_notes.body", rowId: id }, input.keyring),
          createdAt: now,
          updatedAt: now,
        })
        // Two saves racing on a new note: the second becomes an update of the first.
        .onConflictDoUpdate({
          target: [journalNotes.treatmentId, journalNotes.noteDate],
          set: { updatedAt: sql`excluded.updated_at` },
        });
      const [row] = await tx.select({ id: journalNotes.id }).from(journalNotes).where(where).limit(1);
      if (row.id !== id) {
        await tx
          .update(journalNotes)
          .set({ bodyEnc: encryptField(text, { context: "journal_notes.body", rowId: row.id }, input.keyring) })
          .where(eq(journalNotes.id, row.id));
      }
    }
    await audit(tx, journal, "journal_note.save", input.ip);
  });
  return { status: "saved", text };
}

function audit(db: Pick<Database, "insert">, journal: PatientJournal, action: string, ip: string | null) {
  return db.insert(auditLog).values({
    clinicId: journal.clinicId,
    actorKind: "patient",
    actorId: journal.patientId,
    action,
    patientId: journal.patientId,
    ip,
  });
}
