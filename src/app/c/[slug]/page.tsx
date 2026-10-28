import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ContentList } from "@/components/patient/content-list";
import { FilmStrip } from "@/components/patient/film-strip";
import { angleLabel, formatDayMonth, photoUrl } from "@/components/patient/format";
import { PatientFooter } from "@/components/patient/patient-footer";
import { PatientHeader } from "@/components/patient/patient-header";
import { buildFilmStrip, contentFor, type Frame } from "@/lib/journal/film-strip";
import { anglesOpenNow } from "@/lib/journal/patient-journal";
import { requireConsentedPatient } from "@/lib/legal/server";
import type { PatientContext } from "@/lib/patient-auth/server";
import { photoAngles } from "@/lib/timeline/capture-schedule";
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
  const now = new Date();
  const frames = buildFilmStrip(context.journal, now);

  return (
    <>
      <PatientHeader slug={slug} clinic={context.clinic} />
      <main className="p-page flex-1 pb-12">
        <Greeting context={context} now={now} />
        <FilmStrip slug={slug} frames={frames} />
        <div className="mx-auto max-w-md space-y-9 px-5 pt-8">
          <TodayCapture slug={slug} context={context} now={now} frames={frames} />
          <section className="p-section">
            <h2 className="p-heading text-[1.25rem]">ההנחיות להיום</h2>
            <div className="mt-3">
              <ContentList items={contentFor(context.journal.content, todayPosition(context, now))} />
            </div>
          </section>
        </div>
      </main>
      <PatientFooter slug={slug} />
    </>
  );
}

function todayPosition(context: PatientContext, now: Date): Pick<Frame, "kind" | "day"> {
  const position = currentPosition(now, context.journal.timing, context.journal.timeZone);
  return position.phase === "pre_op" ? { kind: "pre_op", day: null } : { kind: "post_op", day: position.day };
}

function Greeting({ context, now }: { context: PatientContext; now: Date }) {
  const { journal } = context;
  const position = currentPosition(now, journal.timing, journal.timeZone);
  const today = localDate(now, journal.timeZone);

  return (
    <div className="mx-auto max-w-md px-5 pb-6 pt-4">
      <p className="text-[1.0625rem] text-p-muted">שלום {journal.firstName}</p>
      {position.phase === "post_op" ? (
        <>
          <h1 className="p-title mt-1 text-[2.75rem] leading-none tracking-tight">
            יום {position.day}
            <span className="ms-3 align-middle text-[1.0625rem] font-normal tracking-normal text-p-muted">להחלמה</span>
          </h1>
          <p className="mt-2 text-[1rem] text-p-muted">{formatDayMonth(today)}</p>
        </>
      ) : (
        <>
          <h1 className="p-title mt-1 text-[2rem] leading-tight tracking-tight">לפני הניתוח</h1>
          {journal.timing.status === "scheduled" && (
            <p className="mt-2 text-[1rem] leading-relaxed text-p-muted">
              הניתוח מתוכנן ל-{formatDayMonth(journal.timing.plannedSurgeryDate)}. צלמו עכשיו תיעוד אחד, כדי שתוכלו להשוות אליו לאורך ההחלמה.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TodayCapture({ slug, context, now, frames }: { slug: string; context: PatientContext; now: Date; frames: Frame[] }) {
  const open = anglesOpenNow(context.journal, now);
  const position = todayPosition(context, now);
  const todayKey = position.kind === "pre_op" ? "pre" : String(position.day);
  const todayFrame = frames.find((frame) => frame.key === todayKey);

  if (open.length === 0) {
    const next = frames.find((frame) => frame.status === "upcoming");
    return (
      <section className="p-section">
        <h2 className="p-heading text-[1.25rem]">אין צילום היום</h2>
        <p className="mt-2 text-[1rem] leading-relaxed text-p-muted">
          {next?.date ? `הצילום הבא ביום ${next.day}, ${formatDayMonth(next.date)}.` : "הצילום הבא יופיע כאן כשיגיע מועדו."}
        </p>
      </section>
    );
  }

  const photos = todayFrame?.photos ?? {};
  const done = photoAngles.filter((angle) => photos[angle]).length;

  return (
    <section className="p-section">
      <div className="flex items-baseline justify-between">
        <h2 className="p-heading text-[1.25rem]">הצילום של היום</h2>
        <p className="text-[0.9375rem] tabular-nums text-p-muted">
          {done} מתוך {photoAngles.length}
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2.5">
        {photoAngles.map((angle) => {
          const photo = photos[angle];
          const allowed = open.includes(angle);
          return (
            <li key={angle}>
              <Link
                href={allowed ? `/c/${slug}/capture/${angle}` : "#"}
                aria-disabled={!allowed}
                className={`group relative block aspect-[3/4] overflow-hidden rounded-p ${
                  photo ? "bg-p-film" : "border-2 border-dashed border-p-accent/40 bg-p-surface"
                } ${allowed ? "" : "pointer-events-none opacity-50"}`}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private photo served by an authenticated route
                  <img src={photoUrl(slug, photo.id)} alt={`צילום ${angleLabel[angle]}`} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-p-accent">
                    <CameraIcon />
                  </span>
                )}
                <span
                  className={`absolute inset-x-0 bottom-0 px-2 py-1.5 text-center text-[0.9375rem] font-semibold ${
                    photo ? "bg-gradient-to-t from-black/60 to-transparent pt-6 text-white" : "text-p-ink"
                  }`}
                >
                  {angleLabel[angle]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {done === photoAngles.length && (
        <p className="mt-3 text-[0.9375rem] text-p-muted">התיעוד של היום הושלם. אפשר לצלם שוב כל זווית עד סוף היום.</p>
      )}
    </section>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.4-2h5.8l1.4 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden="true" className="flex-1">
      <div className="mx-auto max-w-md space-y-3 px-5 pb-6 pt-14">
        <div className="h-5 w-24 rounded bg-p-line" />
        <div className="h-10 w-40 rounded bg-p-line" />
      </div>
      <div className="h-[11.5rem] bg-p-film" />
    </div>
  );
}
