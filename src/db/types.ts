import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

export const fullSchema = { ...appSchema, ...authSchema };

/** Any Postgres Drizzle instance over the full schema (Neon in the app, PGlite in tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof fullSchema>;
