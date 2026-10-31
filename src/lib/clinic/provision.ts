import { randomBytes } from "node:crypto";
import { branches, clinics, clinicSettings, staffUsers } from "../../db/schema";
import type { Database } from "../../db/types";
import type { Auth } from "../auth/build-auth";
import { parseClinicSettings, type ClinicSettings } from "../clinic-settings/schema";
import { createClinicProcedure } from "../catalog/procedures";
import { isValidTimeZone } from "../timeline/days";

/**
 * Creates a clinic ready to use: settings, its main branch, a published default timeline for a
 * hair transplant (phases + capture schedule, no content yet) and its first admin. The admin gets a Better Auth account with a
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

export type ProvisionResult = { clinicId: string; branchId: string; staffId: string; authUserId: string; templateId: string };

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
    const [branch] = await tx
      .insert(branches)
      .values({ clinicId: clinic.id, name: "סניף ראשי", isMain: true })
      .returning({ id: branches.id });

    const [staff] = await tx
      .insert(staffUsers)
      .values({ clinicId: clinic.id, role: "admin", email, fullName: input.adminName, authUserId: authUser.id })
      .returning({ id: staffUsers.id });

    const { templateId } = await createClinicProcedure(tx as unknown as Database, {
      clinicId: clinic.id,
      name: "השתלת שיער",
      libraryKey: "hair.scalp",
      followUpMonths: settings.followUpMonths,
      staffId: staff.id,
    });

    return { clinicId: clinic.id, branchId: branch.id, staffId: staff.id, authUserId: authUser.id, templateId };
  });
}

/** Sends the "set your password" link (Better Auth reset flow). */
export async function sendSetPasswordLink(auth: Auth, email: string, baseURL: string): Promise<void> {
  await auth.api.requestPasswordReset({
    body: { email: email.trim().toLowerCase(), redirectTo: `${baseURL}/clinic/reset-password` },
  });
}
