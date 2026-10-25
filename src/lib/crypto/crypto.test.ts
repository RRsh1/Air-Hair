import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blindIndex } from "./blind-index";
import { decryptField, encryptField, encryptedKeyVersion, needsReencryption } from "./field-encryption";
import { parseKeyring } from "./keyring";
import { hashSecret, verifySecret } from "./secret-hash";

const k = () => randomBytes(32).toString("base64");
const k1 = k();
const k2 = k();
const hmac = k();

const v1 = parseKeyring({ FIELD_ENCRYPTION_KEYS: `1:${k1}`, FIELD_ENCRYPTION_CURRENT_VERSION: "1", BLIND_INDEX_KEY: hmac });
const v2 = parseKeyring({
  FIELD_ENCRYPTION_KEYS: `1:${k1},2:${k2}`,
  FIELD_ENCRYPTION_CURRENT_VERSION: "2",
  BLIND_INDEX_KEY: hmac,
});

describe("keyring", () => {
  it("rejects keys of the wrong length", () => {
    expect(() =>
      parseKeyring({ FIELD_ENCRYPTION_KEYS: "1:c2hvcnQ=", FIELD_ENCRYPTION_CURRENT_VERSION: "1", BLIND_INDEX_KEY: hmac }),
    ).toThrow(/32 bytes/);
  });

  it("rejects a current version without a key", () => {
    expect(() =>
      parseKeyring({ FIELD_ENCRYPTION_KEYS: `1:${k1}`, FIELD_ENCRYPTION_CURRENT_VERSION: "2", BLIND_INDEX_KEY: hmac }),
    ).toThrow(/no matching key/);
  });

  it("rejects an HMAC key equal to an encryption key", () => {
    expect(() =>
      parseKeyring({ FIELD_ENCRYPTION_KEYS: `1:${k1}`, FIELD_ENCRYPTION_CURRENT_VERSION: "1", BLIND_INDEX_KEY: k1 }),
    ).toThrow(/must differ/);
  });
});

describe("field encryption", () => {
  it("round-trips Hebrew text", () => {
    const cipher = encryptField("ישראל ישראלי", "patients.full_name", v1);
    expect(cipher).not.toContain("ישראל");
    expect(decryptField(cipher, "patients.full_name", v1)).toBe("ישראל ישראלי");
  });

  it("produces a different ciphertext every time", () => {
    expect(encryptField("123", "patients.phone", v1)).not.toBe(encryptField("123", "patients.phone", v1));
  });

  it("refuses to decrypt under a different column context", () => {
    const cipher = encryptField("+972501234567", "patients.phone", v1);
    expect(() => decryptField(cipher, "patients.national_id", v1)).toThrow();
  });

  it("detects tampering", () => {
    const cipher = encryptField("secret", "patients.full_name", v1);
    const parts = cipher.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptField(parts.join("."), "patients.full_name", v1)).toThrow();
  });

  it("reads old versions after rotation and flags them for re-encryption", () => {
    const old = encryptField("value", "patients.full_name", v1);
    expect(decryptField(old, "patients.full_name", v2)).toBe("value");
    expect(needsReencryption(old, v2)).toBe(true);

    const fresh = encryptField("value", "patients.full_name", v2);
    expect(encryptedKeyVersion(fresh)).toBe(2);
    expect(needsReencryption(fresh, v2)).toBe(false);
  });
});

describe("blind index", () => {
  it("is deterministic per context and differs across contexts", () => {
    const a = blindIndex("123456782", "patients.national_id", v1);
    expect(blindIndex("123456782", "patients.national_id", v1)).toBe(a);
    expect(blindIndex("123456782", "patients.phone", v1)).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not change when only encryption keys rotate", () => {
    expect(blindIndex("x", "patients.phone", v1)).toBe(blindIndex("x", "patients.phone", v2));
  });
});

describe("secret hash", () => {
  it("verifies the right code and rejects others", () => {
    const stored = hashSecret("482913", "challenge-1", v1);
    expect(verifySecret("482913", "challenge-1", stored, v1)).toBe(true);
    expect(verifySecret("482914", "challenge-1", stored, v1)).toBe(false);
    expect(verifySecret("482913", "challenge-2", stored, v1)).toBe(false);
  });
});
