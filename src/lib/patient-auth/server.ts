import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { loadClinicBySlug, type ClinicRecord } from "@/lib/clinic/load";
import { loadPatientJournal, type PatientJournal } from "@/lib/journal/patient-journal";
import { loadPatientSession, patientCookieName } from "./session";

export type PatientContext = { clinic: ClinicRecord; journal: PatientJournal; sessionId: string };

/** Client IP as set by the platform (Vercel overwrites these headers; clients can't spoof them there). */
export async function requestIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-vercel-forwarded-for") ?? h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || null;
}

export const getClinic = cache(async (slug: string) => loadClinicBySlug(getDb(), slug));

/** The signed-in patient for this clinic, or null. Memoized per request. */
export const getPatientContext = cache(async (slug: string): Promise<PatientContext | null> => {
  const clinic = await getClinic(slug);
  if (!clinic) return null;
  const token = (await cookies()).get(patientCookieName)?.value;
  if (!token) return null;
  const session = await loadPatientSession(getDb(), { token, clinicId: clinic.id });
  if (!session) return null;
  const journal = await loadPatientJournal(getDb(), { clinicId: clinic.id, patientId: session.patientId });
  return journal ? { clinic, journal, sessionId: session.sessionId } : null;
});

/** Guard for every patient page: unknown clinic → 404 page, no session → login. */
export async function requirePatient(slug: string): Promise<PatientContext> {
  const clinic = await getClinic(slug);
  if (!clinic) redirect("/");
  const context = await getPatientContext(slug);
  if (!context) redirect(`/c/${slug}/login`);
  return context;
}
