import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { auditLog, clinicAssets, clinicThemes } from "../../db/schema";
import type { Database } from "../../db/types";
import { sanitizeJpeg } from "../journal/jpeg";
import type { ObjectStorage } from "../storage/types";
import { mergeTheme, parsePatientTheme, themeDiff, themeIssues, type PatientTheme, type ThemeIssue } from "./patient-theme";

/**
 * A clinic's branding for the patient app: its published theme and its logo.
 * Publishing a theme adds a version and supersedes the previous one; uploading a logo replaces
 * the previous logo (row and file). The logo is shown in the UI and overlaid on photos at display
 * time; stored photos never change.
 */

export type ClinicBranding = { theme: PatientTheme; logoId: string | null };

/** Rows of one scope: the organization (branchId null) or one branch. */
const scope = (table: { branchId: typeof clinicThemes.branchId | typeof clinicAssets.branchId }, branchId: string | null): SQL =>
  branchId ? eq(table.branchId, branchId) : isNull(table.branchId);

async function publishedTokens(db: Database, clinicId: string, branchId: string | null): Promise<unknown | null> {
  const [row] = await db
    .select({ tokens: clinicThemes.tokens })
    .from(clinicThemes)
    .where(and(eq(clinicThemes.clinicId, clinicId), eq(clinicThemes.status, "published"), scope(clinicThemes, branchId)))
    .limit(1);
  return row?.tokens ?? null;
}

/**
 * What patients see: the organization's theme, with the branch's override laid over it when the
 * patient's treatment belongs to a branch that has one, and the branch's logo when it has its own.
 * An override that became unreadable (after the organization changed its colors) is ignored.
 */
export async function loadClinicBranding(db: Database, clinicId: string, branchId: string | null = null): Promise<ClinicBranding> {
  const [orgTokens, branchTokens, logos] = await Promise.all([
    publishedTokens(db, clinicId, null),
    branchId ? publishedTokens(db, clinicId, branchId) : Promise.resolve(null),
    db
      .select({ id: clinicAssets.id, branchId: clinicAssets.branchId })
      .from(clinicAssets)
      .where(and(eq(clinicAssets.clinicId, clinicId), eq(clinicAssets.kind, "logo"), branchId ? or(isNull(clinicAssets.branchId), eq(clinicAssets.branchId, branchId)) : isNull(clinicAssets.branchId)))
      .orderBy(desc(clinicAssets.createdAt)),
  ]);
  const org = parsePatientTheme(orgTokens);
  const merged = branchTokens ? mergeTheme(org, branchTokens) : org;
  const logo = logos.find((l) => l.branchId === branchId && branchId) ?? logos.find((l) => l.branchId === null);
  return { theme: themeIssues(merged).length === 0 ? merged : org, logoId: logo?.id ?? null };
}

/** For the editor: the organization's theme and logo, and a branch's override and own logo. */
export async function loadBrandingScope(db: Database, clinicId: string, branchId: string | null) {
  const [orgTokens, override, logos] = await Promise.all([
    publishedTokens(db, clinicId, null),
    branchId ? publishedTokens(db, clinicId, branchId) : Promise.resolve(null),
    db
      .select({ id: clinicAssets.id, branchId: clinicAssets.branchId })
      .from(clinicAssets)
      .where(and(eq(clinicAssets.clinicId, clinicId), eq(clinicAssets.kind, "logo")))
      .orderBy(desc(clinicAssets.createdAt)),
  ]);
  const org = parsePatientTheme(orgTokens);
  return {
    orgTheme: org,
    theme: override ? mergeTheme(org, override) : org,
    hasOverride: Boolean(override) && Object.keys(override as object).length > 0,
    orgLogoId: logos.find((l) => l.branchId === null)?.id ?? null,
    branchLogoId: branchId ? (logos.find((l) => l.branchId === branchId)?.id ?? null) : null,
  };
}

export type PublishThemeResult =
  | { status: "published"; version: number; theme: PatientTheme }
  | { status: "unreadable"; issues: ThemeIssue[] };

/**
 * Publishes a theme. For the organization the whole theme is stored; for a branch, only what
 * differs from the organization's current theme. Values are normalized; a theme with unreadable
 * color pairs is refused.
 */
export async function publishTheme(
  db: Database,
  input: { clinicId: string; branchId?: string | null; tokens: unknown; staffId: string | null; now?: Date },
): Promise<PublishThemeResult> {
  const theme = parsePatientTheme(input.tokens);
  const issues = themeIssues(theme);
  if (issues.length > 0) return { status: "unreadable", issues };
  const now = input.now ?? new Date();
  const branchId = input.branchId ?? null;
  const stored = branchId ? themeDiff(parsePatientTheme(await publishedTokens(db, input.clinicId, null)), theme) : theme;

  const version = await db.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${clinicThemes.version}), 0) + 1` })
      .from(clinicThemes)
      .where(eq(clinicThemes.clinicId, input.clinicId));
    await tx
      .update(clinicThemes)
      .set({ status: "superseded" })
      .where(and(eq(clinicThemes.clinicId, input.clinicId), eq(clinicThemes.status, "published"), scope(clinicThemes, branchId)));
    await tx.insert(clinicThemes).values({
      clinicId: input.clinicId,
      branchId,
      status: "published",
      version: Number(next),
      tokens: stored,
      createdAt: now,
      publishedAt: now,
    });
    await tx.insert(auditLog).values({
      clinicId: input.clinicId,
      actorKind: input.staffId ? "staff" : "system",
      actorId: input.staffId,
      action: "branding.theme_publish",
      metadata: { version: Number(next), ...(branchId ? { branchId } : {}) },
    });
    return Number(next);
  });
  return { status: "published", version, theme };
}

/** Drops a branch's override (and own logo), so the branch shows the organization's branding again. */
export async function resetBranchBranding(
  db: Database,
  storage: ObjectStorage,
  input: { clinicId: string; branchId: string; staffId: string | null },
): Promise<void> {
  const removed = await db.transaction(async (tx) => {
    await tx
      .update(clinicThemes)
      .set({ status: "superseded" })
      .where(and(eq(clinicThemes.clinicId, input.clinicId), eq(clinicThemes.status, "published"), eq(clinicThemes.branchId, input.branchId)));
    const logos = await tx
      .delete(clinicAssets)
      .where(and(eq(clinicAssets.clinicId, input.clinicId), eq(clinicAssets.kind, "logo"), eq(clinicAssets.branchId, input.branchId)))
      .returning({ storageKey: clinicAssets.storageKey });
    await tx.insert(auditLog).values({
      clinicId: input.clinicId,
      actorKind: input.staffId ? "staff" : "system",
      actorId: input.staffId,
      action: "branding.branch_reset",
      metadata: { branchId: input.branchId },
    });
    return logos;
  });
  for (const logo of removed) await storage.delete(logo.storageKey).catch(() => {});
}

export const MAX_LOGO_BYTES = 1024 * 1024;

export type UploadLogoResult =
  | { status: "saved"; logoId: string }
  | { status: "invalid"; reason: "format" | "size" | "dimensions" };

/** Stores a new clinic logo (PNG or JPEG) and removes the previous one. */
export async function uploadLogo(
  db: Database,
  storage: ObjectStorage,
  input: { clinicId: string; branchId?: string | null; bytes: Uint8Array; staffId: string | null },
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
        .where(and(eq(clinicAssets.clinicId, input.clinicId), eq(clinicAssets.kind, "logo"), scope(clinicAssets, input.branchId ?? null)))
        .returning({ storageKey: clinicAssets.storageKey });
      await tx.insert(clinicAssets).values({
        id: logoId,
        clinicId: input.clinicId,
        branchId: input.branchId ?? null,
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
