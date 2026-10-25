import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createNeonDb } from "./neon";
import { fullSchema, type Database } from "./types";

/** Opens a database for command-line scripts: Neon for postgres URLs, PGlite for pglite:<dir>. */
export function openDatabase(url: string): { db: Database; close: () => Promise<void> } {
  if (url.startsWith("pglite:")) {
    const dir = url.slice("pglite:".length);
    mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    return { db: drizzle(client, { schema: fullSchema }) as unknown as Database, close: () => client.close() };
  }
  const { db, pool } = createNeonDb(url);
  return { db, close: () => pool.end() };
}
