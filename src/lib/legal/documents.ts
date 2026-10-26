import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { auditLog, consents, legalDocuments } from "../../db/schema";
import type { Database } from "../../db/types";
import type { ObjectStorage } from "../storage/types";

/**
 * Clinic legal documents (privacy policy, consent) and patient consents.
 *
 * Each clinic publishes its own documents, as text or as a PDF. Publishing never edits a
 * document: it adds a new version, and the newest published version is the current one. A
 * patient must sign the current consent document before using the app; publishing a new consent
 * version asks everyone to sign again. Each consent keeps the hash of the exact content shown,
 * the drawn signature (as a stored PNG), the time, IP and browser.
 *
 * A clinic with no published consent document has nothing to sign, so the app doesn't ask.
 */

export type LegalKind = "privacy_policy" | "consent";

export type LegalDocument = {
  id: string;
  kind: LegalKind;
  version: number;
  format: "text" | "file";
  bodyText: string | null;
  storageKey: string | null;
  contentHash: string;
  publishedAt: Date;
};

export const MAX_TEXT_LENGTH = 50_000;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_SIGNATURE_BYTES = 200 * 1024;

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

/** The newest published version of a document kind, or null. */
export async function currentDocument(db: Database, clinicId: string, kind: LegalKind): Promise<LegalDocument | null> {
  const [row] = await db
    .select()
    .from(legalDocuments)
    .where(and(eq(legalDocuments.clinicId, clinicId), eq(legalDocuments.kind, kind), isNotNull(legalDocuments.publishedAt)))
    .orderBy(desc(legalDocuments.version))
    .limit(1);
  return row ? toDocument(row) : null;
}

/** A published document of this clinic by id (for serving its PDF). */
export async function publishedDocument(db: Database, clinicId: string, documentId: string): Promise<LegalDocument | null> {
  if (!/^[0-9a-f-]{36}$/.test(documentId)) return null;
  const [row] = await db
    .select()
    .from(legalDocuments)
    .where(and(eq(legalDocuments.id, documentId), eq(legalDocuments.clinicId, clinicId), isNotNull(legalDocuments.publishedAt)))
    .limit(1);
  return row ? toDocument(row) : null;
}

function toDocument(row: typeof legalDocuments.$inferSelect): LegalDocument {
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    format: row.format,
    bodyText: row.bodyText,
    storageKey: row.storageKey,
    contentHash: row.contentHash,
    publishedAt: row.publishedAt!,
  };
}

export type PublishInput = {
  clinicId: string;
  kind: LegalKind;
  content: { format: "text"; text: string } | { format: "file"; pdf: Uint8Array };
  /** Staff member publishing; null for command-line scripts. */
  staffId: string | null;
  now?: Date;
};

export type PublishResult =
  | { status: "published"; documentId: string; version: number }
  | { status: "invalid"; reason: "empty" | "too_long" | "not_pdf" | "too_large" };

/** Publishes a new version of a clinic document. */
export async function publishLegalDocument(db: Database, storage: ObjectStorage, input: PublishInput): Promise<PublishResult> {
  const now = input.now ?? new Date();
  const documentId = randomUUID();
  let bodyText: string | null = null;
  let storageKey: string | null = null;
  let contentHash: string;

  if (input.content.format === "text") {
    bodyText = normalizeText(input.content.text);
    if (!bodyText) return { status: "invalid", reason: "empty" };
    if (bodyText.length > MAX_TEXT_LENGTH) return { status: "invalid", reason: "too_long" };
    contentHash = sha256(bodyText);
  } else {
    const pdf = input.content.pdf;
    if (pdf.length > MAX_PDF_BYTES) return { status: "invalid", reason: "too_large" };
    if (!isPdf(pdf)) return { status: "invalid", reason: "not_pdf" };
    contentHash = sha256(pdf);
    storageKey = `clinics/${input.clinicId}/legal/${documentId}.pdf`;
    await storage.put(storageKey, pdf, "application/pdf");
  }

  try {
    const version = await db.transaction(async (tx) => {
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${legalDocuments.version}), 0) + 1` })
        .from(legalDocuments)
        .where(and(eq(legalDocuments.clinicId, input.clinicId), eq(legalDocuments.kind, input.kind)));
      await tx.insert(legalDocuments).values({
        id: documentId,
        clinicId: input.clinicId,
        kind: input.kind,
        version: Number(next),
        format: input.content.format,
        bodyText,
        storageKey,
        contentHash,
        createdAt: now,
        publishedAt: now,
      });
      await tx.insert(auditLog).values({
        clinicId: input.clinicId,
        actorKind: input.staffId ? "staff" : "system",
        actorId: input.staffId,
        action: "legal_document.publish",
        metadata: { kind: input.kind, version: Number(next) },
      });
      return Number(next);
    });
    return { status: "published", documentId, version };
  } catch (error) {
    if (storageKey) await storage.delete(storageKey).catch(() => {});
    throw error;
  }
}

/** Line endings unified, trailing spaces and surrounding blank lines removed. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isPdf(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString("latin1");
  return head === "%PDF-" && tail.includes("%%EOF");
}

export type ConsentStatus =
  | { required: false }
  | { required: true; document: LegalDocument; signedAt: Date | null };

/** Whether the patient has signed the clinic's current consent document. */
export async function consentStatus(db: Database, input: { clinicId: string; patientId: string }): Promise<ConsentStatus> {
  const document = await currentDocument(db, input.clinicId, "consent");
  if (!document) return { required: false };
  const [signed] = await db
    .select({ signedAt: consents.signedAt })
    .from(consents)
    .where(
      and(
        eq(consents.clinicId, input.clinicId),
        eq(consents.patientId, input.patientId),
        eq(consents.documentId, document.id),
      ),
    )
    .limit(1);
  return { required: true, document, signedAt: signed?.signedAt ?? null };
}

export type RecordConsentInput = {
  clinicId: string;
  patientId: string;
  /** The document the patient was shown; must still be the current one. */
  documentId: string;
  signaturePng: Uint8Array;
  ip: string | null;
  userAgent: string | null;
  now?: Date;
};

export type RecordConsentResult =
  | { status: "signed"; consentId: string }
  | { status: "already_signed" }
  | { status: "stale_document" }
  | { status: "invalid_signature" };

/** Records a patient's signature on the current consent document. */
export async function recordConsent(db: Database, storage: ObjectStorage, input: RecordConsentInput): Promise<RecordConsentResult> {
  const now = input.now ?? new Date();
  if (!isSignaturePng(input.signaturePng)) return { status: "invalid_signature" };

  const status = await consentStatus(db, input);
  if (!status.required || status.document.id !== input.documentId) return { status: "stale_document" };
  if (status.signedAt) return { status: "already_signed" };

  const consentId = randomUUID();
  const signatureKey = `clinics/${input.clinicId}/patients/${input.patientId}/signatures/${consentId}.png`;
  await storage.put(signatureKey, input.signaturePng, "image/png");

  let inserted: boolean;
  try {
    inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(consents)
        .values({
          id: consentId,
          clinicId: input.clinicId,
          patientId: input.patientId,
          documentId: status.document.id,
          contentHash: status.document.contentHash,
          signatureStorageKey: signatureKey,
          signedAt: now,
          ip: input.ip,
          userAgent: input.userAgent?.slice(0, 300) ?? null,
        })
        .onConflictDoNothing({ target: [consents.patientId, consents.documentId] })
        .returning({ id: consents.id });
      if (rows.length === 0) return false;
      await tx.insert(auditLog).values({
        clinicId: input.clinicId,
        actorKind: "patient",
        actorId: input.patientId,
        action: "consent.sign",
        patientId: input.patientId,
        metadata: { documentVersion: status.document.version },
        ip: input.ip,
      });
      return true;
    });
  } catch (error) {
    await storage.delete(signatureKey).catch(() => {});
    throw error;
  }

  if (!inserted) {
    await storage.delete(signatureKey); // a parallel submit won
    return { status: "already_signed" };
  }
  return { status: "signed", consentId };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A plausible signature image: a PNG of sensible size, ending at its IEND chunk. */
export function isSignaturePng(bytes: Uint8Array): boolean {
  if (bytes.length < 67 || bytes.length > MAX_SIGNATURE_BYTES) return false;
  if (!PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return false;
  if (Buffer.from(bytes.subarray(12, 16)).toString("latin1") !== "IHDR") return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 100 || height < 50 || width > 2400 || height > 1200) return false;
  return Buffer.from(bytes.subarray(bytes.length - 8, bytes.length - 4)).toString("latin1") === "IEND";
}
