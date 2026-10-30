import { crc32, deflateSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { clinicAssets, clinicThemes } from "../../db/schema";
import type { Database } from "../../db/types";
import { buildAuth } from "../auth/build-auth";
import { provisionClinic } from "../clinic/provision";
import type { ObjectStorage } from "../storage/types";
import { inspectLogo, loadClinicBranding, logoObject, publishTheme, uploadLogo } from "./branding";
import { contrastRatio, defaultPatientTheme, parsePatientTheme, themeIssues, themeToCss } from "./patient-theme";
import { themePresets } from "./presets";

function png(width: number, height: number, extraChunks: [string, Buffer][] = []): Uint8Array {
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
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      ...extraChunks.map(([type, data]) => chunk(type, data)),
      chunk("IDAT", deflateSync(Buffer.alloc((width * 4 + 1) * height))),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

function memoryStorage(): ObjectStorage & { keys: () => string[] } {
  const store = new Map<string, Uint8Array>();
  return {
    put: async (key, body) => void store.set(key, body),
    get: async (key) => (store.has(key) ? { body: store.get(key)!, contentType: "image/png" } : null),
    delete: async (key) => void store.delete(key),
    keys: () => [...store.keys()],
  };
}

describe("theme tokens", () => {
  it("falls back field by field, so one bad value doesn't reset the theme", () => {
    const theme = parsePatientTheme({
      palette: { s6: { hex: "red", name: "x" }, s3: { hex: "#000000", name: "שחור" } },
      radius: 99,
      blocks: { guidance: { variant: "cards", heading: "s99" } },
      nonsense: true,
    });
    expect(theme.palette.s6).toEqual(defaultPatientTheme.palette.s6);
    expect(theme.palette.s3).toEqual({ hex: "#000000", name: "שחור" });
    expect(theme.radius).toBe(defaultPatientTheme.radius);
    expect(theme.blocks.guidance.variant).toBe("cards");
    expect(theme.blocks.guidance.heading).toBe(defaultPatientTheme.blocks.guidance.heading);
    expect(parsePatientTheme(null)).toEqual(defaultPatientTheme);
    expect(parsePatientTheme({ blocks: "x", palette: 3 })).toEqual(defaultPatientTheme);
  });

  it("measures contrast like WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });

  it("ships a readable default and readable presets", () => {
    expect(themeIssues(defaultPatientTheme)).toEqual([]);
    for (const [name, preset] of Object.entries(themePresets)) {
      expect({ name, issues: themeIssues(parsePatientTheme(preset.tokens)) }).toEqual({ name, issues: [] });
    }
  });

  it("flags unreadable pairs per block", () => {
    const issues = themeIssues(parsePatientTheme({ blocks: { button: { bg: "s7", ink: "s2" } } }));
    expect(issues).toEqual([expect.objectContaining({ block: "button" })]);
  });

  it("compiles every block role to a variable, plus type and shape", () => {
    const css = themeToCss(
      parsePatientTheme({
        palette: { s9: { hex: "#123456", name: "כחול" } },
        blocks: { guidance: { heading: "s9" }, button: { shape: "pill" } },
        typography: { heading: "frank", scale: "large" },
      }),
    );
    expect(css.startsWith(".p-root{")).toBe(true);
    expect(css).toContain("--gd-heading:#123456");
    expect(css).toContain("--tl-tint:#dce8ee");
    expect(css).toContain("--bt-radius:999px");
    expect(css).toContain("--font-p-heading:'Frank Ruhl Libre Variable'");
    expect(css).toContain("html:has(.p-root){font-size:112.5%}");
  });

  it("can't smuggle CSS through token values", () => {
    const css = themeToCss(parsePatientTheme({ palette: { s1: { hex: "#fff;}body{display:none", name: "x" } }, typography: { heading: "x;}" } }));
    expect(css).not.toContain("display:none");
    expect(css).not.toContain("x;}");
  });
});

describe("clinic branding", () => {
  let db: Database;
  let clinicId = "";
  let otherClinicId = "";
  const storage = memoryStorage();

  beforeAll(async () => {
    db = await testDatabase();
    const auth = buildAuth(db, { secret: "test-secret-test-secret-test-secret-0", baseURL: "http://localhost:3000", secureCookies: false, sendPasswordLink: async () => {} });
    clinicId = (await provisionClinic(db, auth, { clinicName: "מרפאה", slug: "brand", adminEmail: "b@test.com", adminName: "א" })).clinicId;
    otherClinicId = (await provisionClinic(db, auth, { clinicName: "אחרת", slug: "other", adminEmail: "o@test.com", adminName: "ב" })).clinicId;
  }, 60_000);

  it("uses the default theme until one is published", async () => {
    expect(await loadClinicBranding(db, clinicId)).toEqual({ theme: defaultPatientTheme, logoId: null });
  });

  it("publishes versions, keeping one published theme per clinic", async () => {
    expect(await publishTheme(db, { clinicId, tokens: themePresets.granite.tokens, staffId: null })).toMatchObject({ status: "published", version: 1 });
    expect(await publishTheme(db, { clinicId, tokens: themePresets.night.tokens, staffId: null })).toMatchObject({ status: "published", version: 2 });
    const rows = await db.select({ status: clinicThemes.status }).from(clinicThemes).where(eq(clinicThemes.clinicId, clinicId));
    expect(rows.map((r) => r.status).sort()).toEqual(["published", "superseded"]);
    expect((await loadClinicBranding(db, clinicId)).theme.blocks.guidance.variant).toBe("cards");
    expect((await loadClinicBranding(db, otherClinicId)).theme).toEqual(defaultPatientTheme);
  });

  it("refuses an unreadable theme and keeps the current one", async () => {
    const result = await publishTheme(db, { clinicId, tokens: { palette: { s1: { hex: "#ffffff", name: "לבן" }, s3: { hex: "#eeeeee", name: "אפור" } } }, staffId: null });
    expect(result.status).toBe("unreadable");
    expect((await loadClinicBranding(db, clinicId)).theme.blocks.guidance.variant).toBe("cards");
  });

  it("accepts PNG logos with metadata removed, and rejects other files", () => {
    const withText = png(400, 120, [["tEXt", Buffer.from("Comment\0secret location")]]);
    const clean = inspectLogo(withText)!;
    expect(clean).toMatchObject({ width: 400, height: 120, contentType: "image/png" });
    expect(Buffer.from(clean.bytes).includes(Buffer.from("secret"))).toBe(false);
    expect(inspectLogo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(inspectLogo(new Uint8Array([...png(400, 120), 0x3c, 0x68]))).toBeNull();
  });

  it("replaces the previous logo, file included, and serves it only for its clinic", async () => {
    expect(await uploadLogo(db, storage, { clinicId, bytes: png(20, 20), staffId: null })).toEqual({ status: "invalid", reason: "dimensions" });

    const first = await uploadLogo(db, storage, { clinicId, bytes: png(400, 120), staffId: null });
    const second = await uploadLogo(db, storage, { clinicId, bytes: png(500, 150), staffId: null });
    if (first.status !== "saved" || second.status !== "saved") throw new Error("expected saved");

    expect(storage.keys()).toHaveLength(1);
    expect(await db.select().from(clinicAssets).where(eq(clinicAssets.clinicId, clinicId))).toHaveLength(1);
    expect((await loadClinicBranding(db, clinicId)).logoId).toBe(second.logoId);
    expect(await logoObject(db, { clinicId, logoId: first.logoId })).toBeNull();
    expect(await logoObject(db, { clinicId, logoId: second.logoId })).toMatchObject({ contentType: "image/png" });
    expect(await logoObject(db, { clinicId: otherClinicId, logoId: second.logoId })).toBeNull();
  });
});
