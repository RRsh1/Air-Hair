import { randomInt, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { auditLog, otpChallenges, patients } from "../../db/schema";
import type { Database } from "../../db/types";
import { hashSecret, nationalIdIndex, phoneIndex, verifySecret, type Keyring } from "../crypto";
import type { SmsProvider } from "../notifications/sms";
import { withinRateLimit } from "../rate-limit";
import { normalizeIsraeliId } from "../validation/israeli-id";
import { normalizeIsraeliMobile } from "../validation/phone";

/**
 * Patient login: national ID + mobile number, then a 6-digit SMS code.
 *
 * Privacy: the response never reveals whether a patient exists. A request that matches no one
 * still returns a challenge id; it simply can never be verified. Codes are stored only as a
 * keyed hash salted with the challenge id, expire after 5 minutes, allow 5 attempts, and are
 * single use. Requests are rate-limited per IP and per (clinic, ID number).
 */

export const CODE_TTL_SECONDS = 5 * 60;
export const MAX_ATTEMPTS = 5;

export type RequestCodeInput = {
  clinic: { id: string; smsSender: string; displayName: string };
  nationalId: string;
  phone: string;
  ip: string | null;
  sms: SmsProvider;
  keyring?: Keyring;
  now?: Date;
};

export type RequestCodeResult =
  | { status: "sent"; challengeId: string }
  | { status: "invalid_input"; field: "nationalId" | "phone" }
  | { status: "rate_limited" };

export async function requestLoginCode(db: Database, input: RequestCodeInput): Promise<RequestCodeResult> {
  const now = input.now ?? new Date();
  const nationalId = normalizeIsraeliId(input.nationalId);
  if (!nationalId) return { status: "invalid_input", field: "nationalId" };
  const phone = normalizeIsraeliMobile(input.phone);
  if (!phone) return { status: "invalid_input", field: "phone" };

  const idIdx = nationalIdIndex(nationalId, input.clinic.id, input.keyring);
  const phoneIdx = phoneIndex(phone, input.clinic.id, input.keyring);

  const perIp = input.ip ? await withinRateLimit(db, `otp:ip:${input.ip}`, 10, 10 * 60, now) : true;
  const perPerson = await withinRateLimit(db, `otp:id:${input.clinic.id}:${idIdx}`, 3, 10 * 60, now);
  if (!perIp || !perPerson) return { status: "rate_limited" };

  const challengeId = randomUUID();
  const [patient] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.clinicId, input.clinic.id), eq(patients.nationalIdIdx, idIdx), eq(patients.phoneIdx, phoneIdx)))
    .limit(1);
  if (!patient) return { status: "sent", challengeId };

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db.transaction(async (tx) => {
    // Only the newest code works.
    await tx
      .update(otpChallenges)
      .set({ consumedAt: now })
      .where(and(eq(otpChallenges.patientId, patient.id), isNull(otpChallenges.consumedAt)));
    await tx.insert(otpChallenges).values({
      id: challengeId,
      patientId: patient.id,
      codeHash: hashSecret(code, challengeId, input.keyring),
      expiresAt: new Date(now.getTime() + CODE_TTL_SECONDS * 1000),
      ip: input.ip,
      createdAt: now,
    });
  });

  await input.sms.send({
    to: phone,
    sender: input.clinic.smsSender,
    text: `קוד הכניסה שלך ל-${input.clinic.displayName}: ${code}\nהקוד בתוקף ל-5 דקות.`,
  });
  return { status: "sent", challengeId };
}

export type VerifyCodeResult =
  | { status: "ok"; patientId: string }
  | { status: "wrong_code"; attemptsLeft: number }
  | { status: "expired" }
  | { status: "locked" };

export async function verifyLoginCode(
  db: Database,
  input: { clinicId: string; challengeId: string; code: string; ip: string | null; keyring?: Keyring; now?: Date },
): Promise<VerifyCodeResult> {
  const now = input.now ?? new Date();
  const code = input.code.replace(/\D/g, "");
  if (!/^[0-9a-f-]{36}$/.test(input.challengeId)) return { status: "expired" };

  // Count the attempt first, atomically, so parallel guesses can't exceed the limit.
  const [challenge] = await db
    .update(otpChallenges)
    .set({ attempts: sql`${otpChallenges.attempts} + 1` })
    .where(
      and(
        eq(otpChallenges.id, input.challengeId),
        isNull(otpChallenges.consumedAt),
        gt(otpChallenges.expiresAt, now),
        lt(otpChallenges.attempts, MAX_ATTEMPTS),
        sql`exists (select 1 from ${patients} where ${patients.id} = ${otpChallenges.patientId} and ${patients.clinicId} = ${input.clinicId})`,
      ),
    )
    .returning({ id: otpChallenges.id, patientId: otpChallenges.patientId, codeHash: otpChallenges.codeHash, attempts: otpChallenges.attempts });

  if (!challenge) {
    const [existing] = await db
      .select({ attempts: otpChallenges.attempts })
      .from(otpChallenges)
      .where(eq(otpChallenges.id, input.challengeId))
      .limit(1);
    return existing && existing.attempts >= MAX_ATTEMPTS ? { status: "locked" } : { status: "expired" };
  }

  if (code.length !== 6 || !verifySecret(code, challenge.id, challenge.codeHash, input.keyring)) {
    const attemptsLeft = MAX_ATTEMPTS - challenge.attempts;
    return attemptsLeft > 0 ? { status: "wrong_code", attemptsLeft } : { status: "locked" };
  }

  const [consumed] = await db
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id });
  if (!consumed) return { status: "expired" };

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
