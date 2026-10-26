import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { MAX_UPLOAD_BYTES } from "@/lib/journal/jpeg";
import { savePatientPhoto } from "@/lib/journal/patient-journal";
import { getConsentStatus } from "@/lib/legal/server";
import { getPatientContext, requestIp } from "@/lib/patient-auth/server";
import { getStorage } from "@/lib/storage";
import { isSameOrigin } from "@/lib/net/same-origin";
import { photoAngles, type PhotoAngle } from "@/lib/timeline/capture-schedule";

/** Upload of one angle of today's capture. The server decides the day; the client never does. */
export async function POST(request: NextRequest, { params }: RouteContext<"/c/[slug]/photos">) {
  const { slug } = await params;
  // Only our own pages may post here (the cookie is SameSite=Lax; this is the second lock).
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const context = await getPatientContext(slug);
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const consent = await getConsentStatus(context.clinic.id, context.journal.patientId);
  if (consent.required && !consent.signedAt) return NextResponse.json({ error: "consent_required" }, { status: 409 });

  // The body is read into memory, so its size must be declared and small.
  const declared = Number(request.headers.get("content-length"));
  if (!request.headers.has("content-length") || !Number.isInteger(declared) || declared <= 0) {
    return NextResponse.json({ error: "length_required" }, { status: 411 });
  }
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const angle = form?.get("angle");
  const file = form?.get("photo");
  if (typeof angle !== "string" || !photoAngles.includes(angle as PhotoAngle) || !(file instanceof Blob)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = await savePatientPhoto(getDb(), getStorage(), {
    journal: context.journal,
    angle: angle as PhotoAngle,
    bytes: new Uint8Array(await file.arrayBuffer()),
    ip: await requestIp(),
  });

  switch (result.status) {
    case "saved":
      return NextResponse.json({ photoId: result.photoId });
    case "not_allowed":
      return NextResponse.json({ error: "not_allowed" }, { status: 409 });
    case "invalid_image":
      return NextResponse.json({ error: result.reason }, { status: 422 });
  }
}
