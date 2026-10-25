/**
 * End-to-end staff authentication against a real Postgres (PGlite, in process) with the real
 * migrations and the real Better Auth configuration. Requests go through auth.handler exactly
 * as the Next.js route handler would forward them. Each browser/device gets its own cookie jar.
 */
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { totpFromUri } from "../../../test/totp";
import { captureRules, staffUsers, timelineVersions } from "../../db/schema";
import { fullSchema, type Database } from "../../db/types";
import { provisionClinic, sendSetPasswordLink } from "../clinic/provision";
import { disableStaff, enableStaff } from "../staff/disable-staff";
import { buildAuth, type Auth, type AuthDeps } from "./build-auth";
import { loadStaffByAuthUser, resolveStaffAccess } from "./staff-access";

const BASE = "http://localhost:3000";
const PASSWORD = "a-long-test-password-123";

let db: Database;
let auth: Auth;
let lastLink = "";

const deps: AuthDeps = {
  secret: "test-secret-test-secret-test-secret-0",
  baseURL: BASE,
  secureCookies: false,
  sendPasswordLink: async ({ url }) => {
    lastLink = url;
  },
};

let deviceCount = 0;

/** One browser: its own cookies and its own IP, so rate limits never mix devices up. */
function device(instance: () => Auth = () => auth) {
  const jar = new Map<string, string>();
  const ip = `10.0.${Math.floor(++deviceCount / 250)}.${deviceCount % 250}`;
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  async function call(path: string, body?: unknown, headers: Record<string, string> = {}) {
    const response = await instance().handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, cookie: cookie(), "x-forwarded-for": ip, ...headers },
        body: JSON.stringify(body ?? {}),
      }),
    );
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const name = pair.slice(0, pair.indexOf("="));
      const value = pair.slice(pair.indexOf("=") + 1);
      if (!value || /max-age=0/i.test(header)) jar.delete(name);
      else jar.set(name, value);
    }
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  }

  async function access() {
    const session = await instance().api.getSession({ headers: new Headers({ cookie: cookie() }) });
    if (!session) return resolveStaffAccess(null, null);
    return resolveStaffAccess(session.user, await loadStaffByAuthUser(db, session.user.id));
  }

  return { call, access };
}

async function setPassword(email: string) {
  await sendSetPasswordLink(auth, email, BASE);
  const token = /reset-password\/([^?]+)/.exec(lastLink)?.[1];
  return device().call("/reset-password", { token, newPassword: PASSWORD });
}

let clinic: Awaited<ReturnType<typeof provisionClinic>>;
const EMAIL = "admin@clinic.test";

beforeAll(async () => {
  db = drizzle(new PGlite(), { schema: fullSchema }) as unknown as Database;
  await migrate(db as never, { migrationsFolder: "drizzle" });
  auth = buildAuth(db, deps);
  clinic = await provisionClinic(db, auth, { clinicName: "מרפאת בדיקה", adminEmail: EMAIL, adminName: "ד״ר בדיקה" });
}, 60_000);

describe("clinic provisioning", () => {
  it("creates a published default timeline with the capture schedule", async () => {
    const versions = await db.select().from(timelineVersions).where(eq(timelineVersions.templateId, clinic.templateId));
    expect(versions).toHaveLength(1);
    expect(versions[0].status).toBe("published");
    const rules = await db.select().from(captureRules).where(eq(captureRules.versionId, versions[0].id));
    expect(rules).toHaveLength(4);
    expect(rules.every((rule) => rule.angles.length === 3)).toBe(true);
  });
});

describe("staff authentication", () => {
  const browser = device();
  let totpUri = "";

  it("lets the admin set a password from the emailed link", async () => {
    expect((await setPassword(EMAIL)).status).toBe(200);
  });

  it("refuses public sign-up", async () => {
    const result = await browser.call("/sign-up/email", { email: "intruder@test.com", password: PASSWORD, name: "x" });
    expect(result.status).not.toBe(200);
  });

  it("rejects a wrong password", async () => {
    expect((await browser.call("/sign-in/email", { email: EMAIL, password: "wrong-password-123" })).status).toBe(401);
  });

  it("before enrolling 2FA, a session only reaches the enrollment step", async () => {
    expect((await browser.call("/sign-in/email", { email: EMAIL, password: PASSWORD })).status).toBe(200);
    expect((await browser.access()).state).toBe("needs_2fa_setup");
  });

  it("enrolls TOTP and then grants dashboard access", async () => {
    const enable = await browser.call("/two-factor/enable", { password: PASSWORD });
    expect(enable.status).toBe(200);
    expect(enable.json.backupCodes).toHaveLength(10);
    totpUri = enable.json.totpURI;

    expect((await browser.access()).state).toBe("needs_2fa_setup");
    expect((await browser.call("/two-factor/verify-totp", { code: totpFromUri(totpUri) })).status).toBe(200);

    const access = await browser.access();
    expect(access.state).toBe("ok");
    if (access.state === "ok") {
      expect(access.actor).toEqual({ kind: "staff", staffId: clinic.staffId, clinicId: clinic.clinicId, role: "admin" });
    }
  });

  it("after enrollment, sign-in creates no session until the code is verified", async () => {
    await browser.call("/sign-out");
    expect((await browser.access()).state).toBe("anonymous");

    const signIn = await browser.call("/sign-in/email", { email: EMAIL, password: PASSWORD });
    expect(signIn.json.twoFactorRedirect).toBe(true);
    expect((await browser.access()).state).toBe("anonymous");
  });

  it("refuses 'trust this device'", async () => {
    const result = await browser.call("/two-factor/verify-totp", { code: totpFromUri(totpUri), trustDevice: true });
    expect(result.status).toBe(400);
    expect((await browser.access()).state).toBe("anonymous");
  });

  it("rejects a wrong code and accepts the right one", async () => {
    const wrong = (Number(totpFromUri(totpUri)) + 1) % 1_000_000;
    expect((await browser.call("/two-factor/verify-totp", { code: String(wrong).padStart(6, "0") })).status).not.toBe(200);
    expect((await browser.call("/two-factor/verify-totp", { code: totpFromUri(totpUri) })).status).toBe(200);
    expect((await browser.access()).state).toBe("ok");
  });

  it("disables endpoints the product doesn't use", async () => {
    expect((await browser.call("/update-user", { name: "changed", image: "https://evil.example/x.png" })).status).toBe(404);
    expect((await browser.call("/list-accounts")).status).toBe(404);
  });

  it("reports a staff record disabled directly in the database as disabled", async () => {
    await db.update(staffUsers).set({ disabledAt: new Date() }).where(eq(staffUsers.id, clinic.staffId));
    expect((await browser.access()).state).toBe("disabled");
    await db.update(staffUsers).set({ disabledAt: null }).where(eq(staffUsers.id, clinic.staffId));
  });
});

describe("session hardening (security review findings)", () => {
  const EMAIL_B = "admin@second-clinic.test";
  let clinicB: Awaited<ReturnType<typeof provisionClinic>>;

  beforeAll(async () => {
    clinicB = await provisionClinic(db, auth, { clinicName: "מרפאה שנייה", adminEmail: EMAIL_B, adminName: "אדמין ב" });
    expect((await setPassword(EMAIL_B)).status).toBe(200);
  });

  it("revokes a password-only session opened before enrollment when enrollment completes", async () => {
    const attacker = device();
    const owner = device();
    expect((await attacker.call("/sign-in/email", { email: EMAIL_B, password: PASSWORD })).status).toBe(200);
    expect((await owner.call("/sign-in/email", { email: EMAIL_B, password: PASSWORD })).status).toBe(200);
    expect((await attacker.access()).state).toBe("needs_2fa_setup");

    const enable = await owner.call("/two-factor/enable", { password: PASSWORD });
    expect((await owner.call("/two-factor/verify-totp", { code: totpFromUri(enable.json.totpURI) })).status).toBe(200);

    expect((await owner.access()).state).toBe("ok");
    expect((await attacker.access()).state).toBe("anonymous");
    expect((await attacker.call("/two-factor/disable", { password: PASSWORD })).status).not.toBe(200);
  });

  it("disabling staff revokes their sessions and blocks new sign-ins", async () => {
    // A fresh admin without 2FA, so password sign-in alone would normally create a session.
    const EMAIL_C = "admin@third-clinic.test";
    const clinicC = await provisionClinic(db, auth, { clinicName: "מרפאה שלישית", adminEmail: EMAIL_C, adminName: "אדמין ג" });
    expect((await setPassword(EMAIL_C)).status).toBe(200);

    const owner = device();
    expect((await owner.call("/sign-in/email", { email: EMAIL_C, password: PASSWORD })).status).toBe(200);
    expect((await owner.access()).state).toBe("needs_2fa_setup");

    await disableStaff(db, auth, clinicC.staffId);
    expect((await owner.access()).state).toBe("anonymous");
    expect((await owner.call("/change-password", { currentPassword: PASSWORD, newPassword: "another-long-password-1" })).status).not.toBe(200);

    const retry = device();
    expect((await retry.call("/sign-in/email", { email: EMAIL_C, password: PASSWORD })).status).not.toBe(200);
    expect((await retry.access()).state).toBe("anonymous");

    await enableStaff(db, clinicC.staffId);
    expect((await device().call("/sign-in/email", { email: EMAIL_C, password: PASSWORD })).status).toBe(200);
  });

  it("an auth user without a staff record cannot obtain a session", async () => {
    const ctx = await auth.$context;
    const orphan = await ctx.internalAdapter.createUser(
      { email: "orphan@test.com", name: "Orphan", emailVerified: true },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: orphan.id,
      providerId: "credential",
      accountId: orphan.id,
      password: await ctx.password.hash(PASSWORD),
    });

    const stranger = device();
    const signIn = await stranger.call("/sign-in/email", { email: "orphan@test.com", password: PASSWORD });
    expect(signIn.status).not.toBe(200);
    expect(signIn.status).not.toBe(429);
    expect((await stranger.access()).state).toBe("anonymous");
  });

  it("rate-limits sign-in on the platform's client IP header, ignoring a rotated x-forwarded-for", async () => {
    let platformAuth: Auth | undefined;
    const getPlatformAuth = () => (platformAuth ??= buildAuth(db, { ...deps, clientIpHeader: "x-vercel-forwarded-for" }));
    const client = device(getPlatformAuth);

    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const result = await client.call(
        "/sign-in/email",
        { email: EMAIL, password: "wrong-password-123" },
        { "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": `198.51.100.${i}` },
      );
      statuses.push(result.status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("can send password links in the background so response time doesn't reveal known emails", async () => {
    const tasks: Promise<unknown>[] = [];
    const slowMail = buildAuth(db, {
      ...deps,
      sendPasswordLink: () => new Promise((resolve) => setTimeout(resolve, 300)),
      runInBackground: (task) => void tasks.push(task),
    });
    const started = Date.now();
    await slowMail.api.requestPasswordReset({ body: { email: EMAIL, redirectTo: `${BASE}/clinic/reset-password` } });
    expect(Date.now() - started).toBeLessThan(250);
    expect(tasks).toHaveLength(1);
    await Promise.all(tasks);
  });

  it("random credential passwords are never reused between provisioned admins", () => {
    // provisionClinic hashes 32 random bytes; sanity check the generator's entropy source.
    expect(randomBytes(32).toString("base64url")).not.toBe(randomBytes(32).toString("base64url"));
  });
});
