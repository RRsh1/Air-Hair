import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { getStaffAccess } from "@/lib/auth/server";
import { canStaff } from "@/lib/authz/policy";
import { MAX_PDF_BYTES, publishLegalDocument, type LegalKind } from "@/lib/legal/documents";
import { isSameOrigin } from "@/lib/net/same-origin";
import { getStorage } from "@/lib/storage";

/**
 * Publishes a new version of a clinic document from the dashboard (plain form post, multipart).
 * A route handler rather than a server action, because a PDF can be larger than the action body limit.
 * Always answers with a redirect back to the documents screen carrying the outcome.
 */
export async function POST(request: NextRequest) {
  const back = (query: string) => NextResponse.redirect(new URL(`/clinic/documents?${query}`, request.url), 303);
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const access = await getStaffAccess();
  if (access.state !== "ok") return new Response(null, { status: 401 });
  if (!canStaff(access.actor, "legal.manage", access.staff.settings)) return back("error=forbidden");

  const declared = Number(request.headers.get("content-length"));
  if (!Number.isInteger(declared) || declared <= 0) return new Response(null, { status: 411 });
  if (declared > MAX_PDF_BYTES + 256 * 1024) return back("error=too_large");

  const form = await request.formData().catch(() => null);
  const kind = form?.get("kind");
  if (kind !== "consent" && kind !== "privacy_policy") return back("error=bad_request");
  const format = form?.get("format");
  const file = form?.get("pdf");
  const content =
    format === "file"
      ? file instanceof Blob && file.size > 0
        ? { format: "file" as const, pdf: new Uint8Array(await file.arrayBuffer()) }
        : null
      : { format: "text" as const, text: String(form?.get("text") ?? "") };
  if (!content) return back(`error=empty&kind=${kind}`);

  const result = await publishLegalDocument(getDb(), getStorage(), {
    clinicId: access.actor.clinicId,
    kind: kind as LegalKind,
    content,
    staffId: access.actor.staffId,
  });
  return result.status === "published" ? back(`published=${kind}&version=${result.version}`) : back(`error=${result.reason}&kind=${kind}`);
}
