/**
 * Creates a test patient (encrypted like a real one) for local development.
 *
 *   npm run patient:create -- --clinic demo --name "ישראל ישראלי" --id 123456782 --phone 0501234567 --surgery 2026-11-01
 *   add --performed to mark the surgery as already done on that date (post-op timeline).
 *
 * Reads DATABASE_URL and the encryption keys from .env.local.
 */
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { openDatabase } from "../src/db/open";
import { loadClinicBySlug } from "../src/lib/clinic/load";
import { createPatient } from "../src/lib/patients/create-patient";
import type { IsoDate } from "../src/lib/timeline/days";
import { setActualSurgeryDate } from "../src/lib/treatments/surgery-date";

config({ path: ".env.local" });

const { values } = parseArgs({
  options: {
    clinic: { type: "string" },
    name: { type: "string" },
    id: { type: "string" },
    phone: { type: "string" },
    surgery: { type: "string" },
    performed: { type: "boolean", default: false },
  },
});

const messages = {
  fullName: "Name must be 2-120 characters",
  nationalId: "Invalid Israeli ID number (check digit)",
  phone: "Invalid Israeli mobile number",
  plannedSurgeryDate: "Surgery date must be YYYY-MM-DD",
} as const;

async function main() {
  const { clinic: slug, name, id, phone, surgery } = values;
  if (!slug || !name || !id || !phone || !surgery) {
    throw new Error('Usage: npm run patient:create -- --clinic demo --name "..." --id 123456782 --phone 0501234567 --surgery 2026-11-01 [--performed]');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set in .env.local");

  const { db, close } = openDatabase(url);
  try {
    const clinic = await loadClinicBySlug(db, slug);
    if (!clinic) throw new Error(`No clinic with slug "${slug}"`);

    const result = await createPatient(db, {
      clinicId: clinic.id,
      fullName: name,
      nationalId: id,
      phone,
      plannedSurgeryDate: surgery as IsoDate,
    });
    if (result.status === "invalid") throw new Error(messages[result.field]);
    if (result.status === "duplicate") throw new Error("A patient with this ID number already exists in this clinic");
    if (result.status === "no_timeline") throw new Error("The clinic has no published timeline");

    if (values.performed) {
      await setActualSurgeryDate(db, { clinicId: clinic.id, treatmentId: result.treatmentId, actualDate: surgery, staffId: null });
    }
    console.log(`Patient created (${values.performed ? "surgery performed" : "surgery scheduled"} ${surgery}).`);
    console.log(`Sign in at ${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/c/${slug}/login with the ID and phone above.`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
