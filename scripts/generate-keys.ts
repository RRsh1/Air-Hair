/**
 * Prints fresh encryption env vars for .env.local (or Vercel).
 *   npm run keys:generate
 * Generate separate keys per environment. Never reuse production keys locally.
 */
import { randomBytes } from "node:crypto";

const key = () => randomBytes(32).toString("base64");

console.log(`FIELD_ENCRYPTION_KEYS=1:${key()}`);
console.log("FIELD_ENCRYPTION_CURRENT_VERSION=1");
console.log(`BLIND_INDEX_KEY=${key()}`);
