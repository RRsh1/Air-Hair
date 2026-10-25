import "server-only";
import { createHmac } from "node:crypto";
import type { NormalizedIsraeliId } from "@/lib/validation/israeli-id";
import type { NormalizedMobile } from "@/lib/validation/phone";
import { getKeyring, type Keyring } from "./keyring";

/**
 * Deterministic HMAC-SHA256 "blind index" for exact-match lookups on encrypted fields.
 * The database stores only this digest next to the ciphertext, so the server can find
 * a patient by ID number + phone without decrypting any row.
 *
 * The sub-key is derived per column AND per clinic, so:
 *  - the same value produces unrelated digests in different columns, and
 *  - the same person at two clinics cannot be linked by comparing digests.
 * Patient login is therefore always scoped to one clinic (resolved from the clinic's URL).
 *
 * Inputs are branded types, so only values that went through the normalizers compile.
 * Rotating BLIND_INDEX_KEY requires recomputing every index from the decrypted values.
 */

type IndexContext = "patients.national_id" | "patients.phone";

function subKey(context: IndexContext, clinicId: string, keyring: Keyring): Buffer {
  if (!clinicId) throw new Error("Blind index requires a clinic id");
  return createHmac("sha256", keyring.blindIndexKey).update(`blind-index:${context}:${clinicId}`).digest();
}

function digest(value: string, context: IndexContext, clinicId: string, keyring: Keyring): string {
  return createHmac("sha256", subKey(context, clinicId, keyring)).update(value, "utf8").digest("hex");
}

export function nationalIdIndex(id: NormalizedIsraeliId, clinicId: string, keyring: Keyring = getKeyring()): string {
  return digest(id, "patients.national_id", clinicId, keyring);
}

export function phoneIndex(phone: NormalizedMobile, clinicId: string, keyring: Keyring = getKeyring()): string {
  return digest(phone, "patients.phone", clinicId, keyring);
}
