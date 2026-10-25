import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { and, eq, isNull } from "drizzle-orm";
import * as authSchema from "../../db/auth-schema";
import { staffUsers } from "../../db/schema";

/**
 * Better Auth for CLINIC STAFF only. Patients never get a Better Auth account; they log in with
 * national ID + phone + SMS code through their own flow.
 *
 * Security choices:
 *  - No public sign-up. Staff accounts are created by the clinic (or the bootstrap script).
 *  - Sessions are only ever created for an ACTIVE staff member: auth users without a staff record,
 *    or whose staff record is disabled, cannot sign in at all (session.create hook).
 *  - TOTP two-factor is mandatory: a session without verified TOTP may only reach the enrollment
 *    page (enforced by requireStaff()). Once enrolled, sign-in creates no session until the code
 *    is verified. Completing enrollment revokes every OTHER session of that user, so a
 *    password-only session opened before enrollment can never be promoted to full access.
 *  - "Trust this device" is refused server-side: every sign-in asks for a code.
 *  - 12-hour sessions, refreshed hourly while active; password reset revokes all sessions.
 *  - Rate limits are stored in the database and keyed on a client IP header the platform
 *    sets itself (Vercel overwrites x-vercel-forwarded-for), so clients can't rotate it.
 *  - Endpoints the product doesn't use are disabled; telemetry is off.
 *
 * Kept free of path aliases and "server-only" so the Better Auth CLI and tests can load it.
 */

export type AuthDeps = {
  secret: string;
  baseURL: string;
  /** Delivers password set/reset links. Wire to the email provider once chosen. */
  sendPasswordLink: (args: { email: string; url: string }) => Promise<void>;
  /** Tests run over plain http and need non-secure cookies. */
  secureCookies?: boolean;
  /** Header holding the real client IP, set by the hosting platform (not the client). */
  clientIpHeader?: string;
  /**
   * Runs work after the response is sent (e.g. Next.js `after`). Used for outgoing email so a
   * known address doesn't answer slower than an unknown one. Without it, work is awaited inline.
   */
  runInBackground?: (task: Promise<unknown>) => void;
};

const HOUR = 60 * 60;

/** Better Auth endpoints the staff product never uses; disabled so they can't be abused. */
const DISABLED_PATHS = [
  "/update-user",
  "/change-email",
  "/delete-user",
  "/list-accounts",
  "/link-social",
  "/unlink-account",
  "/list-sessions",
];

// The Drizzle instance type differs per driver (neon, pglite); the adapter only needs the query API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDrizzle = any;

async function isActiveStaff(db: AnyDrizzle, authUserId: string): Promise<boolean> {
  const rows = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(and(eq(staffUsers.authUserId, authUserId), isNull(staffUsers.disabledAt)))
    .limit(1);
  return rows.length > 0;
}

export function buildAuthOptions(db: AnyDrizzle, deps: AuthDeps) {
  return {
    appName: "Hair&Air",
    secret: deps.secret,
    baseURL: deps.baseURL,
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    telemetry: { enabled: false },
    disabledPaths: DISABLED_PATHS,

    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: HOUR,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const task = deps.sendPasswordLink({ email: user.email, url });
        if (deps.runInBackground) deps.runInBackground(task);
        else await task;
      },
    },

    session: {
      expiresIn: 12 * HOUR,
      updateAge: HOUR,
      freshAge: 10 * 60,
    },

    databaseHooks: {
      session: {
        create: {
          // Returning false aborts session creation: sign-in and 2FA completion both fail.
          before: async (session) => (await isActiveStaff(db, session.userId)) ? undefined : false,
        },
      },
    },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60 * 15, max: 3 },
        "/two-factor/*": { window: 60, max: 10 },
      },
    },

    advanced: {
      cookiePrefix: "hairair",
      useSecureCookies: deps.secureCookies ?? true,
      ...(deps.clientIpHeader ? { ipAddress: { ipAddressHeaders: [deps.clientIpHeader] } } : {}),
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith("/two-factor/verify") && ctx.body?.trustDevice) {
          throw new APIError("BAD_REQUEST", { message: "Trusted devices are disabled for clinic staff" });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // A 2FA call made WITH an existing session that issued a new session is the enrollment
        // step (Better Auth rotates the session there). Revoke every other session of the user.
        const issued = ctx.context.newSession;
        if (!ctx.path.startsWith("/two-factor/") || !issued) return;
        const hadSession = ctx.request?.headers.get("cookie")?.includes(ctx.context.authCookies.sessionToken.name);
        if (!hadSession) return;
        const sessions = await ctx.context.internalAdapter.listSessions(issued.user.id);
        const others = sessions.filter((s) => s.token !== issued.session.token).map((s) => s.token);
        if (others.length > 0) await ctx.context.internalAdapter.deleteSessions(others);
      }),
    },

    plugins: [
      twoFactor({
        issuer: "Hair&Air",
        totpOptions: { digits: 6, period: 30 },
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 15 * 60 },
      }),
      nextCookies(), // must stay last
    ],
  } satisfies BetterAuthOptions;
}

export function buildAuth(db: AnyDrizzle, deps: AuthDeps) {
  return betterAuth(buildAuthOptions(db, deps));
}

export type Auth = ReturnType<typeof buildAuth>;
