import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase, testKeyring } from "../../../test/db";
import { branches, journalNotes, photos, treatments } from "../../db/schema";
import type { Database } from "../../db/types";
import { buildAuth } from "../auth/build-auth";
import { createBranch, listBranches } from "../branches/branches";
import { adoptLibraryProcedure, listLibrary } from "../catalog/procedures";
import { provisionClinic } from "../clinic/provision";
import { saveDayNote } from "../journal/notes";
import { anglesOpenNow, loadPatientJournal, savePatientPhoto } from "../journal/patient-journal";
import { createPatient } from "../patients/create-patient";
import type { ObjectStorage } from "../storage/types";
import { addTreatment, cancelTreatment, completeTreatment } from "./lifecycle";
import { setActualSurgeryDate } from "./surgery-date";

/** Smallest structurally complete JPEG sanitizeJpeg accepts. */
function fakeJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x84, 0x04, 0xb0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd9,
  ]);
}

const storage: ObjectStorage = {
  put: async () => {},
  get: async () => null,
  delete: async () => {},
};

const keyring = testKeyring();
const TZ_NOON = (date: string) => new Date(`${date}T09:00:00Z`);
let db: Database;
let clinicId = "";
let otherClinicId = "";
let patientId = "";
let scalpTreatmentId = "";
let beardTemplateId = "";
let beardTreatmentId = "";

const journalOf = (treatmentId?: string) => loadPatientJournal(db, { clinicId, patientId, treatmentId, keyring }).then((j) => j!);

beforeAll(async () => {
  db = await testDatabase();
  const auth = buildAuth(db, { secret: "test-secret-test-secret-test-secret-0", baseURL: "http://localhost:3000", secureCookies: false, sendPasswordLink: async () => {} });
  clinicId = (await provisionClinic(db, auth, { clinicName: "מרפאה", slug: "life", adminEmail: "l@test.com", adminName: "א" })).clinicId;
  otherClinicId = (await provisionClinic(db, auth, { clinicName: "אחרת", slug: "other-life", adminEmail: "o@test.com", adminName: "ב" })).clinicId;
  const created = await createPatient(db, { clinicId, fullName: "דנה כהן", nationalId: "123456782", phone: "0501234567", plannedSurgeryDate: "2025-06-10" }, keyring);
  if (created.status !== "created") throw new Error(created.status);
  ({ patientId, treatmentId: scalpTreatmentId } = created);
}, 60_000);

describe("branches and catalog", () => {
  it("gives every clinic one main branch, used for new treatments by default", async () => {
    const list = await listBranches(db, clinicId);
    expect(list).toEqual([expect.objectContaining({ name: "סניף ראשי", isMain: true })]);
    const [row] = await db.select({ branchId: treatments.branchId }).from(treatments).where(eq(treatments.id, scalpTreatmentId));
    expect(row.branchId).toBe(list[0].id);
  });

  it("seeds the hair procedures and lets a clinic adopt one once", async () => {
    expect((await listLibrary(db)).map((p) => p.key)).toEqual(["hair.scalp", "hair.beard", "hair.mustache", "hair.eyebrows"]);
    expect(await adoptLibraryProcedure(db, { clinicId, libraryKey: "hair.scalp", staffId: null })).toMatchObject({ status: "exists" });
    expect(await adoptLibraryProcedure(db, { clinicId, libraryKey: "dental.implant", staffId: null })).toEqual({ status: "unknown" });
    const adopted = await adoptLibraryProcedure(db, { clinicId, libraryKey: "hair.beard", staffId: null });
    if (adopted.status !== "adopted") throw new Error(adopted.status);
    beardTemplateId = adopted.templateId;
    expect(await adoptLibraryProcedure(db, { clinicId, libraryKey: "hair.beard", staffId: null })).toEqual({ status: "exists", templateId: beardTemplateId });
  });

  it("refuses a branch of another clinic", async () => {
    const [foreign] = await db.select({ id: branches.id }).from(branches).where(eq(branches.clinicId, otherClinicId));
    expect(await addTreatment(db, { clinicId, patientId, templateId: beardTemplateId, branchId: foreign.id, plannedSurgeryDate: "2026-06-01", staffId: null })).toEqual({
      status: "invalid",
      field: "branch",
    });
  });
});

describe("a returning patient", () => {
  it("allows one active treatment per procedure", async () => {
    expect(await addTreatment(db, { clinicId, patientId, plannedSurgeryDate: "2026-01-01", staffId: null })).toEqual({ status: "already_active" });
  });

  it("archives the first treatment with its photos and notes intact", async () => {
    expect(await completeTreatment(db, { clinicId, treatmentId: scalpTreatmentId, staffId: null })).toBe(false); // not performed yet
    await setActualSurgeryDate(db, { clinicId, treatmentId: scalpTreatmentId, actualDate: "2025-06-10", staffId: null });

    const day = TZ_NOON("2025-06-10");
    const scalp = await journalOf();
    expect((await savePatientPhoto(db, storage, { journal: scalp, angle: "front", bytes: fakeJpeg(), ip: null, now: day })).status).toBe("saved");
    expect((await saveDayNote(db, { journal: scalp, date: "2025-06-10", text: "יום הניתוח", ip: null, keyring, now: day })).status).toBe("saved");

    expect(await completeTreatment(db, { clinicId, treatmentId: scalpTreatmentId, staffId: null })).toBe(true);
    expect(await setActualSurgeryDate(db, { clinicId, treatmentId: scalpTreatmentId, actualDate: "2025-06-11", staffId: null })).toBe(false);

    const archived = await journalOf();
    expect(archived).toMatchObject({ treatmentId: scalpTreatmentId, active: false });
    expect(archived.timing).toEqual({ status: "performed", actualSurgeryDate: "2025-06-10" });
    expect(archived.entries).toHaveLength(1);
    expect(archived.notes["2025-06-10"]?.text).toBe("יום הניתוח");
  });

  it("opens a new treatment of another procedure, in another branch, on the same account", async () => {
    const branch = await createBranch(db, { clinicId, name: "סניף תל אביב" });
    if (branch.status !== "created") throw new Error("branch");
    const added = await addTreatment(db, {
      clinicId,
      patientId,
      templateId: beardTemplateId,
      branchId: branch.branchId,
      plannedSurgeryDate: "2026-06-01",
      staffId: null,
    });
    if (added.status !== "created") throw new Error(added.status);
    beardTreatmentId = added.treatmentId;

    const current = await journalOf();
    expect(current).toMatchObject({ treatmentId: beardTreatmentId, active: true, entries: [] });
    expect(current.treatments).toEqual([
      { id: beardTreatmentId, name: "השתלת זקן", branchId: branch.branchId, branchName: "סניף תל אביב", status: "scheduled", anchorDate: "2026-06-01" },
      { id: scalpTreatmentId, name: "השתלת שיער", branchId: expect.any(String), branchName: "סניף ראשי", status: "completed", anchorDate: "2025-06-10" },
    ]);
  });

  it("keeps the archive read-only while the new treatment takes photos and notes", async () => {
    await setActualSurgeryDate(db, { clinicId, treatmentId: beardTreatmentId, actualDate: "2026-06-01", staffId: null });
    const day = TZ_NOON("2026-06-01");

    const scalp = await journalOf(scalpTreatmentId);
    expect(scalp.active).toBe(false);
    expect(anglesOpenNow(scalp, day)).toEqual([]);
    expect(await saveDayNote(db, { journal: scalp, date: "2025-06-11", text: "מאוחר", ip: null, keyring, now: day })).toEqual({ status: "archived" });

    const beard = await journalOf(beardTreatmentId);
    expect(anglesOpenNow(beard, day).length).toBeGreaterThan(0);
    expect((await savePatientPhoto(db, storage, { journal: beard, angle: "front", bytes: fakeJpeg(), ip: null, now: day })).status).toBe("saved");

    // A stale page of the beard treatment can't upload once it's cancelled (re-checked under the lock).
    expect(await cancelTreatment(db, { clinicId, treatmentId: beardTreatmentId, staffId: null })).toBe(true);
    expect((await savePatientPhoto(db, storage, { journal: beard, angle: "top", bytes: fakeJpeg(), ip: null, now: day })).status).toBe("not_allowed");

    const photoCount = await db.select({ id: photos.id }).from(photos);
    expect(photoCount).toHaveLength(2);
    const notes = await db.select({ id: journalNotes.id }).from(journalNotes).where(eq(journalNotes.treatmentId, scalpTreatmentId));
    expect(notes).toHaveLength(1);
  });

  it("only honours a selected treatment that belongs to the patient", async () => {
    const other = await createPatient(db, { clinicId, fullName: "רון לוי", nationalId: "000000018", phone: "0527654321", plannedSurgeryDate: "2026-12-10" }, keyring);
    if (other.status !== "created") throw new Error(other.status);
    const journal = await loadPatientJournal(db, { clinicId, patientId, treatmentId: other.treatmentId, keyring });
    expect(journal?.treatmentId).not.toBe(other.treatmentId);
    expect(journal?.treatments.map((t) => t.id)).not.toContain(other.treatmentId);
  });

  it("lets only one of two simultaneous requests open the same procedure", async () => {
    const results = await Promise.all([
      addTreatment(db, { clinicId, patientId, templateId: beardTemplateId, plannedSurgeryDate: "2027-01-01", staffId: null }),
      addTreatment(db, { clinicId, patientId, templateId: beardTemplateId, plannedSurgeryDate: "2027-01-02", staffId: null }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["already_active", "created"]);
  });
});
