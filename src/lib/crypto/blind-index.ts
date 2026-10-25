import "server-only";
import { createHmac } from "node:crypto";
import { getKeyring, type Keyring } from "./keyring";

/**
 * Deterministic HMAC-SHA256 "blind index" for exact-match lookups on encrypted fields.
 * The database stores only this digest next to the ciphertext, so the server can find
 * a patient by ID number + phone without decrypting any row.
 *
 * Each context gets its own derived sub-key, so the same value produces unrelated
 * digests in different columns. Always pass a NORMALIZED value (see lib/validation).
 *
 * Rotating BLIND_INDEX_KEY requires recomputing every index from the decrypted values.
 */

export type IndexContext = "patients.national_id" | "patients.phone";

function subKey(context: IndexContext, keyring: Keyring): Buffer {
  return createHmac("sha256", keyring.blindIndexKey).update(`blind-index:${context}`).digest();
}

export function blindIndex(normalizedValue: string, context: IndexContext, keyring: Keyring = getKeyring()): string {
  return createHmac("sha256", subKey(context, keyring)).update(normalizedValue, "utf8").digest("hex");
}
