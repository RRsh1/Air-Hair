import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { getStaffAccess } from "@/lib/auth/server";
import { canStaff } from "@/lib/authz/policy";
import { isSameOrigin } from "@/lib/net/same-origin";
import { getStorage } from "@/lib/storage";
import { MAX_LOGO_BYTES, uploadLogo } from "@/lib/theme/branding";

const reasons: Record<string, string> = {
  format: "הקובץ צריך להיות PNG או JPEG.",
  size: "הקובץ גדול מ-1MB.",
  dimensions: "מידות הלוגו לא מתאימות: לפחות 64 על 32 פיקסלים ועד 2400.",
};

/** Replaces the clinic logo (PNG, cleaned of metadata). A route handler because of the action body limit. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ status: "forbidden" }, { status: 403 });
  const access = await getStaffAccess();
  if (access.state !== "ok") return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  if (!canStaff(access.actor, "branding.manage", access.staff.settings)) {
    return NextResponse.json({ status: "forbidden", message: "אין לך הרשאה לשנות את המיתוג." }, { status: 403 });
  }
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isInteger(declared) || declared <= 0) return NextResponse.json({ status: "length_required" }, { status: 411 });
  if (declared > MAX_LOGO_BYTES + 64 * 1024) return NextResponse.json({ status: "invalid", message: reasons.size }, { status: 413 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ status: "invalid", message: reasons.format }, { status: 400 });
  const result = await uploadLogo(getDb(), getStorage(), {
    clinicId: access.actor.clinicId,
    bytes: new Uint8Array(await file.arrayBuffer()),
    staffId: access.actor.staffId,
  });
  if (result.status === "saved") return NextResponse.json({ status: "saved", logoId: result.logoId });
  return NextResponse.json({ status: "invalid", message: reasons[result.reason] ?? reasons.format }, { status: 400 });
}
