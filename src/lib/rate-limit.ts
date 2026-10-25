import { eq, lt, sql } from "drizzle-orm";
import { otpChallenges, patientSessions, rateLimitBuckets } from "../db/schema";
import type { Database } from "../db/types";

/**
 * Fixed-window rate limit in Postgres (works across serverless instances).
 * Returns true while the caller is within the limit. Keys must not contain raw identifiers:
 * pass digests (blind indexes) or IPs.
 */
export async function withinRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<boolean> {
  const windowStartedBefore = new Date(now.getTime() - windowSeconds * 1000);
  const [row] = await db
    .insert(rateLimitBuckets)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        count: sql`case when ${rateLimitBuckets.windowStart} <= ${windowStartedBefore} then 1 else ${rateLimitBuckets.count} + 1 end`,
        windowStart: sql`case when ${rateLimitBuckets.windowStart} <= ${windowStartedBefore} then ${now} else ${rateLimitBuckets.windowStart} end`,
      },
    })
    .returning({ count: rateLimitBuckets.count });
  return row.count <= limit;
}

/** Current count in a window without adding to it. */
export async function rateLimitCount(db: Database, key: string, windowSeconds: number, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ count: rateLimitBuckets.count, windowStart: rateLimitBuckets.windowStart })
    .from(rateLimitBuckets)
    .where(eq(rateLimitBuckets.key, key))
    .limit(1);
  if (!row || row.windowStart.getTime() <= now.getTime() - windowSeconds * 1000) return 0;
  return row.count;
}

export async function clearRateLimit(db: Database, key: string): Promise<void> {
  await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, key));
}

/**
 * Retention: drops rate-limit windows, login codes and expired patient sessions that no longer
 * matter (they hold IPs). Windows are at most 24 hours; anything older than 2 days is dead.
 */
export async function pruneAuthRecords(db: Database, now: Date = new Date()): Promise<void> {
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
  await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, twoDaysAgo));
  await db.delete(otpChallenges).where(lt(otpChallenges.createdAt, twoDaysAgo));
  await db.delete(patientSessions).where(lt(patientSessions.expiresAt, now));
}
