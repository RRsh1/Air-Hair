import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { fullSchema, type Database } from "./types";

// The Neon driver talks to Postgres over WebSocket. Node 22+ has a global WebSocket;
// older Node versions (common with nvm) don't, so provide one explicitly.
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

export function createNeonDb(connectionString: string): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema: fullSchema }) as unknown as Database, pool };
}
