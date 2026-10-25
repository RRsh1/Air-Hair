"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { smsSenderFor } from "@/lib/clinic/load";
import { getSmsProvider } from "@/lib/notifications/sms";
import { requestLoginCode, verifyLoginCode } from "@/lib/patient-auth/login-code";
import { getClinic, requestIp } from "@/lib/patient-auth/server";
import {
  createPatientSession,
  patientCookieName,
  patientCookiePath,
  revokePatientSession,
} from "@/lib/patient-auth/session";
import { normalizeIsraeliMobile } from "@/lib/validation/phone";

const challengeCookie = "hairair_login";
const secure = process.env.NODE_ENV === "production";

export type LoginState =
  | { step: "identify"; error?: string; nationalId?: string; phone?: string }
  | { step: "code"; phoneEnding: string; error?: string };

export async function requestCodeAction(slug: string, _prev: LoginState, form: FormData): Promise<LoginState> {
  const clinic = await getClinic(slug);
  if (!clinic) return { step: "identify", error: "הכתובת לא שייכת לאף מרפאה." };

  const nationalId = String(form.get("nationalId") ?? "");
  const phone = String(form.get("phone") ?? "");
  const result = await requestLoginCode(getDb(), {
    clinic: { id: clinic.id, smsSender: smsSenderFor(clinic), displayName: clinic.name },
    nationalId,
    phone,
    ip: await requestIp(),
    sms: getSmsProvider(),
  });

  if (result.status === "invalid_input") {
    const error = result.field === "nationalId" ? "מספר תעודת הזהות לא תקין. בדקו את כל 9 הספרות." : "מספר הנייד לא תקין.";
    return { step: "identify", error, nationalId, phone };
  }
  if (result.status === "rate_limited") {
    return { step: "identify", error: "נשלחו יותר מדי קודים. נסו שוב בעוד כמה דקות.", nationalId, phone };
  }

  (await cookies()).set(challengeCookie, result.challengeId, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: patientCookiePath(slug),
    maxAge: 10 * 60,
  });
  return { step: "code", phoneEnding: normalizeIsraeliMobile(phone)?.slice(-4) ?? "" };
}

export async function verifyCodeAction(slug: string, prev: LoginState, form: FormData): Promise<LoginState> {
  const phoneEnding = prev.step === "code" ? prev.phoneEnding : "";
  const clinic = await getClinic(slug);
  const store = await cookies();
  const challengeId = store.get(challengeCookie)?.value;
  if (!clinic || !challengeId) return { step: "identify", error: "פג הזמן. הזינו שוב את הפרטים ונשלח קוד חדש." };

  const ip = await requestIp();
  const result = await verifyLoginCode(getDb(), { clinicId: clinic.id, challengeId, code: String(form.get("code") ?? ""), ip });

  if (result.status === "wrong_code") {
    const left = result.attemptsLeft === 1 ? "נשאר ניסיון אחד" : `נשארו ${result.attemptsLeft} ניסיונות`;
    return { step: "code", phoneEnding, error: `הקוד שגוי, ${left}.` };
  }
  if (result.status !== "ok") {
    store.delete({ name: challengeCookie, path: patientCookiePath(slug) });
    const error = result.status === "locked" ? "יותר מדי ניסיונות שגויים. בקשו קוד חדש." : "הקוד פג תוקף. בקשו קוד חדש.";
    return { step: "identify", error };
  }

  const { token, expiresAt } = await createPatientSession(getDb(), {
    clinicId: clinic.id,
    patientId: result.patientId,
    ip,
    userAgent: null,
  });
  store.delete({ name: challengeCookie, path: patientCookiePath(slug) });
  store.set(patientCookieName, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: patientCookiePath(slug),
    expires: expiresAt,
  });
  redirect(`/c/${slug}`);
}

/** One action for the whole login form: which step runs depends on the submitted fields. */
export async function loginAction(slug: string, prev: LoginState, form: FormData): Promise<LoginState> {
  if (form.get("intent") === "restart") return { step: "identify" };
  return form.has("code") ? verifyCodeAction(slug, prev, form) : requestCodeAction(slug, prev, form);
}

export async function signOutAction(slug: string): Promise<void> {
  const store = await cookies();
  const token = store.get(patientCookieName)?.value;
  if (token) await revokePatientSession(getDb(), token);
  store.delete({ name: patientCookieName, path: patientCookiePath(slug) });
  redirect(`/c/${slug}/login`);
}
