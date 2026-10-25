import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeIsraeliId } from "@/lib/validation/israeli-id";
import { normalizeIsraeliMobile } from "@/lib/validation/phone";
import { nationalIdIndex, phoneIndex } from "./blind-index";
import { decryptField, encryptField, encryptedKeyVersion, needsReencryption, type FieldBinding } from "./field-encryption";
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

const name1: FieldBinding = { context: "patients.full_name", rowId: "patient-1" };
const phone1: FieldBinding = { context: "patients.phone", rowId: "patient-1" };

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
  it("round-trips Hebrew text and empty strings", () => {
    const cipher = encryptField("ישראל ישראלי", name1, v1);
    expect(cipher).not.toContain("ישראל");
    expect(decryptField(cipher, name1, v1)).toBe("ישראל ישראלי");
    expect(decryptField(encryptField("", name1, v1), name1, v1)).toBe("");
  });

  it("produces a different ciphertext every time", () => {
    expect(encryptField("123", phone1, v1)).not.toBe(encryptField("123", phone1, v1));
  });

  it("refuses to decrypt under a different column", () => {
    const cipher = encryptField("+972501234567", phone1, v1);
    expect(() => decryptField(cipher, { context: "patients.national_id", rowId: "patient-1" }, v1)).toThrow();
  });

  it("refuses to decrypt a value swapped onto another patient's row", () => {
    const cipher = encryptField("+972501234567", phone1, v1);
    expect(() => decryptField(cipher, { context: "patients.phone", rowId: "patient-2" }, v1)).toThrow();
  });

  it("requires a row id", () => {
    expect(() => encryptField("x", { context: "patients.phone", rowId: "" }, v1)).toThrow(/row id/);
  });

  it("detects tampered ciphertext", () => {
    const parts = encryptField("secret", name1, v1).split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptField(parts.join("."), name1, v1)).toThrow();
  });

  it("rejects truncated auth tags and wrong IV lengths", () => {
    const [version, iv, tag, data] = encryptField("secret", name1, v1).split(".");
    const shortTag = Buffer.from(tag, "base64url").subarray(0, 8).toString("base64url");
    expect(() => decryptField([version, iv, shortTag, data].join("."), name1, v1)).toThrow(/Malformed/);
    const longIv = randomBytes(16).toString("base64url");
    expect(() => decryptField([version, longIv, tag, data].join("."), name1, v1)).toThrow(/Malformed/);
  });

  it("rejects malformed payloads and unknown key versions", () => {
    expect(() => decryptField("not-encrypted", name1, v1)).toThrow(/Malformed/);
    const [, iv, tag, data] = encryptField("secret", name1, v1).split(".");
    expect(() => decryptField(["v9", iv, tag, data].join("."), name1, v1)).toThrow(/version 9/);
  });

  it("reads old versions after rotation and flags them for re-encryption", () => {
    const old = encryptField("value", name1, v1);
    expect(decryptField(old, name1, v2)).toBe("value");
    expect(needsReencryption(old, v2)).toBe(true);

    const fresh = encryptField("value", name1, v2);
    expect(encryptedKeyVersion(fresh)).toBe(2);
    expect(needsReencryption(fresh, v2)).toBe(false);
  });
});

describe("blind index", () => {
  const id = normalizeIsraeliId("123456782")!;
  const phone = normalizeIsraeliMobile("050-1234567")!;

  it("is deterministic within a clinic", () => {
    expect(nationalIdIndex(id, "clinic-a", v1)).toBe(nationalIdIndex(id, "clinic-a", v1));
    expect(nationalIdIndex(id, "clinic-a", v1)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cannot link the same person across clinics or columns", () => {
    expect(nationalIdIndex(id, "clinic-a", v1)).not.toBe(nationalIdIndex(id, "clinic-b", v1));
    expect(phoneIndex(phone, "clinic-a", v1)).not.toBe(phoneIndex(phone, "clinic-b", v1));
  });

  it("does not change when only encryption keys rotate", () => {
    expect(phoneIndex(phone, "clinic-a", v1)).toBe(phoneIndex(phone, "clinic-a", v2));
  });

  it("only accepts normalized input (compile-time)", () => {
    // @ts-expect-error raw strings must go through normalizeIsraeliId first
    expect(() => nationalIdIndex("123456782", "clinic-a", v1)).not.toThrow();
  });
});

describe("secret hash", () => {
  it("verifies the right code and rejects others", () => {
    const stored = hashSecret("482913", "challenge-1", v1);
    expect(verifySecret("482913", "challenge-1", stored, v1)).toBe(true);
    expect(verifySecret("482914", "challenge-1", stored, v1)).toBe(false);
    expect(verifySecret("482913", "challenge-2", stored, v1)).toBe(false);
  });

  it("returns false for malformed stored hashes instead of throwing", () => {
    expect(verifySecret("482913", "challenge-1", "abc", v1)).toBe(false);
    expect(verifySecret("482913", "challenge-1", "z".repeat(64), v1)).toBe(false);
  });
});
