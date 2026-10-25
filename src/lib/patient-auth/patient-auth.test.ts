import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase, testKeyring } from "../../../test/db";
import { auditLog, otpChallenges, patients } from "../../db/schema";
import type { Database } from "../../db/types";
import { buildAuth } from "../auth/build-auth";
import { provisionClinic } from "../clinic/provision";
import { decryptField } from "../crypto";
import type { SmsProvider } from "../notifications/sms";
import { createPatient } from "../patients/create-patient";
import { requestLoginCode, verifyLoginCode } from "./login-code";
import { createPatientSession, loadPatientSession, revokePatientSession } from "./session";

const keyring = testKeyring();
let db: Database;
let clinicId = "";
let otherClinicId = "";
let patientId = "";

const sent: { to: string; text: string }[] = [];
const sms: SmsProvider = { send: async (m) => void sent.push({ to: m.to, text: m.text }) };
const lastCode = () => /(\d{6})/.exec(sent.at(-1)?.text ?? "")?.[1] ?? "";

let ipCounter = 0;
const freshIp = () => `10.1.0.${++ipCounter}`;
// Each request lands in its own rate-limit window unless a test passes `now` explicitly.
let windowCounter = 0;
const nextWindow = () => new Date(Date.now() + ++windowCounter * 11 * 60_000);

const ID = "123456782";
const PHONE = "050-1234567";

async function request(overrides: Partial<Parameters<typeof requestLoginCode>[1]> = {}) {
  return requestLoginCode(db, {
    clinic: { id: clinicId, smsSender: "HairAir", displayName: "מרפאת בדיקה" },
    nationalId: ID,
    phone: PHONE,
    ip: freshIp(),
    sms,
    keyring,
    now: nextWindow(),
    ...overrides,
  });
}

beforeAll(async () => {
  db = await testDatabase();
  const auth = buildAuth(db, { secret: "test-secret-test-secret-test-secret-0", baseURL: "http://localhost:3000", secureCookies: false, sendPasswordLink: async () => {} });
  clinicId = (await provisionClinic(db, auth, { clinicName: "מרפאת בדיקה", slug: "test", adminEmail: "a@test.com", adminName: "א" })).clinicId;
  otherClinicId = (await provisionClinic(db, auth, { clinicName: "מרפאה אחרת", slug: "other", adminEmail: "b@test.com", adminName: "ב" })).clinicId;

  const created = await createPatient(
    db,
    { clinicId, fullName: "ישראל  ישראלי", nationalId: ID, phone: PHONE, plannedSurgeryDate: "2026-11-01" },
    keyring,
  );
  if (created.status !== "created") throw new Error(created.status);
  patientId = created.patientId;
}, 60_000);

describe("createPatient", () => {
  it("stores identifiers encrypted and bound to the row", async () => {
    const [row] = await db.select().from(patients).where(eq(patients.id, patientId));
    expect(row.fullNameEnc).not.toContain("ישראל");
    expect(row.nationalIdEnc).not.toContain(ID);
    expect(decryptField(row.fullNameEnc, { context: "patients.full_name", rowId: patientId }, keyring)).toBe("ישראל ישראלי");
    expect(decryptField(row.phoneEnc, { context: "patients.phone", rowId: patientId }, keyring)).toBe("+972501234567");
  });

  it("rejects a duplicate ID in the same clinic but allows it in another clinic", async () => {
    const again = { fullName: "שוב", nationalId: ID, phone: "0527654321", plannedSurgeryDate: "2026-11-01" as const };
    expect((await createPatient(db, { clinicId, ...again }, keyring)).status).toBe("duplicate");
    expect((await createPatient(db, { clinicId: otherClinicId, ...again }, keyring)).status).toBe("created");
  });

  it("validates input", async () => {
    const base = { clinicId, fullName: "שם", nationalId: "123456789", phone: PHONE, plannedSurgeryDate: "2026-11-01" as const };
    expect(await createPatient(db, base, keyring)).toEqual({ status: "invalid", field: "nationalId" });
    expect(await createPatient(db, { ...base, nationalId: "000000018", phone: "08-6234567" }, keyring)).toEqual({ status: "invalid", field: "phone" });
  });
});

describe("patient login code", () => {
  it("sends a code for a matching patient and verifies it once", async () => {
    const result = await request();
    expect(result.status).toBe("sent");
    if (result.status !== "sent") return;
    expect(sent.at(-1)?.to).toBe("+972501234567");

    const ok = await verifyLoginCode(db, { clinicId, challengeId: result.challengeId, code: lastCode(), ip: null, keyring });
    expect(ok).toEqual({ status: "ok", patientId });
    const again = await verifyLoginCode(db, { clinicId, challengeId: result.challengeId, code: lastCode(), ip: null, keyring });
    expect(again.status).toBe("expired");

    const audit = await db.select().from(auditLog).where(eq(auditLog.action, "patient.login"));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0])).not.toContain(ID);
  });

  it("answers the same way for unknown people and sends nothing", async () => {
    const before = sent.length;
    const unknown = await request({ nationalId: "000000018" });
    const wrongPhone = await request({ phone: "0527654321" });
    expect(unknown.status).toBe("sent");
    expect(wrongPhone.status).toBe("sent");
    expect(sent.length).toBe(before);
    if (unknown.status === "sent") {
      expect((await verifyLoginCode(db, { clinicId, challengeId: unknown.challengeId, code: "123456", ip: null, keyring })).status).toBe("expired");
    }
  });

  it("is scoped to the clinic", async () => {
    const result = await request();
    if (result.status !== "sent") throw new Error("expected sent");
    const crossClinic = await verifyLoginCode(db, { clinicId: otherClinicId, challengeId: result.challengeId, code: lastCode(), ip: null, keyring });
    expect(crossClinic.status).toBe("expired");
  });

  it("locks the code after 5 wrong attempts", async () => {
    const result = await request();
    if (result.status !== "sent") throw new Error("expected sent");
    const right = lastCode();
    const wrong = right === "000000" ? "111111" : "000000";
    const outcomes = [];
    for (let i = 0; i < 5; i++) outcomes.push(await verifyLoginCode(db, { clinicId, challengeId: result.challengeId, code: wrong, ip: null, keyring }));
    expect(outcomes[0]).toEqual({ status: "wrong_code", attemptsLeft: 4 });
    expect(outcomes[4].status).toBe("locked");
    expect((await verifyLoginCode(db, { clinicId, challengeId: result.challengeId, code: right, ip: null, keyring })).status).toBe("locked");
  });

  it("expires codes after 5 minutes", async () => {
    const issuedAt = new Date("2026-10-25T10:00:00Z");
    const result = await request({ now: issuedAt });
    if (result.status !== "sent") throw new Error("expected sent");
    const late = new Date(issuedAt.getTime() + 5 * 60_000 + 1);
    expect((await verifyLoginCode(db, { clinicId, challengeId: result.challengeId, code: lastCode(), ip: null, keyring, now: late })).status).toBe("expired");
  });

  it("only the newest code works", async () => {
    const first = await request();
    const firstCode = lastCode();
    await request();
    if (first.status !== "sent") throw new Error("expected sent");
    expect((await verifyLoginCode(db, { clinicId, challengeId: first.challengeId, code: firstCode, ip: null, keyring })).status).toBe("expired");
  });

  it("stores only a hash of the code", async () => {
    await request();
    const rows = await db.select({ codeHash: otpChallenges.codeHash }).from(otpChallenges);
    expect(rows.every((row) => !row.codeHash.includes(lastCode()))).toBe(true);
  });

  it("rate-limits requests per person", async () => {
    const id = "000000026";
    const sameWindow = new Date();
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await request({ nationalId: id, now: sameWindow })).status);
    expect(results).toEqual(["sent", "sent", "sent", "rate_limited"]);
  });

  it("rejects malformed input with the field name", async () => {
    expect(await request({ nationalId: "12" })).toEqual({ status: "invalid_input", field: "nationalId" });
    expect(await request({ phone: "abc" })).toEqual({ status: "invalid_input", field: "phone" });
  });
});

describe("patient sessions", () => {
  it("loads only within the clinic and until revoked", async () => {
    const { token } = await createPatientSession(db, { clinicId, patientId, ip: null, userAgent: null });
    expect(await loadPatientSession(db, { token, clinicId })).toMatchObject({ patientId });
    expect(await loadPatientSession(db, { token, clinicId: otherClinicId })).toBeNull();
    await revokePatientSession(db, token);
    expect(await loadPatientSession(db, { token, clinicId })).toBeNull();
  });

  it("expires after 30 days without use", async () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const { token } = await createPatientSession(db, { clinicId, patientId, ip: null, userAgent: null, now: start });
    expect(await loadPatientSession(db, { token, clinicId, now: new Date("2026-01-30T00:00:00Z") })).not.toBeNull();
    expect(await loadPatientSession(db, { token, clinicId, now: new Date("2026-03-15T00:00:00Z") })).toBeNull();
  });

  it("rejects malformed tokens without querying", async () => {
    expect(await loadPatientSession(db, { token: "short", clinicId })).toBeNull();
  });
});
