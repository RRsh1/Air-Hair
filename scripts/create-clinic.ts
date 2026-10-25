/**
 * Creates a clinic with its first admin and prints the "set your password" link.
 *
 *   npm run clinic:create -- --name "מרפאת דוגמה" --admin-email admin@clinic.co.il --admin-name "ד״ר ישראלי"
 *
 * Reads DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL from .env.local.
 */
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { fullSchema, type Database } from "../src/db/types";
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

  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema: fullSchema }) as unknown as Database;

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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
