import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { fullSchema, type Database } from "./types";

let instance: Database | undefined;

/**
 * Neon over WebSockets (supports transactions, needed for atomic writes and RLS context).
 * Lazily created so builds and tests don't need DATABASE_URL until a query runs.
 */
export function getDb(): Database {
  if (!instance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    instance = drizzle(new Pool({ connectionString }), { schema: fullSchema }) as unknown as Database;
  }
  return instance;
}
