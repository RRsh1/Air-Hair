"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { canStaff } from "@/lib/authz/policy";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { publishTheme } from "@/lib/theme/branding";

export type PublishResult = { status: "published"; version: number } | { status: "error"; message: string };

/** Publishes the draft theme to the clinic's patients. The server re-validates and re-checks contrast. */
export async function publishThemeAction(tokens: unknown): Promise<PublishResult> {
  const context = await getStaffContext();
  if (!canStaff(context.actor, "branding.manage", context.settings)) return { status: "error", message: "אין לך הרשאה לשנות את המיתוג." };
  const result = await publishTheme(getDb(), { clinicId: context.actor.clinicId, tokens, staffId: context.actor.staffId });
  if (result.status === "unreadable") return { status: "error", message: "יש צירופי צבעים שקשה לקרוא. תקנו אותם ונסו שוב." };
  refresh();
  return { status: "published", version: result.version };
}
