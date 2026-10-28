/**
 * Publishes a clinic's patient-app branding (until the dashboard's branding editor exists).
 *
 *   npx tsx --conditions=react-server scripts/publish-branding.ts --clinic demo --preset sand
 *   npx tsx --conditions=react-server scripts/publish-branding.ts --clinic demo --theme my-theme.json --logo logo.png
 *
 * --preset starts from a built-in preset (petrol, sand, night, clear); --theme overrides fields
 * from a JSON file (see src/lib/theme/patient-theme.ts). --logo uploads a PNG or JPEG logo.
 * A theme with unreadable color pairs is refused and the failing pairs are listed.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { openDatabase } from "../src/db/open";
import { loadClinicBySlug } from "../src/lib/clinic/load";
import { localDiskStorage } from "../src/lib/storage/local-disk";
import { publishTheme, uploadLogo } from "../src/lib/theme/branding";
import { themePresets, type ThemePresetName } from "../src/lib/theme/presets";

config({ path: ".env.local" });

const { values } = parseArgs({
  options: {
    clinic: { type: "string" },
    preset: { type: "string" },
    theme: { type: "string" },
    logo: { type: "string" },
  },
});

async function main() {
  if (!values.clinic || (!values.preset && !values.theme && !values.logo)) {
    throw new Error("Usage: scripts/publish-branding.ts --clinic <slug> [--preset petrol|sand|night|clear] [--theme file.json] [--logo file.png]");
  }
  if (values.preset && !(values.preset in themePresets)) {
    throw new Error(`Unknown preset "${values.preset}". Presets: ${Object.keys(themePresets).join(", ")}`);
  }

  const { db, close } = openDatabase(process.env.DATABASE_URL ?? "");
  try {
    const clinic = await loadClinicBySlug(db, values.clinic);
    if (!clinic) throw new Error(`No clinic with slug "${values.clinic}"`);

    if (values.preset || values.theme) {
      const tokens = {
        ...(values.preset ? themePresets[values.preset as ThemePresetName] : {}),
        ...(values.theme ? JSON.parse(readFileSync(values.theme, "utf8")) : {}),
      };
      const result = await publishTheme(db, { clinicId: clinic.id, tokens, staffId: null });
      if (result.status === "unreadable") {
        const list = result.issues.map((i) => `  ${i.pair}: ${i.ratio}:1 (needs ${i.required}:1)`).join("\n");
        throw new Error(`Theme not published, these color pairs are hard to read:\n${list}`);
      }
      console.log(`Published theme version ${result.version} for ${clinic.name}.`);
    }

    if (values.logo) {
      const storage = localDiskStorage(process.env.STORAGE_LOCAL_DIR ?? ".data/storage");
      const result = await uploadLogo(db, storage, { clinicId: clinic.id, bytes: new Uint8Array(readFileSync(values.logo)), staffId: null });
      if (result.status !== "saved") throw new Error(`Logo not saved: ${result.reason} (PNG or JPEG, up to 1 MB, at least 64×32 px)`);
      console.log(`Logo saved for ${clinic.name}.`);
    }
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
