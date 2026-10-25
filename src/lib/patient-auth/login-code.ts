import { createHash, randomInt, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { auditLog, otpChallenges, patients } from "../../db/schema";
import type { Database } from "../../db/types";
import { hashSecret, nationalIdIndex, phoneIndex, verifySecret, type Keyring } from "../crypto";
import { ipBucket } from "../net/client-ip";
import type { SmsProvider } from "../notifications/sms";
import { clearRateLimit, rateLimitCount, withinRateLimit } from "../rate-limit";
import { normalizeIsraeliId } from "../validation/israeli-id";
import { normalizeIsraeliMobile } from "../validation/phone";

/**
 * Patient login: national ID + mobile number, then a 6-digit SMS code.
 *
 * Privacy: nothing observable depends on whether the patient exists. A request that matches no
 * one still stores a challenge (a "decoy" with no patient) through the same queries, the SMS is
 * sent after the response, and verifying a decoy answers exactly like a wrong code until the
 * challenge locks. Limits are keyed on the (ID, phone) pair that was typed, so they apply to
 * decoys the same way.
 *
 * Codes are stored only as a keyed hash salted with the challenge id, expire after 5 minutes,
 * allow 5 attempts each, are single use, and only the newest works. Across challenges, 10 wrong
 * codes in 24 hours block that (ID, phone) for the rest of the window.
 */

export const CODE_TTL_SECONDS = 5 * 60;
export const MAX_ATTEMPTS = 5;
export const MAX_FAILURES_PER_DAY = 10;

const MINUTES_10 = 10 * 60;
const DAY = 24 * 60 * 60;

export const limits = {
  requestsPerIp: 10,
  requestsPerUnknownIp: 100,
  requestsPerSubject: 3,
  requestsPerSubjectPerDay: 10,
  requestsPerNationalId: 10,
  verifiesPerIp: 30,
  verifiesPerUnknownIp: 300,
} as const;

export type BackgroundRunner = (task: () => Promise<void>) => void;

/** Fallback when no request-scoped runner (Next's after()) is given. */
const fireAndForget: BackgroundRunner = (task) => void task();

export type RequestCodeInput = {
  clinic: { id: string; smsSender: string; displayName: string };
  nationalId: string;
  phone: string;
  ip: string | null;
  sms: SmsProvider;
  /** Runs the SMS send after the response is sent, so timing never depends on it. */
  runInBackground?: BackgroundRunner;
  keyring?: Keyring;
  now?: Date;
};

export type RequestCodeResult =
  | { status: "sent"; challengeId: string }
  | { status: "invalid_input"; field: "nationalId" | "phone" }
  | { status: "rate_limited" };

const subjectKeyFor = (idIdx: string, phoneIdx: string) =>
  createHash("sha256").update(`${idIdx}:${phoneIdx}`).digest("base64url");

const failureKey = (clinicId: string, subjectKey: string) => `otp:fail:${clinicId}:${subjectKey}`;

export async function requestLoginCode(db: Database, input: RequestCodeInput): Promise<RequestCodeResult> {
  const now = input.now ?? new Date();
  const nationalId = normalizeIsraeliId(input.nationalId);
  if (!nationalId) return { status: "invalid_input", field: "nationalId" };
  const phone = normalizeIsraeliMobile(input.phone);
  if (!phone) return { status: "invalid_input", field: "phone" };

  const clinicId = input.clinic.id;
  const idIdx = nationalIdIndex(nationalId, clinicId, input.keyring);
  const phoneIdx = phoneIndex(phone, clinicId, input.keyring);
  const subjectKey = subjectKeyFor(idIdx, phoneIdx);

  // Every bucket is counted on every request, so the work done doesn't depend on which one trips.
  const checks = await Promise.all([
    withinRateLimit(
      db,
      `otp:ip:${ipBucket(input.ip)}`,
      input.ip ? limits.requestsPerIp : limits.requestsPerUnknownIp,
      MINUTES_10,
      now,
    ),
    withinRateLimit(db, `otp:subject:${clinicId}:${subjectKey}`, limits.requestsPerSubject, MINUTES_10, now),
    withinRateLimit(db, `otp:subject-day:${clinicId}:${subjectKey}`, limits.requestsPerSubjectPerDay, DAY, now),
    withinRateLimit(db, `otp:id:${clinicId}:${idIdx}`, limits.requestsPerNationalId, MINUTES_10, now),
  ]);
  if (checks.includes(false)) return { status: "rate_limited" };

  const [[patient], failures] = await Promise.all([
    db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.clinicId, clinicId), eq(patients.nationalIdIdx, idIdx), eq(patients.phoneIdx, phoneIdx)))
      .limit(1),
    rateLimitCount(db, failureKey(clinicId, subjectKey), DAY, now),
  ]);

  const challengeId = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db.transaction(async (tx) => {
    // Only the newest code works.
    await tx
      .update(otpChallenges)
      .set({ consumedAt: now })
      .where(and(eq(otpChallenges.clinicId, clinicId), eq(otpChallenges.subjectKey, subjectKey), isNull(otpChallenges.consumedAt)));
    await tx.insert(otpChallenges).values({
      id: challengeId,
      clinicId,
      patientId: patient?.id ?? null,
      subjectKey,
      codeHash: hashSecret(code, challengeId, input.keyring),
      expiresAt: new Date(now.getTime() + CODE_TTL_SECONDS * 1000),
      ip: input.ip,
      createdAt: now,
    });
  });

  // Blocked subjects get no SMS; verification will answer "blocked" for them (decoys too).
  if (patient && failures < MAX_FAILURES_PER_DAY) {
    const sms = input.sms;
    const message = {
      to: phone,
      sender: input.clinic.smsSender,
      text: `קוד הכניסה שלך ל-${input.clinic.displayName}: ${code}\nהקוד בתוקף ל-5 דקות.`,
    };
    (input.runInBackground ?? fireAndForget)(async () => {
      try {
        await sms.send(message);
      } catch {
        console.error("[patient-login] SMS send failed");
      }
    });
  }
  return { status: "sent", challengeId };
}

export type VerifyCodeResult =
  | { status: "ok"; patientId: string }
  | { status: "wrong_code"; attemptsLeft: number }
  | { status: "expired" }
  | { status: "locked" }
  | { status: "blocked" }
  | { status: "rate_limited" };

export async function verifyLoginCode(
  db: Database,
  input: { clinicId: string; challengeId: string; code: string; ip: string | null; keyring?: Keyring; now?: Date },
): Promise<VerifyCodeResult> {
  const now = input.now ?? new Date();
  const code = input.code.replace(/\D/g, "");
  if (!/^[0-9a-f-]{36}$/.test(input.challengeId)) return { status: "expired" };

  const ipOk = await withinRateLimit(
    db,
    `otp:verify-ip:${ipBucket(input.ip)}`,
    input.ip ? limits.verifiesPerIp : limits.verifiesPerUnknownIp,
    MINUTES_10,
    now,
  );
  if (!ipOk) return { status: "rate_limited" };

  // Count the attempt first, atomically, so parallel guesses can't exceed the limit.
  const [challenge] = await db
    .update(otpChallenges)
    .set({ attempts: sql`${otpChallenges.attempts} + 1` })
    .where(
      and(
        eq(otpChallenges.id, input.challengeId),
        eq(otpChallenges.clinicId, input.clinicId),
        isNull(otpChallenges.consumedAt),
        gt(otpChallenges.expiresAt, now),
        lt(otpChallenges.attempts, MAX_ATTEMPTS),
      ),
    )
    .returning({
      id: otpChallenges.id,
      patientId: otpChallenges.patientId,
      subjectKey: otpChallenges.subjectKey,
      codeHash: otpChallenges.codeHash,
      attempts: otpChallenges.attempts,
    });

  if (!challenge) {
    const [existing] = await db
      .select({ attempts: otpChallenges.attempts })
      .from(otpChallenges)
      .where(and(eq(otpChallenges.id, input.challengeId), eq(otpChallenges.clinicId, input.clinicId)))
      .limit(1);
    return existing && existing.attempts >= MAX_ATTEMPTS ? { status: "locked" } : { status: "expired" };
  }

  const failKey = failureKey(input.clinicId, challenge.subjectKey);
  if ((await rateLimitCount(db, failKey, DAY, now)) >= MAX_FAILURES_PER_DAY) return { status: "blocked" };

  // A decoy has no patient: it fails like a wrong code, whatever was typed.
  const matches = code.length === 6 && verifySecret(code, challenge.id, challenge.codeHash, input.keyring);
  if (!matches || !challenge.patientId) {
    await withinRateLimit(db, failKey, MAX_FAILURES_PER_DAY, DAY, now);
    await db.insert(auditLog).values({
      clinicId: input.clinicId,
      actorKind: "patient",
      actorId: challenge.patientId,
      action: "patient.login_failed",
      patientId: challenge.patientId,
      ip: input.ip,
    });
    const attemptsLeft = MAX_ATTEMPTS - challenge.attempts;
    return attemptsLeft > 0 ? { status: "wrong_code", attemptsLeft } : { status: "locked" };
  }

  const [consumed] = await db
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id });
  if (!consumed) return { status: "expired" };

  await clearRateLimit(db, failKey);
  await db.insert(auditLog).values({
    clinicId: input.clinicId,
    actorKind: "patient",
    actorId: challenge.patientId,
    action: "patient.login",
    patientId: challenge.patientId,
    ip: input.ip,
  });
  return { status: "ok", patientId: challenge.patientId };
}
