import { getDb } from "@/db/client";
import { photoKeyForPatient } from "@/lib/journal/patient-journal";
import { getPatientContext } from "@/lib/patient-auth/server";
import { getStorage } from "@/lib/storage";

/** Serves a photo to the patient it belongs to. Never cached by shared caches. */
export async function GET(_request: Request, { params }: RouteContext<"/c/[slug]/photos/[photoId]">) {
  const { slug, photoId } = await params;
  const context = await getPatientContext(slug);
  if (!context) return new Response(null, { status: 401 });

  const key = await photoKeyForPatient(getDb(), {
    clinicId: context.clinic.id,
    patientId: context.journal.patientId,
    photoId,
  });
  const object = key ? await getStorage().get(key) : null;
  if (!object) return new Response(null, { status: 404 });

  return new Response(Buffer.from(object.body), {
    headers: {
      "content-type": object.contentType,
      "cache-control": "private, max-age=3600, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
