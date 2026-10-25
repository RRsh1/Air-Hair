import "server-only";
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createNeonDb } from "./neon";
import { fullSchema, type Database } from "./types";

let instance: Database | undefined;

// Next.js can load this module more than once in one process (pages, route handlers and server
// actions are bundled separately). PGlite must be a single instance per directory, so share it.
const shared = globalThis as typeof globalThis & { __hairairPglite?: Map<string, PGlite> };

function pgliteFor(dir: string): PGlite {
  shared.__hairairPglite ??= new Map();
  let client = shared.__hairairPglite.get(dir);
  if (!client) {
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
    shared.__hairairPglite.set(dir, client);
  }
  return client;
}

/**
 * DATABASE_URL picks the driver:
 *  - postgres(ql)://…  → Neon over WebSockets (supports transactions).
 *  - pglite:<directory> → in-process Postgres saved to disk, for local development and
 *    end-to-end checks without a network database. Never used in production.
 * Lazily created so builds and tests don't need DATABASE_URL until a query runs.
 */
export function getDb(): Database {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    if (url.startsWith("pglite:")) {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE !== "1") {
        throw new Error("pglite: databases are for local development only");
      }
      instance = drizzle(pgliteFor(url.slice("pglite:".length)), { schema: fullSchema }) as unknown as Database;
    } else {
      instance = createNeonDb(url).db;
    }
  }
  return instance;
}
