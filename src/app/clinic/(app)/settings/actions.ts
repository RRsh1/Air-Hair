"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { canStaff } from "@/lib/authz/policy";
import { archiveBranch, createBranch, renameBranch } from "@/lib/branches/branches";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { saveClinicProfile } from "@/lib/clinic-settings/save";

export type SettingsState = { status: "idle" | "saved" | "error"; message?: string; field?: string };

async function manager() {
  const context = await getStaffContext();
  return canStaff(context.actor, "settings.manage", context.settings) ? context : null;
}

const fieldMessages: Record<string, string> = {
  name: "שם המרפאה, בין 2 ל-80 תווים.",
  smsSenderName: "עד 11 תווים באנגלית, ספרות ורווחים, עם לפחות אות אחת.",
  followUpMonths: "בחרו את משך המעקב.",
};

export async function saveSettingsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const context = await manager();
  if (!context) return { status: "error", message: "אין לך הרשאה לשנות הגדרות." };
  const sender = String(form.get("smsSenderName") ?? "").trim();
  const result = await saveClinicProfile(getDb(), {
    clinicId: context.actor.clinicId,
    name: String(form.get("name") ?? ""),
    settings: {
      smsSenderName: sender === "" ? null : sender,
      followUpMonths: Number(form.get("followUpMonths")),
      structuralChangesApplyTo: form.get("structuralChangesApplyTo") === "all_patients" ? "all_patients" : "new_patients",
    },
    staffId: context.actor.staffId,
  });
  if (result.status === "invalid") return { status: "error", field: result.field, message: fieldMessages[result.field] ?? "אחד הערכים לא תקין." };
  refresh();
  return { status: "saved" };
}

export async function addBranchAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const context = await manager();
  if (!context) return { status: "error", message: "אין לך הרשאה לנהל סניפים." };
  const result = await createBranch(getDb(), { clinicId: context.actor.clinicId, name: String(form.get("name") ?? "") });
  if (result.status === "invalid") return { status: "error", field: "name", message: "שם הסניף, בין 2 ל-80 תווים." };
  refresh();
  return { status: "saved" };
}

export async function renameBranchAction(branchId: string, _prev: SettingsState, form: FormData): Promise<SettingsState> {
  const context = await manager();
  if (!context) return { status: "error", message: "אין לך הרשאה לנהל סניפים." };
  const result = await renameBranch(getDb(), { clinicId: context.actor.clinicId, branchId, name: String(form.get("name") ?? "") });
  if (result === "invalid") return { status: "error", field: "name", message: "שם הסניף, בין 2 ל-80 תווים." };
  if (result === "not_found") return { status: "error", message: "הסניף לא נמצא." };
  refresh();
  return { status: "saved" };
}

export async function archiveBranchAction(branchId: string): Promise<SettingsState> {
  const context = await manager();
  if (!context) return { status: "error", message: "אין לך הרשאה לנהל סניפים." };
  const result = await archiveBranch(getDb(), { clinicId: context.actor.clinicId, branchId });
  if (result === "main") return { status: "error", message: "אי אפשר להעביר לארכיון את הסניף הראשי." };
  if (result === "has_active") return { status: "error", message: "יש בסניף טיפולים פעילים. אפשר להעביר אותו לארכיון אחרי שיסתיימו." };
  if (result === "not_found") return { status: "error", message: "הסניף לא נמצא." };
  refresh();
  return { status: "saved" };
}
