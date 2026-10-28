import { getDb } from "@/db/client";
import { getClinic } from "@/lib/patient-auth/server";
import { getStorage } from "@/lib/storage";
import { logoObject } from "@/lib/theme/branding";

/** The clinic's logo. Public; each upload gets a new id, so it can be cached for good. */
export async function GET(_request: Request, { params }: RouteContext<"/c/[slug]/logo/[logoId]">) {
  const { slug, logoId } = await params;
  const clinic = await getClinic(slug);
  const logo = clinic ? await logoObject(getDb(), { clinicId: clinic.id, logoId }) : null;
  const object = logo ? await getStorage().get(logo.storageKey) : null;
  if (!logo || !object) return new Response(null, { status: 404 });

  return new Response(Buffer.from(object.body), {
    headers: {
      "content-type": logo.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
