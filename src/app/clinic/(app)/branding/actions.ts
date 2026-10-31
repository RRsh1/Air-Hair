"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { canStaff } from "@/lib/authz/policy";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { activeBranchId } from "@/lib/branches/branches";
import { getStorage } from "@/lib/storage";
import { publishTheme, resetBranchBranding } from "@/lib/theme/branding";

export type PublishResult = { status: "published"; version: number } | { status: "error"; message: string };

/**
 * Publishes the draft theme to the clinic's patients (or to one branch's patients, stored as its
 * differences from the organization). The server re-validates and re-checks contrast.
 */
export async function publishThemeAction(tokens: unknown, branchId: string | null = null): Promise<PublishResult> {
  const context = await getStaffContext();
  if (!canStaff(context.actor, "branding.manage", context.settings)) return { status: "error", message: "אין לך הרשאה לשנות את המיתוג." };
  const db = getDb();
  if (branchId && !(await activeBranchId(db, context.actor.clinicId, branchId))) return { status: "error", message: "הסניף לא נמצא." };
  const result = await publishTheme(db, { clinicId: context.actor.clinicId, branchId, tokens, staffId: context.actor.staffId });
  if (result.status === "unreadable") return { status: "error", message: "יש צירופי צבעים שקשה לקרוא. תקנו אותם ונסו שוב." };
  refresh();
  return { status: "published", version: result.version };
}

/** Removes a branch's own theme and logo; its patients see the organization's branding again. */
export async function resetBranchAction(branchId: string): Promise<PublishResult> {
  const context = await getStaffContext();
  if (!canStaff(context.actor, "branding.manage", context.settings)) return { status: "error", message: "אין לך הרשאה לשנות את המיתוג." };
  const db = getDb();
  if (!(await activeBranchId(db, context.actor.clinicId, branchId))) return { status: "error", message: "הסניף לא נמצא." };
  await resetBranchBranding(db, getStorage(), { clinicId: context.actor.clinicId, branchId, staffId: context.actor.staffId });
  refresh();
  return { status: "published", version: 0 };
}
