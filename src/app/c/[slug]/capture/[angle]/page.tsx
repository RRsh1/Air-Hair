import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { angleHint, angleLabel, photoUrl } from "@/components/patient/format";
import { anglesOpenNow, ghostPhotoFor } from "@/lib/journal/patient-journal";
import { requireConsentedPatient } from "@/lib/legal/server";
import { photoAngles, type PhotoAngle } from "@/lib/timeline/capture-schedule";
import { Camera } from "./camera";

export default function CapturePage({ params }: PageProps<"/c/[slug]/capture/[angle]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-black" aria-hidden="true" />}>
      <CaptureBody params={params} />
    </Suspense>
  );
}

async function CaptureBody({ params }: Pick<PageProps<"/c/[slug]/capture/[angle]">, "params">) {
  await connection();
  const { slug, angle } = await params;
  if (!photoAngles.includes(angle as PhotoAngle)) notFound();
  const context = await requireConsentedPatient(slug);
  const now = new Date();
  if (!anglesOpenNow(context.journal, now).includes(angle as PhotoAngle)) redirect(`/c/${slug}`);

  const ghostId = ghostPhotoFor(context.journal, angle as PhotoAngle, now);
  return (
    <Camera
      slug={slug}
      angle={angle as PhotoAngle}
      label={angleLabel[angle as PhotoAngle]}
      hint={angleHint[angle as PhotoAngle]}
      ghostUrl={ghostId ? photoUrl(slug, ghostId) : null}
    />
  );
}
