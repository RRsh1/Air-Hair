/**
 * Creates a clinic with its first admin and prints the "set your password" link.
 *
 *   npm run clinic:create -- --name "מרפאת דוגמה" --admin-email admin@clinic.co.il --admin-name "ד״ר ישראלי"
 *
 * Reads DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL from .env.local.
 */
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { createNeonDb } from "../src/db/neon";
import { buildAuth } from "../src/lib/auth/build-auth";
import { provisionClinic, sendSetPasswordLink } from "../src/lib/clinic/provision";

config({ path: ".env.local" });

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    "admin-email": { type: "string" },
    "admin-name": { type: "string" },
    "time-zone": { type: "string", default: "Asia/Jerusalem" },
  },
});

async function main() {
  const name = values.name;
  const adminEmail = values["admin-email"];
  const adminName = values["admin-name"];
  if (!name || !adminEmail || !adminName) {
    throw new Error('Usage: npm run clinic:create -- --name "..." --admin-email ... --admin-name "..."');
  }

  const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = process.env;
  if (!DATABASE_URL || !BETTER_AUTH_SECRET || !BETTER_AUTH_URL) {
    throw new Error("DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL must be set in .env.local");
  }

  const { db, pool } = createNeonDb(DATABASE_URL);

  let link = "";
  const auth = buildAuth(db, {
    secret: BETTER_AUTH_SECRET,
    baseURL: BETTER_AUTH_URL,
    secureCookies: BETTER_AUTH_URL.startsWith("https://"),
    sendPasswordLink: async ({ url }) => {
      link = url;
    },
  });

  try {
    const result = await provisionClinic(db, auth, { clinicName: name, timeZone: values["time-zone"], adminEmail, adminName });
    await sendSetPasswordLink(auth, adminEmail, BETTER_AUTH_URL);
    console.log(`Clinic created: ${result.clinicId}`);
    console.log(`Admin: ${adminEmail}`);
    console.log(`Set-password link (valid for 1 hour):\n${link}`);
  } finally {
    await pool.end();
  }
}

/** Prints the error and its chain of causes (Drizzle wraps the real database error). */
function describe(error: unknown): string {
  const lines: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error) {
      // Skip Drizzle's "Failed query" line: it echoes parameters, which can include personal data.
      if (!current.message.startsWith("Failed query")) lines.push(current.message);
      current = current.cause;
    } else {
      lines.push(String(current));
      break;
    }
  }
  return lines.join("\n  caused by: ") || "Unknown error";
}

main().catch((error) => {
  console.error(`Could not create the clinic:\n  ${describe(error)}`);
  process.exit(1);
});
