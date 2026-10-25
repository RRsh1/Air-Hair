import "server-only";

/**
 * Keyring for application-level field encryption.
 *
 * Environment variables:
 *   FIELD_ENCRYPTION_KEYS            "1:<base64 32 bytes>,2:<base64 32 bytes>"
 *   FIELD_ENCRYPTION_CURRENT_VERSION "2"  (new writes use this version)
 *   BLIND_INDEX_KEY                  "<base64 32 bytes>" (HMAC key, separate from encryption keys)
 *
 * Old versions stay in FIELD_ENCRYPTION_KEYS so existing rows remain readable
 * while a background job re-encrypts them with the current version.
 * Next step (phase 2): wrap these keys with a KMS master key (envelope encryption).
 */

export type Keyring = {
  currentVersion: number;
  encryptionKeys: ReadonlyMap<number, Buffer>;
  blindIndexKey: Buffer;
};

const KEY_BYTES = 32;

function decodeKey(value: string, label: string): Buffer {
  const key = Buffer.from(value.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`${label} must be ${KEY_BYTES} bytes encoded as base64 (got ${key.length} bytes)`);
  }
  return key;
}

export function parseKeyring(env: {
  FIELD_ENCRYPTION_KEYS?: string;
  FIELD_ENCRYPTION_CURRENT_VERSION?: string;
  BLIND_INDEX_KEY?: string;
}): Keyring {
  const { FIELD_ENCRYPTION_KEYS, FIELD_ENCRYPTION_CURRENT_VERSION, BLIND_INDEX_KEY } = env;
  if (!FIELD_ENCRYPTION_KEYS || !FIELD_ENCRYPTION_CURRENT_VERSION || !BLIND_INDEX_KEY) {
    throw new Error(
      "Missing encryption env vars: FIELD_ENCRYPTION_KEYS, FIELD_ENCRYPTION_CURRENT_VERSION, BLIND_INDEX_KEY",
    );
  }

  const encryptionKeys = new Map<number, Buffer>();
  for (const entry of FIELD_ENCRYPTION_KEYS.split(",")) {
    const separator = entry.indexOf(":");
    if (separator === -1) throw new Error("FIELD_ENCRYPTION_KEYS entries must look like <version>:<base64>");
    const version = Number(entry.slice(0, separator));
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(`Invalid key version "${entry.slice(0, separator)}" in FIELD_ENCRYPTION_KEYS`);
    }
    if (encryptionKeys.has(version)) throw new Error(`Duplicate key version ${version} in FIELD_ENCRYPTION_KEYS`);
    encryptionKeys.set(version, decodeKey(entry.slice(separator + 1), `Encryption key v${version}`));
  }

  const currentVersion = Number(FIELD_ENCRYPTION_CURRENT_VERSION);
  if (!encryptionKeys.has(currentVersion)) {
    throw new Error(`FIELD_ENCRYPTION_CURRENT_VERSION=${currentVersion} has no matching key`);
  }

  const blindIndexKey = decodeKey(BLIND_INDEX_KEY, "BLIND_INDEX_KEY");
  for (const key of encryptionKeys.values()) {
    if (key.equals(blindIndexKey)) throw new Error("BLIND_INDEX_KEY must differ from every encryption key");
  }

  return { currentVersion, encryptionKeys, blindIndexKey };
}

let cached: Keyring | undefined;

/** Lazily loaded singleton so missing keys fail at first use, not at import time. */
export function getKeyring(): Keyring {
  cached ??= parseKeyring({
    FIELD_ENCRYPTION_KEYS: process.env.FIELD_ENCRYPTION_KEYS,
    FIELD_ENCRYPTION_CURRENT_VERSION: process.env.FIELD_ENCRYPTION_CURRENT_VERSION,
    BLIND_INDEX_KEY: process.env.BLIND_INDEX_KEY,
  });
  return cached;
}
