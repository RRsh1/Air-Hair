import { sql } from "drizzle-orm";
import { rateLimitBuckets } from "../db/schema";
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
