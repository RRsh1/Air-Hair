/**
 * Publishes a new version of a clinic document (until the dashboard's upload screen exists).
 *
 *   npx tsx --conditions=react-server scripts/publish-legal.ts --clinic demo --kind consent --text scripts/samples/consent-sample.txt
 *   npx tsx --conditions=react-server scripts/publish-legal.ts --clinic demo --kind privacy --pdf ./privacy.pdf
 *
 * Publishing a new consent version asks every patient of the clinic to sign again.
 * Reads DATABASE_URL (and STORAGE_LOCAL_DIR for PDFs) from .env.local.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { openDatabase } from "../src/db/open";
import { loadClinicBySlug } from "../src/lib/clinic/load";
import { publishLegalDocument } from "../src/lib/legal/documents";
import { localDiskStorage } from "../src/lib/storage/local-disk";

config({ path: ".env.local" });

const { values } = parseArgs({
  options: {
    clinic: { type: "string" },
    kind: { type: "string" },
    text: { type: "string" },
    pdf: { type: "string" },
  },
});

const kinds = { consent: "consent", privacy: "privacy_policy" } as const;

async function main() {
  const kind = kinds[values.kind as keyof typeof kinds];
  if (!values.clinic || !kind || Boolean(values.text) === Boolean(values.pdf)) {
    throw new Error("Usage: scripts/publish-legal.ts --clinic <slug> --kind consent|privacy (--text <file.txt> | --pdf <file.pdf>)");
  }
  const { db, close } = openDatabase(process.env.DATABASE_URL ?? "");
  try {
    const clinic = await loadClinicBySlug(db, values.clinic);
    if (!clinic) throw new Error(`No clinic with slug "${values.clinic}"`);
    const result = await publishLegalDocument(db, localDiskStorage(process.env.STORAGE_LOCAL_DIR ?? ".data/storage"), {
      clinicId: clinic.id,
      kind,
      content: values.text
        ? { format: "text", text: readFileSync(values.text, "utf8") }
        : { format: "file", pdf: new Uint8Array(readFileSync(values.pdf!)) },
      staffId: null,
    });
    if (result.status !== "published") throw new Error(`Not published: ${result.reason}`);
    console.log(`Published ${values.kind} version ${result.version} for ${clinic.name}.`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
