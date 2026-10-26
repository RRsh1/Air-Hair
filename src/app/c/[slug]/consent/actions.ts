"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { MAX_SIGNATURE_BYTES, recordConsent } from "@/lib/legal/documents";
import { getPatientContext, requestIp } from "@/lib/patient-auth/server";
import { getStorage } from "@/lib/storage";

export type ConsentFormState = { error?: string };

export async function signConsentAction(
  slug: string,
  documentId: string,
  _prev: ConsentFormState,
  form: FormData,
): Promise<ConsentFormState> {
  const context = await getPatientContext(slug);
  if (!context) redirect(`/c/${slug}/login`);

  if (form.get("agree") !== "on") return { error: "סמנו שקראתם את המסמך ואתם מסכימים לו." };
  const signature = form.get("signature");
  if (!(signature instanceof Blob) || signature.size === 0 || signature.size > MAX_SIGNATURE_BYTES) {
    return { error: "החתימה לא נקלטה. חתמו שוב בתוך המסגרת." };
  }

  const result = await recordConsent(getDb(), getStorage(), {
    clinicId: context.clinic.id,
    patientId: context.journal.patientId,
    documentId,
    signaturePng: new Uint8Array(await signature.arrayBuffer()),
    ip: await requestIp(),
    userAgent: (await headers()).get("user-agent"),
  });

  switch (result.status) {
    case "signed":
    case "already_signed":
      redirect(`/c/${slug}`);
    case "stale_document":
      // The clinic published a new version meanwhile: show it.
      redirect(`/c/${slug}/consent?updated=1`);
    case "invalid_signature":
      return { error: "החתימה לא נקלטה. חתמו שוב בתוך המסגרת." };
  }
}
