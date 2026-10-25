import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase, testKeyring } from "../../../test/db";
import { auditLog, otpChallenges, patients } from "../../db/schema";
import type { Database } from "../../db/types";
import { buildAuth } from "../auth/build-auth";
import { provisionClinic } from "../clinic/provision";
import { decryptField, hashSecret } from "../crypto";
import type { SmsProvider } from "../notifications/sms";
import { createPatient } from "../patients/create-patient";
import { limits, MAX_FAILURES_PER_DAY, requestLoginCode, verifyLoginCode } from "./login-code";
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

/** A valid Israeli ID number (check digit) built from n. */
function validId(n: number): string {
  const body = String(n).padStart(8, "0");
  const sum = [...body].reduce((acc, ch, i) => {
    const d = Number(ch) * (i % 2 === 0 ? 1 : 2);
    return acc + (d > 9 ? d - 9 : d);
  }, 0);
  return body + ((10 - (sum % 10)) % 10);
}

/** Requests a code and then runs what was scheduled for after the response (the SMS). */
async function request(overrides: Partial<Parameters<typeof requestLoginCode>[1]> = {}) {
  const background: (() => Promise<void>)[] = [];
  const result = await requestLoginCode(db, {
    clinic: { id: clinicId, smsSender: "HairAir", displayName: "מרפאת בדיקה" },
    nationalId: ID,
    phone: PHONE,
    ip: freshIp(),
    sms,
    runInBackground: (task) => void background.push(task),
    keyring,
    now: nextWindow(),
    ...overrides,
  });
  for (const task of background) await task();
  return result;
}

const verify = (challengeId: string, code: string, extra: { ip?: string | null; now?: Date; clinicId?: string } = {}) =>
  verifyLoginCode(db, { clinicId: extra.clinicId ?? clinicId, challengeId, code, ip: extra.ip ?? freshIp(), keyring, now: extra.now });

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

  it("answers the same way for unknown people, through verification, and sends nothing", async () => {
    const before = sent.length;
    const real = await request();
    const realCode = lastCode();
    const unknown = await request({ nationalId: "000000018" });
    const wrongPhone = await request({ phone: "0527654321" });
    expect(sent.length).toBe(before + 1);
    if (real.status !== "sent" || unknown.status !== "sent" || wrongPhone.status !== "sent") throw new Error("expected sent");

    const wrong = realCode === "000000" ? "111111" : "000000";
    const run = async (challengeId: string, codes: string[]) => {
      const out = [];
      for (const code of codes) out.push(await verify(challengeId, code));
      return out;
    };
    const attempts = [wrong, wrong, wrong, wrong, wrong, wrong];
    const realOutcomes = await run(real.challengeId, attempts);
    expect(await run(unknown.challengeId, attempts)).toEqual(realOutcomes);
    expect(await run(wrongPhone.challengeId, attempts)).toEqual(realOutcomes);
    expect(realOutcomes.map((o) => o.status)).toEqual(["wrong_code", "wrong_code", "wrong_code", "wrong_code", "locked", "locked"]);

    const decoy = await db.select().from(otpChallenges).where(eq(otpChallenges.id, unknown.challengeId));
    expect(decoy).toHaveLength(1);
    expect(decoy[0].patientId).toBeNull();
  });

  it("never logs in through a decoy, even with the code it was given", async () => {
    const decoy = await request({ nationalId: validId(4242) });
    if (decoy.status !== "sent") throw new Error("expected sent");
    const [row] = await db.select().from(otpChallenges).where(eq(otpChallenges.id, decoy.challengeId));
    expect(row.patientId).toBeNull();
    // No code was ever sent; even if someone knew the stored code, it is a wrong code.
    await db.update(otpChallenges).set({ codeHash: hashSecret("123456", decoy.challengeId, keyring) }).where(eq(otpChallenges.id, decoy.challengeId));
    expect((await verify(decoy.challengeId, "123456")).status).toBe("wrong_code");
  });

  it("sends the SMS only after the response", async () => {
    const before = sent.length;
    let scheduled: (() => Promise<void>) | undefined;
    const result = await requestLoginCode(db, {
      clinic: { id: clinicId, smsSender: "HairAir", displayName: "מרפאת בדיקה" },
      nationalId: ID,
      phone: PHONE,
      ip: freshIp(),
      sms,
      runInBackground: (task) => void (scheduled = task),
      keyring,
      now: nextWindow(),
    });
    expect(result.status).toBe("sent");
    expect(sent.length).toBe(before);
    await scheduled!();
    expect(sent.length).toBe(before + 1);
  });

  it("answers the same when sending fails", async () => {
    const failing: SmsProvider = { send: async () => Promise.reject(new Error("provider down")) };
    const result = await request({ sms: failing });
    expect(result.status).toBe("sent");
  });

  it("is scoped to the clinic", async () => {
    const result = await request();
    if (result.status !== "sent") throw new Error("expected sent");
    const crossClinic = await verify(result.challengeId, lastCode(), { clinicId: otherClinicId });
    expect(crossClinic.status).toBe("expired");
    expect((await verify(result.challengeId, lastCode())).status).toBe("ok");
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

  it("rate-limits requests per (ID, phone), so knowing an ID alone can't lock the patient out", async () => {
    const id = validId(6060);
    const phone = "0546666666";
    const created = await createPatient(db, { clinicId, fullName: "בדיקת מגבלה", nationalId: id, phone, plannedSurgeryDate: "2026-11-01" }, keyring);
    expect(created.status).toBe("created");
    const sameWindow = nextWindow();
    const wrongPhone = [];
    for (let i = 0; i < 4; i++) wrongPhone.push((await request({ nationalId: id, phone: "0529999999", now: sameWindow })).status);
    expect(wrongPhone).toEqual(["sent", "sent", "sent", "rate_limited"]);
    expect((await request({ nationalId: id, phone, now: sameWindow })).status).toBe("sent");
  });

  it("caps requests per ID across phone numbers", async () => {
    const id = validId(5151);
    const sameWindow = nextWindow();
    const statuses = [];
    for (let i = 0; i <= limits.requestsPerNationalId; i++) statuses.push((await request({ nationalId: id, phone: `05290000${String(i).padStart(2, "0")}`, now: sameWindow })).status);
    expect(statuses.at(-1)).toBe("rate_limited");
    expect(statuses.slice(0, -1).every((s) => s === "sent")).toBe(true);
  });

  it("puts requests without a trusted IP in one shared bucket", async () => {
    const sameWindow = nextWindow();
    let last = "";
    for (let i = 0; i <= limits.requestsPerUnknownIp; i++) last = (await request({ nationalId: validId(70000 + i), ip: null, now: sameWindow })).status;
    expect(last).toBe("rate_limited");
    expect((await request({ nationalId: validId(79999), now: sameWindow })).status).toBe("sent"); // a known IP is unaffected
  });

  it("rate-limits verification per IP", async () => {
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i <= limits.verifiesPerIp; i++) statuses.push((await verify(crypto.randomUUID(), "123456", { ip })).status);
    expect(statuses.at(-1)).toBe("rate_limited");
    expect(statuses.at(-2)).toBe("expired");
  });

  it("rejects malformed input with the field name", async () => {
    expect(await request({ nationalId: "12" })).toEqual({ status: "invalid_input", field: "nationalId" });
    expect(await request({ phone: "abc" })).toEqual({ status: "invalid_input", field: "phone" });
  });
});

describe("wrong codes across challenges", () => {
  const BLOCK_ID = validId(8080);
  const BLOCK_PHONE = "0548888888";
  let blockPatientId = "";

  beforeAll(async () => {
    const created = await createPatient(db, { clinicId, fullName: "חסום לבדיקה", nationalId: BLOCK_ID, phone: BLOCK_PHONE, plannedSurgeryDate: "2026-11-01" }, keyring);
    if (created.status !== "created") throw new Error(created.status);
    blockPatientId = created.patientId;
  });

  /** Two challenges, five wrong codes each, then a third request; all inside one day. */
  async function exhaust(nationalId: string, phone: string, start: Date) {
    const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
    const statuses: string[] = [];
    for (const [i, minute] of [0, 15].entries()) {
      const challenge = await request({ nationalId, phone, now: at(minute) });
      if (challenge.status !== "sent") throw new Error(`request ${i}: ${challenge.status}`);
      for (let k = 0; k < 5; k++) statuses.push((await verify(challenge.challengeId, "000001", { now: at(minute + 1) })).status);
    }
    const before = sent.length;
    const third = await request({ nationalId, phone, now: at(30) });
    if (third.status !== "sent") throw new Error(third.status);
    const smsSent = sent.length - before;
    statuses.push((await verify(third.challengeId, lastCode(), { now: at(31) })).status);
    return { statuses, smsSent };
  }

  it(`blocks an (ID, phone) for the day after ${MAX_FAILURES_PER_DAY} wrong codes, and decoys behave the same`, async () => {
    const start = new Date("2026-12-01T08:00:00Z");
    const real = await exhaust(BLOCK_ID, BLOCK_PHONE, start);
    const decoy = await exhaust(validId(9090), "0547777777", start);
    expect(real.statuses.at(-1)).toBe("blocked");
    expect(real.smsSent).toBe(0);
    expect(decoy).toEqual(real);

    // A day later the window has passed: the code arrives and works.
    const nextDay = new Date(start.getTime() + 25 * 3_600_000);
    const fresh = await request({ nationalId: BLOCK_ID, phone: BLOCK_PHONE, now: nextDay });
    if (fresh.status !== "sent") throw new Error(fresh.status);
    expect(await verify(fresh.challengeId, lastCode(), { now: nextDay })).toEqual({ status: "ok", patientId: blockPatientId });
  });

  it("records failed attempts in the audit log without identifiers", async () => {
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "patient.login_failed"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.patientId === blockPatientId)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(BLOCK_ID);
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
