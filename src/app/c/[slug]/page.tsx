import { connection } from "next/server";
import { Suspense } from "react";
import { CaptureBlock } from "@/components/patient/blocks/capture";
import { GuidanceBlock } from "@/components/patient/blocks/guidance";
import { HeroBlock } from "@/components/patient/blocks/hero";
import { RulerBlock } from "@/components/patient/blocks/ruler";
import { PatientFooter } from "@/components/patient/patient-footer";
import { PatientHeader } from "@/components/patient/patient-header";
import { photoLogo } from "@/components/patient/photo";
import { TimelineBlock } from "@/components/patient/timeline/timeline-block";
import { buildFilmStrip, contentFor } from "@/lib/journal/film-strip";
import { anglesOpenNow } from "@/lib/journal/patient-journal";
import { requireConsentedPatient } from "@/lib/legal/server";
import { getClinicBranding, logoUrl } from "@/lib/theme/server";
import { maxScheduleDay } from "@/lib/timeline/capture-schedule";
import { currentPosition, localDate } from "@/lib/timeline/days";

export default function PatientHome({ params }: PageProps<"/c/[slug]">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home params={params} />
    </Suspense>
  );
}

async function Home({ params }: Pick<PageProps<"/c/[slug]">, "params">) {
  await connection(); // sessions and "today" depend on the request time
  const { slug } = await params;
  const context = await requireConsentedPatient(slug);
  const { theme, logoId } = await getClinicBranding(context.clinic.id);
  const { journal, clinic } = context;
  const blocks = theme.blocks;

  const now = new Date();
  const today = localDate(now, journal.timeZone);
  const frames = buildFilmStrip(journal, now);
  const position = currentPosition(now, journal.timing, journal.timeZone);
  const logo = photoLogo(theme, logoId ? logoUrl(slug, logoId) : null);
  const todayFrame = frames.find((f) => (position.phase === "pre_op" ? f.key === "pre" : f.key === String(position.day)));
  const next = frames.find((f) => f.status === "upcoming");
  const planned = journal.timing.status === "scheduled" ? journal.timing.plannedSurgeryDate : null;
  const surgeryDate = journal.timing.status === "performed" ? journal.timing.actualSurgeryDate : journal.timing.plannedSurgeryDate;

  return (
    <>
      <PatientHeader slug={slug} clinic={clinic} />
      <main className="flex-1">
        <HeroBlock
          config={blocks.hero}
          data={{
            firstName: journal.firstName,
            today,
            position: position.phase === "post_op" ? { phase: "post_op", day: position.day } : { phase: "pre_op" },
            plannedSurgeryDate: planned,
          }}
        />
        <RulerBlock
          config={blocks.ruler}
          data={{
            day: position.phase === "post_op" ? position.day : null,
            totalDays: maxScheduleDay(clinic.settings.followUpMonths),
            plannedSurgeryDate: planned,
          }}
        />
        <TimelineBlock
          config={blocks.timeline}
          data={{ slug, frames, logo, today, surgeryDate, surgeryDone: journal.timing.status === "performed" }}
        />
        <div className="space-y-10 pt-9">
          <CaptureBlock
            config={blocks.capture}
            data={{
              slug,
              open: anglesOpenNow(journal, now),
              photos: todayFrame?.photos ?? {},
              next: next ? { day: next.day, date: next.date } : null,
              logo,
            }}
          />
          <GuidanceBlock
            config={blocks.guidance}
            items={contentFor(journal.content, position.phase === "pre_op" ? { kind: "pre_op", day: null } : { kind: "post_op", day: position.day })}
          />
        </div>
      </main>
      <PatientFooter slug={slug} />
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden="true" className="flex-1">
      <div className="mx-auto max-w-md space-y-3 px-5 pb-6 pt-16">
        <div className="h-4 w-20 rounded bg-p-line" />
        <div className="h-12 w-36 rounded bg-p-line" />
        <div className="h-4 w-28 rounded bg-p-line" />
      </div>
    </div>
  );
}
