import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import * as authSchema from "../../db/auth-schema";

/**
 * Better Auth for CLINIC STAFF only. Patients never get a Better Auth account; they log in with
 * national ID + phone + SMS code through their own flow.
 *
 * Security choices:
 *  - No public sign-up. Staff accounts are created by the clinic (or the bootstrap script).
 *  - TOTP two-factor is mandatory: a session without verified TOTP may only reach the enrollment
 *    page (enforced by requireStaff()). Once enrolled, sign-in creates no session until the code
 *    is verified, so every dashboard session is two-factor verified.
 *  - "Trust this device" is refused server-side: every sign-in asks for a code.
 *  - 12-hour sessions, refreshed hourly while active; password reset revokes all sessions.
 *  - Rate limits are stored in the database so they hold across serverless instances.
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
};

const HOUR = 60 * 60;

// The Drizzle instance type differs per driver (neon, pglite); the adapter only needs the query API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDrizzle = any;

export function buildAuthOptions(db: AnyDrizzle, deps: AuthDeps) {
  return {
    appName: "Hair&Air",
    secret: deps.secret,
    baseURL: deps.baseURL,
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),

    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: HOUR,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => deps.sendPasswordLink({ email: user.email, url }),
    },

    session: {
      expiresIn: 12 * HOUR,
      updateAge: HOUR,
      freshAge: 10 * 60,
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
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith("/two-factor/verify") && ctx.body?.trustDevice) {
          throw new APIError("BAD_REQUEST", { message: "Trusted devices are disabled for clinic staff" });
        }
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
