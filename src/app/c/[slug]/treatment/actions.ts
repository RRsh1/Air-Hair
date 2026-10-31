"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { treatmentCookieName, treatmentCookieOptions } from "@/lib/journal/selection";
import { getPatientContext } from "@/lib/patient-auth/server";

/** Switches the patient app to another of the patient's own treatments. */
export async function selectTreatmentAction(slug: string, treatmentId: string): Promise<void> {
  const context = await getPatientContext(slug);
  if (!context) redirect(`/c/${slug}/login`);
  if (context.journal.treatments.some((treatment) => treatment.id === treatmentId)) {
    (await cookies()).set(treatmentCookieName, treatmentId, treatmentCookieOptions(slug));
  }
  redirect(`/c/${slug}`);
}
