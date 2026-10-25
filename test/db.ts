import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fullSchema, type Database } from "../src/db/types";
import { parseKeyring } from "../src/lib/crypto/keyring";

/** A fresh, fully migrated in-process Postgres for integration tests. */
export async function testDatabase(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema: fullSchema }) as unknown as Database;
  await migrate(db as never, { migrationsFolder: "drizzle" });
  return db;
}

export function testKeyring() {
  return parseKeyring({
    FIELD_ENCRYPTION_KEYS: `1:${randomBytes(32).toString("base64")}`,
    FIELD_ENCRYPTION_CURRENT_VERSION: "1",
    BLIND_INDEX_KEY: randomBytes(32).toString("base64"),
  });
}
