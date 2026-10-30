import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getKeyring, type Keyring } from "./keyring";

/**
 * AES-256-GCM encryption for individual database fields.
 *
 * Stored format (text column):  v<version>.<iv>.<authTag>.<ciphertext>   (base64url parts)
 *
 * Additional Authenticated Data binds each ciphertext to its column AND its row:
 *   "<context>|<rowId>"
 * so a value copied into another column, or swapped between two patients, fails to decrypt.
 * Generate the row's UUID in the application before encrypting (crypto.randomUUID()).
 */

export type FieldContext =
  | "patients.full_name"
  | "patients.national_id"
  | "patients.phone"
  | "journal_notes.body"
  | "staff_users.totp_secret";

export type FieldBinding = { context: FieldContext; rowId: string };

const IV_BYTES = 12;
const TAG_BYTES = 16;
// 12-byte IV = 16 base64url chars, 16-byte tag = 22 base64url chars (unpadded).
const FORMAT = /^v(\d+)\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]*)$/;

function aad({ context, rowId }: FieldBinding): Buffer {
  if (!rowId) throw new Error("Field encryption requires a row id");
  return Buffer.from(`${context}|${rowId}`, "utf8");
}

export function encryptField(plaintext: string, binding: FieldBinding, keyring: Keyring = getKeyring()): string {
  const version = keyring.currentVersion;
  const key = keyring.encryptionKeys.get(version)!;
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(binding));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v${version}.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptField(payload: string, binding: FieldBinding, keyring: Keyring = getKeyring()): string {
  const match = FORMAT.exec(payload);
  if (!match) throw new Error("Malformed encrypted field");

  const [, versionText, ivText, tagText, dataText] = match;
  const key = keyring.encryptionKeys.get(Number(versionText));
  if (!key) throw new Error(`No encryption key for version ${versionText}`);

  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("Malformed encrypted field");

  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad(binding));
  decipher.setAuthTag(tag);
  // Throws if the ciphertext, tag, column or row binding doesn't match.
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
