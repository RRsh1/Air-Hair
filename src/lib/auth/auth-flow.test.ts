/**
 * End-to-end staff authentication against a real Postgres (PGlite, in process) with the real
 * migrations and the real Better Auth configuration. Requests go through auth.handler exactly
 * as the Next.js route handler would forward them.
 */
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { totpFromUri } from "../../../test/totp";
import { captureRules, staffUsers, timelineVersions } from "../../db/schema";
import { fullSchema, type Database } from "../../db/types";
import { provisionClinic, sendSetPasswordLink } from "../clinic/provision";
import { buildAuth, type Auth } from "./build-auth";
import { loadStaffByAuthUser, resolveStaffAccess } from "./staff-access";

const BASE = "http://localhost:3000";
const EMAIL = "admin@clinic.test";
const PASSWORD = "a-long-test-password-123";

let db: Database;
let auth: Auth;
let lastLink = "";
const jar = new Map<string, string>();

async function call(path: string, body?: unknown) {
  const response = await auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE,
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
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

async function currentAccess() {
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }),
  });
  if (!session) return resolveStaffAccess(null, null);
  return resolveStaffAccess(session.user, await loadStaffByAuthUser(db, session.user.id));
}

let clinic: Awaited<ReturnType<typeof provisionClinic>>;
let totpUri = "";

beforeAll(async () => {
  db = drizzle(new PGlite(), { schema: fullSchema }) as unknown as Database;
  await migrate(db as never, { migrationsFolder: "drizzle" });
  auth = buildAuth(db, {
    secret: "test-secret-test-secret-test-secret-0",
    baseURL: BASE,
    secureCookies: false,
    sendPasswordLink: async ({ url }) => {
      lastLink = url;
    },
  });
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
  it("lets the admin set a password from the emailed link", async () => {
    await sendSetPasswordLink(auth, EMAIL, BASE);
    const token = /reset-password\/([^?]+)/.exec(lastLink)?.[1];
    expect(token).toBeTruthy();
    expect((await call("/reset-password", { token, newPassword: PASSWORD })).status).toBe(200);
  });

  it("refuses public sign-up", async () => {
    const result = await call("/sign-up/email", { email: "intruder@test.com", password: PASSWORD, name: "x" });
    expect(result.status).not.toBe(200);
  });

  it("rejects a wrong password", async () => {
    expect((await call("/sign-in/email", { email: EMAIL, password: "wrong-password-123" })).status).toBe(401);
  });

  it("before enrolling 2FA, a session only reaches the enrollment step", async () => {
    expect((await call("/sign-in/email", { email: EMAIL, password: PASSWORD })).status).toBe(200);
    expect((await currentAccess()).state).toBe("needs_2fa_setup");
  });

  it("enrolls TOTP and then grants dashboard access", async () => {
    const enable = await call("/two-factor/enable", { password: PASSWORD });
    expect(enable.status).toBe(200);
    expect(enable.json.backupCodes).toHaveLength(10);
    totpUri = enable.json.totpURI;

    // Not enabled until a code is verified.
    expect((await currentAccess()).state).toBe("needs_2fa_setup");
    expect((await call("/two-factor/verify-totp", { code: totpFromUri(totpUri) })).status).toBe(200);

    const access = await currentAccess();
    expect(access.state).toBe("ok");
    if (access.state === "ok") {
      expect(access.actor).toEqual({ kind: "staff", staffId: clinic.staffId, clinicId: clinic.clinicId, role: "admin" });
    }
  });

  it("after enrollment, sign-in creates no session until the code is verified", async () => {
    await call("/sign-out");
    expect((await currentAccess()).state).toBe("anonymous");

    const signIn = await call("/sign-in/email", { email: EMAIL, password: PASSWORD });
    expect(signIn.json.twoFactorRedirect).toBe(true);
    expect((await currentAccess()).state).toBe("anonymous");
  });

  it("refuses 'trust this device'", async () => {
    const result = await call("/two-factor/verify-totp", { code: totpFromUri(totpUri), trustDevice: true });
    expect(result.status).toBe(400);
    expect((await currentAccess()).state).toBe("anonymous");
  });

  it("rejects a wrong code and accepts the right one", async () => {
    const wrong = (Number(totpFromUri(totpUri)) + 1) % 1_000_000;
    expect((await call("/two-factor/verify-totp", { code: String(wrong).padStart(6, "0") })).status).not.toBe(200);
    expect((await call("/two-factor/verify-totp", { code: totpFromUri(totpUri) })).status).toBe(200);
    expect((await currentAccess()).state).toBe("ok");
  });

  it("locks out disabled staff even with a valid session", async () => {
    await db.update(staffUsers).set({ disabledAt: new Date() }).where(eq(staffUsers.id, clinic.staffId));
    expect((await currentAccess()).state).toBe("disabled");
    await db.update(staffUsers).set({ disabledAt: null }).where(eq(staffUsers.id, clinic.staffId));
  });

  it("treats an auth user without a staff record as no access", () => {
    expect(resolveStaffAccess({ id: "x", email: "x@test.com", twoFactorEnabled: true }, null).state).toBe("not_staff");
  });
});
