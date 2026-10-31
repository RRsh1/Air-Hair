/**
 * Opens another treatment for an existing patient (a returning patient) in local development.
 *
 *   npm run treatment:add -- --clinic demo --id 123456782 --procedure hair.beard --surgery 2026-10-20 [--performed] [--complete-previous]
 *
 * --procedure is a library key (hair.scalp, hair.beard, hair.mustache, hair.eyebrows); the clinic
 * adopts it first if needed. --complete-previous ends the patient's performed treatments first.
 * Reads DATABASE_URL and the encryption keys from .env.local.
 */
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { parseArgs } from "node:util";
import { openDatabase } from "../src/db/open";
import { patients, treatments } from "../src/db/schema";
import { adoptLibraryProcedure } from "../src/lib/catalog/procedures";
import { loadClinicBySlug } from "../src/lib/clinic/load";
import { getKeyring, nationalIdIndex } from "../src/lib/crypto";
import { addTreatment, completeTreatment } from "../src/lib/treatments/lifecycle";
import { setActualSurgeryDate } from "../src/lib/treatments/surgery-date";
import { normalizeIsraeliId } from "../src/lib/validation/israeli-id";

config({ path: ".env.local" });

const { values } = parseArgs({
  options: {
    clinic: { type: "string" },
    id: { type: "string" },
    procedure: { type: "string" },
    surgery: { type: "string" },
    performed: { type: "boolean", default: false },
    "complete-previous": { type: "boolean", default: false },
  },
});

async function main() {
  const { clinic: slug, id, procedure, surgery } = values;
  if (!slug || !id || !procedure || !surgery) {
    throw new Error("Usage: npm run treatment:add -- --clinic demo --id 123456782 --procedure hair.beard --surgery 2026-10-20 [--performed] [--complete-previous]");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set in .env.local");
  const nationalId = normalizeIsraeliId(id);
  if (!nationalId) throw new Error("Invalid Israeli ID number");

  const { db, close } = openDatabase(url);
  try {
    const clinic = await loadClinicBySlug(db, slug);
    if (!clinic) throw new Error(`No clinic with slug "${slug}"`);
    const [patient] = await db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.clinicId, clinic.id), eq(patients.nationalIdIdx, nationalIdIndex(nationalId, clinic.id, getKeyring()))))
      .limit(1);
    if (!patient) throw new Error("No patient with this ID number in this clinic");

    if (values["complete-previous"]) {
      const rows = await db
        .select({ id: treatments.id })
        .from(treatments)
        .where(and(eq(treatments.patientId, patient.id), eq(treatments.status, "performed")));
      for (const row of rows) await completeTreatment(db, { clinicId: clinic.id, treatmentId: row.id, staffId: null });
    }

    const adopted = await adoptLibraryProcedure(db, { clinicId: clinic.id, libraryKey: procedure, staffId: null });
    if (adopted.status === "unknown") throw new Error(`Unknown procedure "${procedure}"`);
    const result = await addTreatment(db, { clinicId: clinic.id, patientId: patient.id, templateId: adopted.templateId, plannedSurgeryDate: surgery, staffId: null });
    if (result.status !== "created") throw new Error(`Not created: ${result.status}`);
    if (values.performed) {
      await setActualSurgeryDate(db, { clinicId: clinic.id, treatmentId: result.treatmentId, actualDate: surgery, staffId: null });
    }
    console.log(`Treatment added (${procedure}, ${values.performed ? "performed" : "scheduled"} ${surgery}).`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
