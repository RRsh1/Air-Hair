import { getDb } from "@/db/client";
import { getStaffAccess } from "@/lib/auth/server";
import { photoKeyForStaff } from "@/lib/clinic-patients/patients";
import { getStorage } from "@/lib/storage";

/**
 * Serves a patient photo to a staff member who may see that patient (access policy). The view of
 * the patient card is audited; individual photo fetches are not. Never cached.
 */
export async function GET(_request: Request, { params }: RouteContext<"/clinic/photos/[photoId]">) {
  const { photoId } = await params;
  const access = await getStaffAccess();
  if (access.state !== "ok") return new Response(null, { status: 401 });

  const key = await photoKeyForStaff(getDb(), { actor: access.actor, settings: access.staff.settings }, photoId);
  const object = key ? await getStorage().get(key) : null;
  if (!object) return new Response(null, { status: 404 });

  return new Response(Buffer.from(object.body), {
    headers: {
      "content-type": object.contentType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}
