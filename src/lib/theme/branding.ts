import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { auditLog, clinicAssets, clinicThemes } from "../../db/schema";
import type { Database } from "../../db/types";
import { sanitizeJpeg } from "../journal/jpeg";
import type { ObjectStorage } from "../storage/types";
import { parsePatientTheme, themeIssues, type PatientTheme, type ThemeIssue } from "./patient-theme";

/**
 * A clinic's branding for the patient app: its published theme and its logo.
 * Publishing a theme adds a version and supersedes the previous one; uploading a logo replaces
 * the previous logo (row and file). The logo is shown in the UI and overlaid on photos at display
 * time; stored photos never change.
 */

export type ClinicBranding = { theme: PatientTheme; logoId: string | null };

export async function loadClinicBranding(db: Database, clinicId: string): Promise<ClinicBranding> {
  const [[theme], [logo]] = await Promise.all([
    db
      .select({ tokens: clinicThemes.tokens })
      .from(clinicThemes)
      .where(and(eq(clinicThemes.clinicId, clinicId), eq(clinicThemes.status, "published")))
      .limit(1),
    db
      .select({ id: clinicAssets.id })
      .from(clinicAssets)
      .where(and(eq(clinicAssets.clinicId, clinicId), eq(clinicAssets.kind, "logo")))
      .orderBy(desc(clinicAssets.createdAt))
      .limit(1),
  ]);
  return { theme: parsePatientTheme(theme?.tokens), logoId: logo?.id ?? null };
}

export type PublishThemeResult =
  | { status: "published"; version: number; theme: PatientTheme }
  | { status: "unreadable"; issues: ThemeIssue[] };

/** Publishes a theme. Values are normalized; a theme with unreadable color pairs is refused. */
export async function publishTheme(
  db: Database,
  input: { clinicId: string; tokens: unknown; staffId: string | null; now?: Date },
): Promise<PublishThemeResult> {
  const theme = parsePatientTheme(input.tokens);
  const issues = themeIssues(theme);
  if (issues.length > 0) return { status: "unreadable", issues };
  const now = input.now ?? new Date();

  const version = await db.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${clinicThemes.version}), 0) + 1` })
      .from(clinicThemes)
      .where(eq(clinicThemes.clinicId, input.clinicId));
    await tx
      .update(clinicThemes)
      .set({ status: "superseded" })
      .where(and(eq(clinicThemes.clinicId, input.clinicId), eq(clinicThemes.status, "published")));
    await tx.insert(clinicThemes).values({
      clinicId: input.clinicId,
      status: "published",
      version: Number(next),
      tokens: theme,
      createdAt: now,
      publishedAt: now,
    });
    await tx.insert(auditLog).values({
      clinicId: input.clinicId,
      actorKind: input.staffId ? "staff" : "system",
      actorId: input.staffId,
      action: "branding.theme_publish",
      metadata: { version: Number(next) },
    });
    return Number(next);
  });
  return { status: "published", version, theme };
}

export const MAX_LOGO_BYTES = 1024 * 1024;

export type UploadLogoResult =
  | { status: "saved"; logoId: string }
  | { status: "invalid"; reason: "format" | "size" | "dimensions" };

/** Stores a new clinic logo (PNG or JPEG) and removes the previous one. */
export async function uploadLogo(
  db: Database,
  storage: ObjectStorage,
  input: { clinicId: string; bytes: Uint8Array; staffId: string | null },
): Promise<UploadLogoResult> {
  if (input.bytes.length === 0 || input.bytes.length > MAX_LOGO_BYTES) return { status: "invalid", reason: "size" };
  const image = inspectLogo(input.bytes);
  if (!image) return { status: "invalid", reason: "format" };
  if (image.width < 64 || image.height < 32 || image.width > 2400 || image.height > 2400) {
    return { status: "invalid", reason: "dimensions" };
  }

  const logoId = randomUUID();
  const storageKey = `clinics/${input.clinicId}/branding/logo-${logoId}.${image.extension}`;
  await storage.put(storageKey, image.bytes, image.contentType);

  let previous: { storageKey: string }[];
  try {
    previous = await db.transaction(async (tx) => {
      const old = await tx
        .delete(clinicAssets)
        .where(and(eq(clinicAssets.clinicId, input.clinicId), eq(clinicAssets.kind, "logo")))
        .returning({ storageKey: clinicAssets.storageKey });
      await tx.insert(clinicAssets).values({
        id: logoId,
        clinicId: input.clinicId,
        kind: "logo",
        storageKey,
        contentType: image.contentType,
        bytes: image.bytes.length,
      });
      await tx.insert(auditLog).values({
        clinicId: input.clinicId,
        actorKind: input.staffId ? "staff" : "system",
        actorId: input.staffId,
        action: "branding.logo_upload",
      });
      return old;
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => {});
    throw error;
  }
  for (const old of previous) await storage.delete(old.storageKey).catch(() => {});
  return { status: "saved", logoId };
}

/** Storage key and type of a clinic's logo, if this id is its current logo. */
export async function logoObject(
  db: Database,
  input: { clinicId: string; logoId: string },
): Promise<{ storageKey: string; contentType: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(input.logoId)) return null;
  const [row] = await db
    .select({ storageKey: clinicAssets.storageKey, contentType: clinicAssets.contentType })
    .from(clinicAssets)
    .where(and(eq(clinicAssets.id, input.logoId), eq(clinicAssets.clinicId, input.clinicId), eq(clinicAssets.kind, "logo")))
    .limit(1);
  return row ?? null;
}

type LogoImage = { bytes: Uint8Array; width: number; height: number; contentType: string; extension: string };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Chunks a logo needs; text, EXIF and other metadata chunks are dropped. */
const PNG_KEPT_CHUNKS = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND", "gAMA", "sRGB", "cHRM", "pHYs"]);

/** Accepts PNG (metadata chunks removed) and JPEG (sanitized like photos). */
export function inspectLogo(bytes: Uint8Array): LogoImage | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const jpeg = sanitizeJpeg(bytes);
    return jpeg ? { ...jpeg, contentType: "image/jpeg", extension: "jpg" } : null;
  }
  if (!PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let size: { width: number; height: number } | null = null;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString("latin1");
    const end = offset + 12 + length;
    if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type)) return null;
    if (offset === 8) {
      if (type !== "IHDR" || length !== 13) return null;
      size = { width: view.getUint32(offset + 8), height: view.getUint32(offset + 12) };
    }
    if (PNG_KEPT_CHUNKS.has(type)) kept.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") {
      if (offset !== bytes.length || !size) return null;
      const out = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0));
      let at = 0;
      for (const part of kept) {
        out.set(part, at);
        at += part.length;
      }
      return { bytes: out, ...size, contentType: "image/png", extension: "png" };
    }
  }
  return null;
}
