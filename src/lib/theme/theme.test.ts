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
    const theme = parsePatientTheme({ accent: "red", ink: "#000000", radius: 99, filmTemplate: "polaroid", nonsense: true });
    expect(theme.accent).toBe(defaultPatientTheme.accent);
    expect(theme.radius).toBe(defaultPatientTheme.radius);
    expect(theme.ink).toBe("#000000");
    expect(theme.filmTemplate).toBe("polaroid");
    expect(parsePatientTheme(null)).toEqual(defaultPatientTheme);
    expect(parsePatientTheme("x")).toEqual(defaultPatientTheme);
  });

  it("measures contrast like WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });

  it("ships a readable default and readable presets", () => {
    expect(themeIssues(defaultPatientTheme)).toEqual([]);
    for (const [name, preset] of Object.entries(themePresets)) {
      expect({ name, issues: themeIssues(parsePatientTheme(preset)) }).toEqual({ name, issues: [] });
    }
  });

  it("flags unreadable pairs", () => {
    const issues = themeIssues(parsePatientTheme({ accent: "#f0f0f0", accentInk: "#ffffff" }));
    expect(issues.map((i) => i.pair)).toContain("button text on accent");
  });

  it("compiles to one stylesheet for .p-root, with template and size switches", () => {
    const css = themeToCss(parsePatientTheme({ filmTemplate: "minimal", textSize: "large", blocks: "outlined", accent: "#123456" }));
    expect(css.startsWith(".p-root{")).toBe(true);
    expect(css).toContain("--p-accent:#123456");
    expect(css).toContain("--p-sprockets:none");
    expect(css).toContain("--p-block-bg:transparent");
    expect(css).toContain("html{font-size:112.5%}");
    expect(themeToCss(defaultPatientTheme)).not.toContain("html{");
  });

  it("can't smuggle CSS through token values", () => {
    const css = themeToCss(parsePatientTheme({ accent: "#fff;}body{display:none" }));
    expect(css).not.toContain("display:none");
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
    expect(await publishTheme(db, { clinicId, tokens: themePresets.sand, staffId: null })).toMatchObject({ status: "published", version: 1 });
    expect(await publishTheme(db, { clinicId, tokens: themePresets.night, staffId: null })).toMatchObject({ status: "published", version: 2 });
    const rows = await db.select({ status: clinicThemes.status }).from(clinicThemes).where(eq(clinicThemes.clinicId, clinicId));
    expect(rows.map((r) => r.status).sort()).toEqual(["published", "superseded"]);
    expect((await loadClinicBranding(db, clinicId)).theme.filmTemplate).toBe("minimal");
    expect((await loadClinicBranding(db, otherClinicId)).theme).toEqual(defaultPatientTheme);
  });

  it("refuses an unreadable theme and keeps the current one", async () => {
    const result = await publishTheme(db, { clinicId, tokens: { background: "#ffffff", ink: "#eeeeee" }, staffId: null });
    expect(result.status).toBe("unreadable");
    expect((await loadClinicBranding(db, clinicId)).theme.filmTemplate).toBe("minimal");
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
