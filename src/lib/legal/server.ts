import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { requirePatient, type PatientContext } from "@/lib/patient-auth/server";
import { consentStatus } from "./documents";

/** Consent status for the signed-in patient, memoized per request. */
export const getConsentStatus = cache((clinicId: string, patientId: string) =>
  consentStatus(getDb(), { clinicId, patientId }),
);

/**
 * Guard for every patient page after login: a patient who hasn't signed the clinic's current
 * consent document is sent to sign it first.
 */
export async function requireConsentedPatient(slug: string): Promise<PatientContext> {
  const context = await requirePatient(slug);
  const status = await getConsentStatus(context.clinic.id, context.journal.patientId);
  if (status.required && !status.signedAt) redirect(`/c/${slug}/consent`);
  return context;
}
