"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { getAuth } from "@/lib/auth/server";
import { canStaff } from "@/lib/authz/policy";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { sendSetPasswordLink } from "@/lib/clinic/provision";
import { inviteStaff, pendingInviteEmail, setStaffActive, updateStaff, type StaffInput } from "@/lib/staff/manage";

export type StaffFormState = { status: "idle" | "done" | "error"; message?: string; field?: string };

async function manager() {
  const context = await getStaffContext();
  return canStaff(context.actor, "staff.manage", context.settings) ? context : null;
}

function readInput(form: FormData): StaffInput {
  return {
    fullName: String(form.get("fullName") ?? ""),
    manager: form.get("manager") === "on",
    allBranches: form.get("scope") !== "some",
    branchIds: form.getAll("branchIds").map(String),
  };
}

const sendLink = (email: string) => sendSetPasswordLink(getAuth(), email, process.env.BETTER_AUTH_URL ?? "http://localhost:3000");

const fieldMessages = {
  fullName: "שם מלא, בין 2 ל-80 תווים.",
  email: "כתובת אימייל לא תקינה.",
  branches: "בחרו לפחות סניף אחד.",
} as const;

export async function inviteStaffAction(_prev: StaffFormState, form: FormData): Promise<StaffFormState> {
  const context = await manager();
  if (!context) return { status: "error", message: "אין לך הרשאה לנהל את הצוות." };
  const result = await inviteStaff(getDb(), getAuth(), {
    ...readInput(form),
    clinicId: context.actor.clinicId,
    email: String(form.get("email") ?? ""),
    invitedBy: context.actor.staffId,
    sendLink,
  });
  if (result.status === "invalid") return { status: "error", field: result.field, message: fieldMessages[result.field] };
  if (result.status === "email_taken") return { status: "error", field: "email", message: "האימייל הזה כבר רשום במערכת." };
  refresh();
  return { status: "done", message: "נשלח קישור להגדרת סיסמה." };
}

export async function updateStaffAction(staffId: string, _prev: StaffFormState, form: FormData): Promise<StaffFormState> {
  const context = await manager();
  if (!context) return { status: "error", message: "אין לך הרשאה לנהל את הצוות." };
  const result = await updateStaff(getDb(), { ...readInput(form), clinicId: context.actor.clinicId, staffId, actorStaffId: context.actor.staffId });
  switch (result.status) {
    case "saved":
      refresh();
      return { status: "done" };
    case "invalid":
      return { status: "error", field: result.field, message: fieldMessages[result.field] };
    case "self":
      return { status: "error", message: "אי אפשר להוריד לעצמך את הרשאת הניהול או להגביל את עצמך לסניפים. מנהל אחר יכול לעשות זאת." };
    case "last_admin":
      return { status: "error", message: "צריך להישאר לפחות מנהל פעיל אחד עם גישה לכל הסניפים." };
    case "not_found":
      return { status: "error", message: "איש הצוות לא נמצא." };
  }
}

export async function setActiveAction(staffId: string, active: boolean): Promise<StaffFormState> {
  const context = await manager();
  if (!context) return { status: "error", message: "אין לך הרשאה לנהל את הצוות." };
  const result = await setStaffActive(getDb(), getAuth(), { clinicId: context.actor.clinicId, staffId, active, actorStaffId: context.actor.staffId });
  if (result.status === "self") return { status: "error", message: "אי אפשר להשבית את המשתמש שלך." };
  if (result.status === "last_admin") return { status: "error", message: "זה המנהל הפעיל היחיד עם גישה לכל הסניפים." };
  if (result.status === "not_found") return { status: "error", message: "איש הצוות לא נמצא." };
  refresh();
  return { status: "done" };
}

export async function resendInviteAction(staffId: string): Promise<StaffFormState> {
  const context = await manager();
  if (!context) return { status: "error", message: "אין לך הרשאה לנהל את הצוות." };
  const email = await pendingInviteEmail(getDb(), context.actor.clinicId, staffId);
  if (!email) return { status: "error", message: "המשתמש כבר הופעל או מושבת." };
  await sendLink(email);
  return { status: "done", message: "הקישור נשלח שוב." };
}
