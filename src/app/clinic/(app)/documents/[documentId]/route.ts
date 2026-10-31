import { getDb } from "@/db/client";
import { getStaffAccess } from "@/lib/auth/server";
import { publishedDocument } from "@/lib/legal/documents";
import { getStorage } from "@/lib/storage";

/** A published PDF document of the staff member's clinic (any version, for review). */
export async function GET(_request: Request, { params }: RouteContext<"/clinic/documents/[documentId]">) {
  const { documentId } = await params;
  const access = await getStaffAccess();
  if (access.state !== "ok") return new Response(null, { status: 401 });
  const document = await publishedDocument(getDb(), access.actor.clinicId, documentId);
  const object = document?.storageKey ? await getStorage().get(document.storageKey) : null;
  if (!document || !object) return new Response(null, { status: 404 });
  return new Response(Buffer.from(object.body), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${document.kind === "consent" ? "consent" : "privacy-policy"}-v${document.version}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
