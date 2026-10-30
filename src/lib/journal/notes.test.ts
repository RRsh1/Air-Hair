import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase, testKeyring } from "../../../test/db";
import { auditLog, journalNotes } from "../../db/schema";
import type { Database } from "../../db/types";
import { buildAuth } from "../auth/build-auth";
import { provisionClinic } from "../clinic/provision";
import { createPatient } from "../patients/create-patient";
import { MAX_NOTE_LENGTH, saveDayNote } from "./notes";
import { loadPatientJournal } from "./patient-journal";

const keyring = testKeyring();
const NOW = new Date("2026-10-30T09:00:00Z"); // 11:00 in Israel
let db: Database;
let clinicId = "";
let patientId = "";
let otherPatientId = "";

const journalOf = (id: string) => loadPatientJournal(db, { clinicId, patientId: id, keyring }).then((j) => j!);
const save = async (date: string, text: string, id = patientId) =>
  saveDayNote(db, { journal: await journalOf(id), date, text, ip: null, keyring, now: NOW });

beforeAll(async () => {
  db = await testDatabase();
  const auth = buildAuth(db, { secret: "test-secret-test-secret-test-secret-0", baseURL: "http://localhost:3000", secureCookies: false, sendPasswordLink: async () => {} });
  clinicId = (await provisionClinic(db, auth, { clinicName: "מרפאה", slug: "notes", adminEmail: "n@test.com", adminName: "א" })).clinicId;
  const a = await createPatient(db, { clinicId, fullName: "דנה כהן", nationalId: "123456782", phone: "0501234567", plannedSurgeryDate: "2026-10-20" }, keyring);
  const b = await createPatient(db, { clinicId, fullName: "רון לוי", nationalId: "000000018", phone: "0527654321", plannedSurgeryDate: "2026-10-20" }, keyring);
  if (a.status !== "created" || b.status !== "created") throw new Error("setup");
  patientId = a.patientId;
  otherPatientId = b.patientId;
}, 60_000);

describe("day notes", () => {
  it("saves, updates and loads a note with the journal, encrypted at rest", async () => {
    expect(await save("2026-10-29", "  קצת נפיחות במצח  ")).toEqual({ status: "saved", text: "קצת נפיחות במצח" });
    expect(await save("2026-10-29", "הנפיחות ירדה")).toMatchObject({ status: "saved" });

    const journal = await journalOf(patientId);
    expect(journal.notes["2026-10-29" as never]?.text).toBe("הנפיחות ירדה");

    const rows = await db.select().from(journalNotes);
    expect(rows).toHaveLength(1);
    expect(rows[0].bodyEnc).not.toContain("נפיחות");
  });

  it("deletes a note saved empty", async () => {
    await save("2026-10-28", "כאב ראש קל");
    expect(await save("2026-10-28", "   ")).toEqual({ status: "deleted" });
    expect((await journalOf(patientId)).notes["2026-10-28" as never]).toBeUndefined();
  });

  it("refuses future days, bad dates and long text", async () => {
    expect(await save("2026-10-31", "מחר")).toEqual({ status: "invalid", reason: "date" });
    expect(await save("2026-02-31x", "x")).toEqual({ status: "invalid", reason: "date" });
    expect(await save("2026-10-30", "א".repeat(MAX_NOTE_LENGTH + 1))).toEqual({ status: "invalid", reason: "too_long" });
    expect(await save("2026-10-30", "היום")).toMatchObject({ status: "saved" });
  });

  it("keeps each patient's notes to their own treatment", async () => {
    await save("2026-10-29", "של רון", otherPatientId);
    expect((await journalOf(patientId)).notes["2026-10-29" as never]?.text).toBe("הנפיחות ירדה");
    expect((await journalOf(otherPatientId)).notes["2026-10-29" as never]?.text).toBe("של רון");
  });

  it("keeps one note per day when two saves race", async () => {
    const journal = await journalOf(patientId);
    await Promise.all([
      saveDayNote(db, { journal, date: "2026-10-25", text: "ראשון", ip: null, keyring, now: NOW }),
      saveDayNote(db, { journal, date: "2026-10-25", text: "שני", ip: null, keyring, now: NOW }),
    ]);
    const rows = await db.select().from(journalNotes).where(eq(journalNotes.noteDate, "2026-10-25"));
    expect(rows).toHaveLength(1);
    expect(["ראשון", "שני"]).toContain((await journalOf(patientId)).notes["2026-10-25" as never]?.text);
  });

  it("audits saves without the note text", async () => {
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "journal_note.save"));
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("נפיחות");
  });
});
