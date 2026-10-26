import { getDb } from "@/db/client";
import { publishedDocument } from "@/lib/legal/documents";
import { getClinic } from "@/lib/patient-auth/server";
import { getStorage } from "@/lib/storage";

/** Serves a clinic's published PDF document (privacy policy, consent). Not patient data. */
export async function GET(_request: Request, { params }: RouteContext<"/c/[slug]/legal/[documentId]">) {
  const { slug, documentId } = await params;
  const clinic = await getClinic(slug);
  const document = clinic ? await publishedDocument(getDb(), clinic.id, documentId) : null;
  const object = document?.storageKey ? await getStorage().get(document.storageKey) : null;
  if (!document || !object) return new Response(null, { status: 404 });

  return new Response(Buffer.from(object.body), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${document.kind === "consent" ? "consent" : "privacy-policy"}-v${document.version}.pdf"`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
