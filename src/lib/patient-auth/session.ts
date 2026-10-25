import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { patientSessions } from "../../db/schema";
import type { Database } from "../../db/types";
import { SESSION_DAYS } from "./cookie";

/**
 * Patient sessions: a random 32-byte token in an httpOnly cookie scoped to /c/<clinic>.
 * Only the SHA-256 of the token is stored. 30 days, extended while the patient keeps using the app:
 * the row once a day here, the cookie on every visit by src/proxy.ts.
 */

const DAY_MS = 86_400_000;
const REFRESH_AFTER_MS = DAY_MS;

export { SESSION_DAYS, patientCookieName, patientCookiePath, patientSessionMaxAge } from "./cookie";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createPatientSession(
  db: Database,
  input: { clinicId: string; patientId: string; ip: string | null; userAgent: string | null; now?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
  await db.insert(patientSessions).values({
    clinicId: input.clinicId,
    patientId: input.patientId,
    tokenHash: hashToken(token),
    expiresAt,
    createdAt: now,
    lastSeenAt: now,
    ip: input.ip,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

/** The patient behind a session token, if the session is valid for this clinic. */
export async function loadPatientSession(
  db: Database,
  input: { token: string; clinicId: string; now?: Date },
): Promise<{ sessionId: string; patientId: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) return null;
  const now = input.now ?? new Date();
  const [session] = await db
    .select({ id: patientSessions.id, patientId: patientSessions.patientId, lastSeenAt: patientSessions.lastSeenAt })
    .from(patientSessions)
    .where(
      and(
        eq(patientSessions.tokenHash, hashToken(input.token)),
        eq(patientSessions.clinicId, input.clinicId),
        gt(patientSessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!session) return null;

  if (now.getTime() - session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    await db
      .update(patientSessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS) })
      .where(eq(patientSessions.id, session.id));
  }
  return { sessionId: session.id, patientId: session.patientId };
}

export async function revokePatientSession(db: Database, token: string): Promise<void> {
  await db.delete(patientSessions).where(eq(patientSessions.tokenHash, hashToken(token)));
}

/** Signs a patient out everywhere (e.g. after the clinic changes their phone number). */
export async function revokeAllPatientSessions(db: Database, patientId: string): Promise<void> {
  await db.delete(patientSessions).where(eq(patientSessions.patientId, patientId));
}
