import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { GuidanceBlock } from "@/components/patient/blocks/guidance";
import { formatDayMonth } from "@/components/patient/format";
import { PatientHeader } from "@/components/patient/patient-header";
import { photoLogo } from "@/components/patient/photo";
import { buildFilmStrip, contentFor } from "@/lib/journal/film-strip";
import { requireConsentedPatient } from "@/lib/legal/server";
import { getClinicBranding, logoUrl } from "@/lib/theme/server";
import { CompareView, type ComparableFrame } from "./compare-view";

export default function FramePage({ params }: PageProps<"/c/[slug]/frame/[key]">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-hidden="true" />}>
      <FrameBody params={params} />
    </Suspense>
  );
}

const titleOf = (f: { kind: string; day: number | null }) => (f.kind === "pre_op" ? "לפני הניתוח" : f.day === 0 ? "יום הניתוח" : `יום ${f.day}`);

async function FrameBody({ params }: Pick<PageProps<"/c/[slug]/frame/[key]">, "params">) {
  await connection();
  const { slug, key } = await params;
  const context = await requireConsentedPatient(slug);
  const frames = buildFilmStrip(context.journal, new Date());
  const frame = frames.find((f) => f.key === key);
  if (!frame || frame.status === "upcoming" || frame.status === "locked") notFound();

  const { theme, logoId } = await getClinicBranding(context.clinic.id);
  const logo = photoLogo(theme, logoId ? logoUrl(slug, logoId) : null);
  const comparable: ComparableFrame[] = frames
    .filter((f) => Object.keys(f.photos).length > 0)
    .map((f) => ({ key: f.key, title: titleOf(f), fileTag: f.kind === "pre_op" ? "pre-op" : `day-${f.day}`, photos: f.photos }));

  return (
    <>
      <PatientHeader slug={slug} clinic={context.clinic} back />
      <main className="mx-auto w-full max-w-md flex-1 pb-12 pt-3">
        <div className="px-5">
          <h1 className="p-title p-numeral text-[2.125rem] leading-tight text-hr-ink">{titleOf(frame)}</h1>
          {frame.date && <p className="mt-1 text-[0.9375rem] text-p-muted">{formatDayMonth(frame.date)}</p>}
        </div>

        <div className="mt-6 px-5">
          {Object.keys(frame.photos).length === 0 ? (
            <p className="rounded-p border border-dashed border-p-line px-4 py-6 text-center text-[1rem] text-p-muted">
              {frame.status === "today" ? "עוד לא צילמתם היום." : "לא צולמו תמונות ביום הזה."}
            </p>
          ) : (
            <CompareView slug={slug} current={frame.key} frames={comparable} logo={logo} logoOpacity={theme.logo.opacity} />
          )}
        </div>

        <div className="mt-11">
          <GuidanceBlock config={theme.blocks.guidance} items={contentFor(context.journal.content, frame)} title="ההנחיות ליום הזה" />
        </div>
      </main>
    </>
  );
}
