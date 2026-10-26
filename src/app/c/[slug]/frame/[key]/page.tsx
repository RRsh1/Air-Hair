import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ContentList } from "@/components/patient/content-list";
import { formatDayMonth } from "@/components/patient/format";
import { PatientHeader } from "@/components/patient/patient-header";
import { buildFilmStrip, contentFor } from "@/lib/journal/film-strip";
import { requireConsentedPatient } from "@/lib/legal/server";
import { CompareView, type ComparableFrame } from "./compare-view";

export default function FramePage({ params }: PageProps<"/c/[slug]/frame/[key]">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-hidden="true" />}>
      <FrameBody params={params} />
    </Suspense>
  );
}

async function FrameBody({ params }: Pick<PageProps<"/c/[slug]/frame/[key]">, "params">) {
  await connection();
  const { slug, key } = await params;
  const context = await requireConsentedPatient(slug);
  const frames = buildFilmStrip(context.journal, new Date());
  const frame = frames.find((f) => f.key === key);
  if (!frame || frame.status === "upcoming" || frame.status === "locked") notFound();

  const title = frame.kind === "pre_op" ? "לפני הניתוח" : `יום ${frame.day}`;
  const comparable: ComparableFrame[] = frames
    .filter((f) => Object.keys(f.photos).length > 0)
    .map((f) => ({ key: f.key, title: f.kind === "pre_op" ? "לפני הניתוח" : `יום ${f.day}`, photos: f.photos }));

  return (
    <>
      <PatientHeader slug={slug} clinicName={context.clinic.name} back />
      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-12 pt-3">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{title}</h1>
        {frame.date && <p className="mt-1 text-[1rem] text-p-muted">{formatDayMonth(frame.date)}</p>}

        <div className="mt-6">
          {Object.keys(frame.photos).length === 0 ? (
            <p className="rounded-p border border-dashed border-p-line px-4 py-6 text-center text-[1rem] text-p-muted">
              {frame.status === "today" ? "עוד לא צילמתם היום." : "לא צולמו תמונות ביום הזה."}
            </p>
          ) : (
            <CompareView slug={slug} current={frame.key} frames={comparable} />
          )}
        </div>

        <section className="mt-10">
          <h2 className="text-[1.25rem] font-semibold">ההנחיות ליום הזה</h2>
          <div className="mt-3">
            <ContentList items={contentFor(context.journal.content, frame)} />
          </div>
        </section>
      </main>
    </>
  );
}
