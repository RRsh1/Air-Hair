import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getKeyring, type Keyring } from "./keyring";

/**
 * AES-256-GCM encryption for individual database fields.
 *
 * Stored format (text column):  v<version>.<iv>.<authTag>.<ciphertext>   (base64url parts)
 *
 * `context` is bound as Additional Authenticated Data, so a ciphertext copied from one
 * column (e.g. patients.phone) into another (patients.national_id) fails to decrypt.
 */

export type FieldContext =
  | "patients.full_name"
  | "patients.national_id"
  | "patients.phone"
  | "staff_users.totp_secret";

const IV_BYTES = 12;
const FORMAT = /^v(\d+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)$/;

export function encryptField(plaintext: string, context: FieldContext, keyring: Keyring = getKeyring()): string {
  const version = keyring.currentVersion;
  const key = keyring.encryptionKeys.get(version)!;
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v${version}.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptField(payload: string, context: FieldContext, keyring: Keyring = getKeyring()): string {
  const match = FORMAT.exec(payload);
  if (!match) throw new Error("Malformed encrypted field");

  const [, versionText, ivText, tagText, dataText] = match;
  const key = keyring.encryptionKeys.get(Number(versionText));
  if (!key) throw new Error(`No encryption key for version ${versionText}`);

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  // Throws if the ciphertext, tag or context was tampered with.
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}

/** Version a stored value was encrypted with, for re-encryption after key rotation. */
export function encryptedKeyVersion(payload: string): number {
  const match = FORMAT.exec(payload);
  if (!match) throw new Error("Malformed encrypted field");
  return Number(match[1]);
}

export function needsReencryption(payload: string, keyring: Keyring = getKeyring()): boolean {
  return encryptedKeyVersion(payload) !== keyring.currentVersion;
}
