/**
 * Applies the migrations to a local PGlite database (DATABASE_URL=pglite:<dir> in .env.local).
 *   npm run db:migrate:local
 * Stop the dev server first: PGlite allows one process per data directory.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("pglite:")) throw new Error("DATABASE_URL must be pglite:<directory> for a local migration");
  const dir = url.slice("pglite:".length);
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  await client.close();
  console.log("Local database is up to date.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
