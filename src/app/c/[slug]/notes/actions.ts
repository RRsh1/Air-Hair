"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { MAX_NOTE_LENGTH, saveDayNote } from "@/lib/journal/notes";
import { getConsentStatus } from "@/lib/legal/server";
import { getPatientContext, requestIp } from "@/lib/patient-auth/server";

export type NoteState = { status: "idle" | "saved" | "error"; text: string; message?: string };

/** Saves the patient's note for one day (empty text deletes it). */
export async function saveNoteAction(slug: string, date: string, _prev: NoteState, form: FormData): Promise<NoteState> {
  const text = String(form.get("note") ?? "").slice(0, MAX_NOTE_LENGTH + 1);
  const context = await getPatientContext(slug);
  if (!context) return { status: "error", text, message: "החיבור הסתיים. היכנסו שוב כדי לשמור." };
  const consent = await getConsentStatus(context.clinic.id, context.journal.patientId);
  if (consent.required && !consent.signedAt) return { status: "error", text, message: "צריך לחתום על מסמך ההסכמה לפני כתיבת הערות." };

  const result = await saveDayNote(getDb(), { journal: context.journal, date, text, ip: await requestIp() });
  if (result.status === "invalid") {
    return {
      status: "error",
      text,
      message: result.reason === "too_long" ? `ההערה ארוכה מדי. עד ${MAX_NOTE_LENGTH} תווים.` : "אפשר לכתוב הערות רק להיום ולימים שעברו.",
    };
  }
  refresh();
  return { status: "saved", text: result.status === "saved" ? result.text : "" };
}
