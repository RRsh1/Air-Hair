import { randomBytes } from "node:crypto";
import { captureRules, clinics, clinicSettings, staffUsers, timelinePhases, timelineTemplates, timelineVersions } from "../../db/schema";
import type { Database } from "../../db/types";
import type { Auth } from "../auth/build-auth";
import { parseClinicSettings, type ClinicSettings } from "../clinic-settings/schema";
import { defaultCaptureRules } from "../timeline/capture-schedule";
import { isValidTimeZone } from "../timeline/days";

/**
 * Creates a clinic ready to use: settings, a published default timeline (phases + capture
 * schedule, no content yet) and its first admin. The admin gets a Better Auth account with a
 * random password they never see; they set their own through the password link.
 */

export type ProvisionInput = {
  clinicName: string;
  /** Patient app address: /c/<slug>. Lowercase letters, digits and hyphens. */
  slug: string;
  timeZone?: string;
  adminEmail: string;
  adminName: string;
  settings?: Partial<ClinicSettings>;
};

export type ProvisionResult = { clinicId: string; staffId: string; authUserId: string; templateId: string };

const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

/** Lowercases and validates a clinic slug; null when it can't be a URL segment. */
export function normalizeClinicSlug(input: string): string | null {
  const slug = input.trim().toLowerCase();
  return SLUG.test(slug) ? slug : null;
}

export async function provisionClinic(db: Database, auth: Auth, input: ProvisionInput): Promise<ProvisionResult> {
  const timeZone = input.timeZone ?? "Asia/Jerusalem";
  const slug = normalizeClinicSlug(input.slug);
  if (!slug) throw new Error(`Invalid clinic slug: ${input.slug} (use lowercase letters, digits and hyphens)`);
  if (!isValidTimeZone(timeZone)) throw new Error(`Invalid time zone: ${timeZone}`);
  const email = input.adminEmail.trim().toLowerCase();
  const settings = parseClinicSettings(input.settings ?? {});

  // Auth user first: Better Auth owns its tables and hashing. If the clinic insert fails,
  // the orphan auth user has no staff record and therefore no access.
  const ctx = await auth.$context;
  const authUser = await ctx.internalAdapter.createUser(
    { email, name: input.adminName, emailVerified: true },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: authUser.id,
    providerId: "credential",
    accountId: authUser.id,
    password: await ctx.password.hash(randomBytes(32).toString("base64url")),
  });

  return db.transaction(async (tx) => {
    const [clinic] = await tx.insert(clinics).values({ name: input.clinicName, slug, timeZone }).returning({ id: clinics.id });
    await tx.insert(clinicSettings).values({ clinicId: clinic.id, settings });

    const [staff] = await tx
      .insert(staffUsers)
      .values({ clinicId: clinic.id, role: "admin", email, fullName: input.adminName, authUserId: authUser.id })
      .returning({ id: staffUsers.id });

    const [template] = await tx
      .insert(timelineTemplates)
      .values({ clinicId: clinic.id, name: "השתלת שיער" })
      .returning({ id: timelineTemplates.id });

    const [version] = await tx
      .insert(timelineVersions)
      .values({ templateId: template.id, version: 1, status: "published", publishedAt: new Date(), publishedBy: staff.id })
      .returning({ id: timelineVersions.id });

    await tx.insert(timelinePhases).values([
      { versionId: version.id, phase: "pre_op", name: "לפני הניתוח", sortOrder: 0 },
      { versionId: version.id, phase: "post_op", fromDay: 0, toDay: settings.followUpMonths * 30, name: "החלמה", sortOrder: 1 },
    ]);

    await tx.insert(captureRules).values(
      defaultCaptureRules(settings.followUpMonths).map((rule) =>
        rule.phase === "pre_op"
          ? { versionId: version.id, phase: rule.phase, maxCount: rule.maxCount, angles: [...rule.angles] }
          : {
              versionId: version.id,
              phase: rule.phase,
              fromDay: rule.fromDay,
              toDay: rule.toDay,
              everyDays: rule.everyDays,
              angles: [...rule.angles],
            },
      ),
    );

    return { clinicId: clinic.id, staffId: staff.id, authUserId: authUser.id, templateId: template.id };
  });
}

/** Sends the "set your password" link (Better Auth reset flow). */
export async function sendSetPasswordLink(auth: Auth, email: string, baseURL: string): Promise<void> {
  await auth.api.requestPasswordReset({
    body: { email: email.trim().toLowerCase(), redirectTo: `${baseURL}/clinic/reset-password` },
  });
}
