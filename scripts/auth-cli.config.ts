/**
 * Used only by the Better Auth CLI to (re)generate src/db/auth-schema.ts:
 *   npx auth@latest generate --config scripts/auth-cli.config.ts --output src/db/auth-schema.ts -y
 * It never connects to a database.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { buildAuth } from "../src/lib/auth/build-auth";

const db = drizzle(neon("postgresql://cli:cli@localhost/cli"));

export const auth = buildAuth(db, {
  secret: "cli-only-secret-cli-only-secret-00",
  baseURL: "http://localhost:3000",
  sendPasswordLink: async () => {},
});
