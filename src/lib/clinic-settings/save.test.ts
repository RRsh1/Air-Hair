import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase, testKeyring } from "../../../test/db";
import { auditLog, clinics } from "../../db/schema";
import type { Database } from "../../db/types";
import { buildAuth } from "../auth/build-auth";
import { archiveBranch, createBranch, listBranchesWithCounts, renameBranch } from "../branches/branches";
import { provisionClinic } from "../clinic/provision";
import { consentCoverage, listDocuments, publishLegalDocument, recordConsent } from "../legal/documents";
import { createPatient } from "../patients/create-patient";
import { completeTreatment } from "../treatments/lifecycle";
import { setActualSurgeryDate } from "../treatments/surgery-date";
import { saveClinicProfile } from "./save";
import { parseClinicSettings } from "./schema";
import { clinicSettings } from "../../db/schema";
import { deflateSync, crc32 } from "node:zlib";

const keyring = testKeyring();
const storage = { put: async () => {}, get: async () => null, delete: async () => {} };
let db: Database;
let clinicId = "";
let mainBranch = "";

/** A small valid PNG, as a drawn signature. */
function signaturePng(): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(300, 0);
  header.writeUInt32BE(120, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.alloc((300 * 4 + 1) * 120))), chunk("IEND", Buffer.alloc(0))]),
  );
}

beforeAll(async () => {
  db = await testDatabase();
  const auth = buildAuth(db, { secret: "test-secret-test-secret-test-secret-0", baseURL: "http://localhost:3000", secureCookies: false, sendPasswordLink: async () => {} });
  const clinic = await provisionClinic(db, auth, { clinicName: "מרפאה", slug: "settings", adminEmail: "s@test.com", adminName: "א" });
  clinicId = clinic.clinicId;
  mainBranch = clinic.branchId;
}, 60_000);

describe("clinic settings", () => {
  it("saves the name and merged settings, and audits which fields changed", async () => {
    const result = await saveClinicProfile(db, { clinicId, name: " מרפאת   הדגמה ", settings: { followUpMonths: 12, smsSenderName: "Demo Clinic" }, staffId: null });
    expect(result).toMatchObject({ status: "saved", settings: { followUpMonths: 12, smsSenderName: "Demo Clinic", patientVisibility: "clinic_wide" } });
    const [clinic] = await db.select({ name: clinics.name }).from(clinics).where(eq(clinics.id, clinicId));
    expect(clinic.name).toBe("מרפאת הדגמה");
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "settings.update"));
    expect(audit.metadata).toEqual({ fields: ["followUpMonths", "smsSenderName", "name"] });
  });

  it("refuses invalid values and keeps the stored settings", async () => {
    expect(await saveClinicProfile(db, { clinicId, settings: { smsSenderName: "שם בעברית" }, staffId: null })).toEqual({ status: "invalid", field: "smsSenderName" });
    expect(await saveClinicProfile(db, { clinicId, settings: { followUpMonths: 99 }, staffId: null })).toEqual({ status: "invalid", field: "followUpMonths" });
    expect(await saveClinicProfile(db, { clinicId, name: "א", staffId: null })).toEqual({ status: "invalid", field: "name" });
    const [row] = await db.select({ settings: clinicSettings.settings }).from(clinicSettings).where(eq(clinicSettings.clinicId, clinicId));
    expect(parseClinicSettings(row.settings).followUpMonths).toBe(12);
  });
});

describe("branches", () => {
  it("renames, counts active treatments, and archives only an empty non-main branch", async () => {
    const north = await createBranch(db, { clinicId, name: "סניף צפון" });
    if (north.status !== "created") throw new Error("branch");
    expect(await renameBranch(db, { clinicId, branchId: north.branchId, name: "סניף חיפה" })).toBe("saved");
    const patient = await createPatient(db, { clinicId, fullName: "דנה כהן", nationalId: "123456782", phone: "0501234567", plannedSurgeryDate: "2026-06-10", branchId: north.branchId }, keyring);
    if (patient.status !== "created") throw new Error(patient.status);

    expect((await listBranchesWithCounts(db, clinicId)).map((b) => [b.name, b.activeTreatments])).toEqual([
      ["סניף ראשי", 0],
      ["סניף חיפה", 1],
    ]);
    expect(await archiveBranch(db, { clinicId, branchId: mainBranch })).toBe("main");
    expect(await archiveBranch(db, { clinicId, branchId: north.branchId })).toBe("has_active");

    await setActualSurgeryDate(db, { clinicId, treatmentId: patient.treatmentId, actualDate: "2026-06-10", staffId: null });
    await completeTreatment(db, { clinicId, treatmentId: patient.treatmentId, staffId: null });
    expect(await archiveBranch(db, { clinicId, branchId: north.branchId })).toBe("archived");
    expect((await listBranchesWithCounts(db, clinicId)).map((b) => b.name)).toEqual(["סניף ראשי"]);
  });
});

describe("documents screen", () => {
  it("lists every version and counts signatures on the current consent among active patients", async () => {
    expect(await consentCoverage(db, clinicId)).toBeNull();
    const a = await createPatient(db, { clinicId, fullName: "רון לוי", nationalId: "000000018", phone: "0527654321", plannedSurgeryDate: "2026-12-01" }, keyring);
    const b = await createPatient(db, { clinicId, fullName: "אורי ברק", nationalId: "000000026", phone: "0541112233", plannedSurgeryDate: "2026-12-01" }, keyring);
    if (a.status !== "created" || b.status !== "created") throw new Error("patients");

    const v1 = await publishLegalDocument(db, storage, { clinicId, kind: "consent", content: { format: "text", text: "נוסח ראשון" }, staffId: null });
    if (v1.status !== "published") throw new Error("publish");
    await recordConsent(db, storage, { clinicId, patientId: a.patientId, documentId: v1.documentId, signaturePng: signaturePng(), ip: null, userAgent: null });
    expect(await consentCoverage(db, clinicId)).toEqual({ signed: 1, active: 2 });

    await publishLegalDocument(db, storage, { clinicId, kind: "consent", content: { format: "text", text: "נוסח שני" }, staffId: null });
    expect(await consentCoverage(db, clinicId)).toEqual({ signed: 0, active: 2 });
    expect((await listDocuments(db, clinicId)).map((d) => [d.kind, d.version])).toEqual([
      ["consent", 2],
      ["consent", 1],
    ]);
  });
});
