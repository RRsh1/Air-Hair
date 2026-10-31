import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase, testKeyring } from "../../../test/db";
import { auditLog, photos, staffUsers } from "../../db/schema";
import type { Database } from "../../db/types";
import { buildAuth } from "../auth/build-auth";
import type { StaffActor } from "../authz/policy";
import { createBranch } from "../branches/branches";
import { adoptLibraryProcedure } from "../catalog/procedures";
import { parseClinicSettings } from "../clinic-settings/schema";
import { provisionClinic } from "../clinic/provision";
import { loadPatientJournal, savePatientPhoto } from "../journal/patient-journal";
import { createPatient } from "../patients/create-patient";
import { addTreatment, completeTreatment } from "../treatments/lifecycle";
import { setActualSurgeryDate } from "../treatments/surgery-date";
import { findPatientByNationalId, listPatients, openPatient, photoKeyForStaff, type StaffContext } from "./patients";

const keyring = testKeyring();
const NOW = new Date("2026-06-15T09:00:00Z");
const fakeJpeg = () =>
  new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x84, 0x04, 0xb0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd9,
  ]);

let db: Database;
let admin: StaffContext;
let doctor: StaffContext;
let otherAdmin: StaffContext;
let dana = "";
let ron = "";
let photoId = "";

beforeAll(async () => {
  db = await testDatabase();
  const auth = buildAuth(db, { secret: "test-secret-test-secret-test-secret-0", baseURL: "http://localhost:3000", secureCookies: false, sendPasswordLink: async () => {} });
  const clinic = await provisionClinic(db, auth, { clinicName: "מרפאה", slug: "staff-view", adminEmail: "a@test.com", adminName: "א" });
  const other = await provisionClinic(db, auth, { clinicName: "אחרת", slug: "staff-other", adminEmail: "b@test.com", adminName: "ב" });
  const settings = parseClinicSettings({});
  const actor = (clinicId: string, staffId: string, role: "admin" | "doctor"): StaffActor => ({ kind: "staff", clinicId, staffId, role });
  admin = { actor: actor(clinic.clinicId, clinic.staffId, "admin"), settings, keyring };
  otherAdmin = { actor: actor(other.clinicId, other.staffId, "admin"), settings, keyring };
  const [doc] = await db
    .insert(staffUsers)
    .values({ clinicId: clinic.clinicId, role: "doctor", email: "d@test.com", fullName: "ד" })
    .returning({ id: staffUsers.id });
  // Doctors see only assigned patients in this mode.
  doctor = { actor: actor(clinic.clinicId, doc.id, "doctor"), settings: parseClinicSettings({ patientVisibility: "assigned_only" }), keyring };

  const a = await createPatient(db, { clinicId: clinic.clinicId, fullName: "דנה כהן", nationalId: "123456782", phone: "0501234567", plannedSurgeryDate: "2026-06-10" }, keyring);
  const b = await createPatient(db, { clinicId: clinic.clinicId, fullName: "רון לוי", nationalId: "000000018", phone: "0527654321", plannedSurgeryDate: "2026-07-01", assignedStaffIds: [doc.id] }, keyring);
  if (a.status !== "created" || b.status !== "created") throw new Error("patients");
  dana = a.patientId;
  ron = b.patientId;

  await setActualSurgeryDate(db, { clinicId: clinic.clinicId, treatmentId: a.treatmentId, actualDate: "2026-06-10", staffId: null });
  const journal = await loadPatientJournal(db, { clinicId: clinic.clinicId, patientId: dana, keyring });
  const saved = await savePatientPhoto(db, { put: async () => {}, get: async () => null, delete: async () => {} }, {
    journal: journal!,
    angle: "front",
    bytes: fakeJpeg(),
    ip: null,
    now: new Date("2026-06-10T09:00:00Z"),
  });
  if (saved.status !== "saved") throw new Error(saved.status);
  photoId = saved.photoId;

  // Dana completes the scalp and comes back for a beard in a second branch.
  await completeTreatment(db, { clinicId: clinic.clinicId, treatmentId: a.treatmentId, staffId: null });
  const beard = await adoptLibraryProcedure(db, { clinicId: clinic.clinicId, libraryKey: "hair.beard", staffId: null });
  const north = await createBranch(db, { clinicId: clinic.clinicId, name: "סניף צפון" });
  if (beard.status === "unknown" || north.status !== "created") throw new Error("setup");
  await addTreatment(db, { clinicId: clinic.clinicId, patientId: dana, templateId: beard.templateId, branchId: north.branchId, plannedSurgeryDate: "2026-09-01", staffId: null });
}, 60_000);

describe("patient list", () => {
  it("lists the clinic's patients with every treatment, active ones first", async () => {
    const rows = await listPatients(db, admin, { status: "all" }, NOW);
    expect(rows.map((r) => r.fullName).sort()).toEqual(["דנה כהן", "רון לוי"]);
    const danaRow = rows.find((r) => r.id === dana)!;
    expect(danaRow.phoneTail).toBe("4567");
    expect(danaRow.treatments.map((t) => [t.name, t.status, t.branchName])).toEqual([
      ["השתלת זקן", "scheduled", "סניף צפון"],
      ["השתלת שיער", "completed", "סניף ראשי"],
    ]);
    expect(danaRow.lastCaptureAt).not.toBeNull();
    expect(danaRow.consentSigned).toBeNull(); // no consent document published
  });

  it("finds by name, full ID number or mobile", async () => {
    expect((await listPatients(db, admin, { status: "all", query: "כהן" }, NOW)).map((r) => r.id)).toEqual([dana]);
    expect((await listPatients(db, admin, { status: "all", query: "000000018" }, NOW)).map((r) => r.id)).toEqual([ron]);
    expect((await listPatients(db, admin, { status: "all", query: "052-765-4321" }, NOW)).map((r) => r.id)).toEqual([ron]);
    expect(await listPatients(db, admin, { status: "all", query: "0500000000" }, NOW)).toEqual([]);
  });

  it("filters by branch and keeps patients with nothing active in the archive only", async () => {
    const rows = await listPatients(db, admin, { status: "active" }, NOW);
    expect(rows.map((r) => r.id).sort()).toEqual([dana, ron].sort());
    const north = rows.find((r) => r.id === dana)!.treatments[0].branchId;
    expect((await listPatients(db, admin, { status: "active", branchId: north }, NOW)).map((r) => r.id)).toEqual([dana]);
    expect(await listPatients(db, admin, { status: "archive" }, NOW)).toEqual([]);
  });

  it("follows the access policy: assigned-only doctors and other clinics see nothing more", async () => {
    expect((await listPatients(db, doctor, { status: "all" }, NOW)).map((r) => r.id)).toEqual([ron]);
    expect(await listPatients(db, otherAdmin, { status: "all" }, NOW)).toEqual([]);
  });
});

describe("patient card", () => {
  it("opens a patient with photos by day and audits the view", async () => {
    const result = await openPatient(db, admin, { patientId: dana, ip: null, now: NOW });
    if (result.status !== "ok") throw new Error("not found");
    expect(result.card).toMatchObject({ fullName: "דנה כהן", phone: "+972501234567", nationalIdTail: "782" });
    const scalp = result.card.treatments.find((t) => t.name === "השתלת שיער")!;
    expect(scalp.days).toEqual([expect.objectContaining({ key: "0", label: "יום הניתוח", photos: [{ angle: "front", id: photoId }] })]);
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.action, "patient.view"), eq(auditLog.patientId, dana)));
    expect(audits).toHaveLength(1);
  });

  it("treats other clinics and unassigned patients as not found", async () => {
    expect(await openPatient(db, otherAdmin, { patientId: dana, ip: null })).toEqual({ status: "not_found" });
    expect(await openPatient(db, doctor, { patientId: dana, ip: null })).toEqual({ status: "not_found" });
    expect(await openPatient(db, admin, { patientId: "nope", ip: null })).toEqual({ status: "not_found" });
  });

  it("serves photos only to staff who may see the patient", async () => {
    const [row] = await db.select({ key: photos.storageKey }).from(photos).where(eq(photos.id, photoId));
    expect(await photoKeyForStaff(db, admin, photoId)).toBe(row.key);
    expect(await photoKeyForStaff(db, doctor, photoId)).toBeNull();
    expect(await photoKeyForStaff(db, otherAdmin, photoId)).toBeNull();
  });

  it("finds an existing patient by ID number for the returning-patient path", async () => {
    expect(await findPatientByNationalId(db, admin, "123456782")).toBe(dana);
    expect(await findPatientByNationalId(db, otherAdmin, "123456782")).toBeNull();
  });
});
