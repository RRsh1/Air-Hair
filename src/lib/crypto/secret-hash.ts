import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getKeyring, type Keyring } from "./keyring";

/**
 * Keyed hash for short-lived secrets such as SMS one-time codes.
 * A 6-digit code has only a million values, so a plain SHA-256 is trivially reversible;
 * keying it with a server secret means a leaked otp_challenges table reveals nothing.
 * `salt` should be the challenge id, so equal codes never produce equal hashes.
 */

function key(keyring: Keyring): Buffer {
  // Derived sub-key, separate from the blind-index sub-keys.
  return createHmac("sha256", keyring.blindIndexKey).update("otp-secret").digest();
}

function digest(secret: string, salt: string, keyring: Keyring): Buffer {
  return createHmac("sha256", key(keyring)).update(`${salt}:${secret}`).digest();
}

export function hashSecret(secret: string, salt: string, keyring: Keyring = getKeyring()): string {
  return digest(secret, salt, keyring).toString("hex");
}

export function verifySecret(secret: string, salt: string, storedHash: string, keyring: Keyring = getKeyring()): boolean {
  if (!/^[0-9a-f]{64}$/.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(storedHash, "hex"), digest(secret, salt, keyring));
}
