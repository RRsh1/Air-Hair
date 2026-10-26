import { crc32, deflateSync } from "node:zlib";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase, testKeyring } from "../../../test/db";
import { auditLog, consents } from "../../db/schema";
import type { Database } from "../../db/types";
import { buildAuth } from "../auth/build-auth";
import { provisionClinic } from "../clinic/provision";
import { createPatient } from "../patients/create-patient";
import type { ObjectStorage } from "../storage/types";
import {
  consentStatus,
  currentDocument,
  isSignaturePng,
  normalizeText,
  publishedDocument,
  publishLegalDocument,
  recordConsent,
} from "./documents";

/** A real (tiny, blank) RGBA PNG of the given size. */
function makePng(width = 600, height = 220): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const PDF = new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1"));

function memoryStorage(): ObjectStorage & { keys: () => string[] } {
  const store = new Map<string, Uint8Array>();
  return {
    put: async (key, body) => void store.set(key, body),
    get: async (key) => (store.has(key) ? { body: store.get(key)!, contentType: "application/octet-stream" } : null),
    delete: async (key) => void store.delete(key),
    keys: () => [...store.keys()],
  };
}

const keyring = testKeyring();
let db: Database;
let clinicId = "";
let otherClinicId = "";
let patientId = "";
const storage = memoryStorage();

beforeAll(async () => {
  db = await testDatabase();
  const auth = buildAuth(db, { secret: "test-secret-test-secret-test-secret-0", baseURL: "http://localhost:3000", secureCookies: false, sendPasswordLink: async () => {} });
  clinicId = (await provisionClinic(db, auth, { clinicName: "מרפאה", slug: "legal", adminEmail: "l@test.com", adminName: "א" })).clinicId;
  otherClinicId = (await provisionClinic(db, auth, { clinicName: "אחרת", slug: "other", adminEmail: "o@test.com", adminName: "ב" })).clinicId;
  const created = await createPatient(db, { clinicId, fullName: "דנה כהן", nationalId: "123456782", phone: "0501234567", plannedSurgeryDate: "2026-11-01" }, keyring);
  if (created.status !== "created") throw new Error(created.status);
  patientId = created.patientId;
}, 60_000);

const sign = (documentId: string, extra: Partial<Parameters<typeof recordConsent>[2]> = {}) =>
  recordConsent(db, storage, { clinicId, patientId, documentId, signaturePng: makePng(), ip: "10.0.0.1", userAgent: "test", ...extra });

describe("publishing clinic documents", () => {
  it("adds versions; the newest published one is current, per clinic and kind", async () => {
    expect(await currentDocument(db, clinicId, "privacy_policy")).toBeNull();
    const v1 = await publishLegalDocument(db, storage, { clinicId, kind: "privacy_policy", content: { format: "text", text: "גרסה ראשונה" }, staffId: null });
    const v2 = await publishLegalDocument(db, storage, { clinicId, kind: "privacy_policy", content: { format: "text", text: "גרסה שנייה" }, staffId: null });
    expect(v1).toMatchObject({ status: "published", version: 1 });
    expect(v2).toMatchObject({ status: "published", version: 2 });
    expect(await currentDocument(db, clinicId, "privacy_policy")).toMatchObject({ version: 2, bodyText: "גרסה שנייה" });
    expect(await currentDocument(db, otherClinicId, "privacy_policy")).toBeNull();
    expect(await currentDocument(db, clinicId, "consent")).toBeNull();
  });

  it("normalizes text and refuses empty or oversized content", async () => {
    expect(normalizeText("\r\n  שורה  \r\n\r\n\r\n\r\nעוד   \n")).toBe("שורה\n\nעוד");
    expect(await publishLegalDocument(db, storage, { clinicId, kind: "consent", content: { format: "text", text: " \n " }, staffId: null })).toEqual({
      status: "invalid",
      reason: "empty",
    });
    expect(
      (await publishLegalDocument(db, storage, { clinicId, kind: "consent", content: { format: "text", text: "א".repeat(50_001) }, staffId: null })).status,
    ).toBe("invalid");
  });

  it("stores PDFs and accepts only PDFs", async () => {
    const notPdf = new TextEncoder().encode("<html>%%EOF");
    expect(await publishLegalDocument(db, storage, { clinicId, kind: "privacy_policy", content: { format: "file", pdf: notPdf }, staffId: null })).toEqual({
      status: "invalid",
      reason: "not_pdf",
    });
    const result = await publishLegalDocument(db, storage, { clinicId, kind: "privacy_policy", content: { format: "file", pdf: PDF }, staffId: null });
    if (result.status !== "published") throw new Error(result.status);
    const document = await publishedDocument(db, clinicId, result.documentId);
    expect(document?.format).toBe("file");
    expect(storage.keys()).toContain(document!.storageKey);
    expect(await publishedDocument(db, otherClinicId, result.documentId)).toBeNull();
  });
});

describe("patient consent", () => {
  it("is not required while the clinic has no consent document", async () => {
    expect(await consentStatus(db, { clinicId, patientId })).toEqual({ required: false });
  });

  it("records one signature on the current document, with its content hash", async () => {
    const published = await publishLegalDocument(db, storage, { clinicId, kind: "consent", content: { format: "text", text: "אני מסכים/ה" }, staffId: null });
    if (published.status !== "published") throw new Error(published.status);
    expect(await consentStatus(db, { clinicId, patientId })).toMatchObject({ required: true, signedAt: null });

    const filesBefore = storage.keys().length;
    const result = await sign(published.documentId);
    expect(result.status).toBe("signed");
    expect(storage.keys().length).toBe(filesBefore + 1);

    const status = await consentStatus(db, { clinicId, patientId });
    expect(status.required && status.signedAt).toBeInstanceOf(Date);
    const [row] = await db.select().from(consents).where(eq(consents.patientId, patientId));
    expect(row.contentHash).toBe((await currentDocument(db, clinicId, "consent"))!.contentHash);
    expect(row.signatureStorageKey).toContain(`patients/${patientId}/signatures/`);

    expect(await sign(published.documentId)).toEqual({ status: "already_signed" });
    expect(storage.keys().length).toBe(filesBefore + 1);

    const audit = await db.select().from(auditLog).where(and(eq(auditLog.action, "consent.sign"), eq(auditLog.patientId, patientId)));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("123456782");
  });

  it("asks again after a new version, and refuses a signature on the old one", async () => {
    const old = (await currentDocument(db, clinicId, "consent"))!;
    const next = await publishLegalDocument(db, storage, { clinicId, kind: "consent", content: { format: "text", text: "נוסח מעודכן" }, staffId: null });
    if (next.status !== "published") throw new Error(next.status);
    expect(await consentStatus(db, { clinicId, patientId })).toMatchObject({ required: true, signedAt: null });
    expect(await sign(old.id)).toEqual({ status: "stale_document" });
    expect(await sign(next.documentId)).toMatchObject({ status: "signed" });
  });

  it("keeps one consent and one file when the same signature is sent twice at once", async () => {
    const doc = await publishLegalDocument(db, storage, { clinicId, kind: "consent", content: { format: "text", text: "נוסח שלישי" }, staffId: null });
    if (doc.status !== "published") throw new Error(doc.status);
    const before = storage.keys().length;
    const results = await Promise.all([sign(doc.documentId), sign(doc.documentId)]);
    expect(results.map((r) => r.status).sort()).toEqual(["already_signed", "signed"]);
    expect(await db.select().from(consents).where(eq(consents.documentId, doc.documentId))).toHaveLength(1);
    expect(storage.keys().length).toBe(before + 1);
  });

  it("rejects anything that isn't a plausible signature image", async () => {
    const doc = (await currentDocument(db, clinicId, "consent"))!;
    const other = await createPatient(db, { clinicId, fullName: "רון לוי", nationalId: "000000018", phone: "0527654321", plannedSurgeryDate: "2026-11-01" }, keyring);
    if (other.status !== "created") throw new Error(other.status);
    const attempt = (signaturePng: Uint8Array) => sign(doc.id, { patientId: other.patientId, signaturePng });

    expect(await attempt(new TextEncoder().encode("<svg onload=alert(1)>"))).toEqual({ status: "invalid_signature" });
    expect(await attempt(makePng(20, 20))).toEqual({ status: "invalid_signature" });
    expect(await attempt(new Uint8Array([...makePng(), ...new TextEncoder().encode("<script>")]))).toEqual({ status: "invalid_signature" });
    expect(isSignaturePng(makePng())).toBe(true);
    expect((await attempt(makePng())).status).toBe("signed");
  });

  it("can't sign another clinic's document", async () => {
    const foreign = await publishLegalDocument(db, storage, { clinicId: otherClinicId, kind: "consent", content: { format: "text", text: "מרפאה אחרת" }, staffId: null });
    if (foreign.status !== "published") throw new Error(foreign.status);
    expect(await sign(foreign.documentId)).toEqual({ status: "stale_document" });
  });
});
