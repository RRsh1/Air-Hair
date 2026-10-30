"use client";

import Link from "next/link";
import { useState } from "react";
import { angleLabel, formatDayMonth, photoUrl } from "@/components/patient/format";
import { Photo } from "@/components/patient/photo";
import type { Frame } from "@/lib/journal/film-strip";
import { photoAngles } from "@/lib/timeline/capture-schedule";
import { frameHref, frameTitle, isOpenable, statusText, type TimelineData } from "./shared";

/** Which stretch of the recovery a frame belongs to; a new stretch opens a section on the rail. */
function stretchOf(frame: Frame): string {
  if (frame.kind === "pre_op") return "לפני הניתוח";
  const day = frame.day ?? 0;
  if (day === 0) return "יום הניתוח";
  if (day <= 7) return "השבוע הראשון";
  if (day <= 14) return "השבוע השני";
  if (day <= 30) return "החודש הראשון";
  return `חודש ${Math.ceil(day / 30.44)}`;
}

const UPCOMING_SHOWN = 2;

/**
 * The recovery as a written record: one row per capture day along a rail, grouped into stretches
 * (first week, second week, month 2…). Upcoming days beyond the next two fold away.
 */
export function JournalView({ data }: { data: TimelineData }) {
  const [showAll, setShowAll] = useState(false);
  const firstUpcoming = data.frames.findIndex((f) => f.status === "upcoming" || f.status === "locked");
  const cut = firstUpcoming === -1 ? data.frames.length : firstUpcoming + UPCOMING_SHOWN;
  const shown = showAll ? data.frames : data.frames.slice(0, cut);
  const hidden = data.frames.length - shown.length;

  let lastStretch = "";
  return (
    <div className="mx-auto w-full max-w-md px-5">
      <ol className="relative">
        <span aria-hidden="true" className="absolute bottom-3 start-[4.75rem] top-3 w-px bg-tl-line" />
        {shown.map((frame) => {
          const stretch = stretchOf(frame);
          const opens = stretch !== lastStretch;
          lastStretch = stretch;
          return (
            <li key={frame.key}>
              {opens && (
                <p className="relative ms-[6rem] pb-2 pt-5 text-[0.8125rem] font-medium text-tl-muted first:pt-1">{stretch}</p>
              )}
              <JournalRow data={data} frame={frame} />
            </li>
          );
        })}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="ms-[6rem] mt-1 text-[0.9375rem] font-medium text-tl-accent underline-offset-4 hover:underline"
        >
          עוד {hidden} צילומים מתוכננים
        </button>
      )}
    </div>
  );
}

function JournalRow({ data, frame }: { data: TimelineData; frame: Frame }) {
  const openable = isOpenable(frame);
  const today = frame.status === "today";
  const anyPhoto = photoAngles.some((a) => frame.photos[a]);

  const node = (
    <span
      aria-hidden="true"
      className={`absolute start-[4.75rem] top-[1.15rem] h-[11px] w-[11px] -translate-x-1/2 rounded-full border-2 rtl:translate-x-1/2 ${
        frame.status === "done"
          ? "border-tl-accent bg-tl-accent"
          : today
            ? "border-tl-accent bg-p-bg"
            : frame.status === "partial"
              ? "border-tl-accent bg-tl-tint"
              : "border-tl-line bg-p-bg"
      }`}
    />
  );

  const content = (
    <div className="relative flex gap-0 py-2.5">
      <div className="w-[4.25rem] shrink-0 pt-1">
        <p className={`p-numeral text-[1.3125rem] leading-6 ${openable ? "text-tl-ink" : "text-tl-muted"}`}>
          {frame.kind === "pre_op" ? "לפני" : frame.day}
        </p>
        <p className="mt-0.5 text-[0.75rem] text-tl-muted">{frame.date ? formatDayMonth(frame.date) : statusText[frame.status]}</p>
      </div>
      {node}
      <div className="ms-[1.75rem] min-w-0 flex-1">
        {anyPhoto ? (
          <div className="grid grid-cols-3 gap-1.5">
            {photoAngles.map((angle) => {
              const photo = frame.photos[angle];
              return photo ? (
                <Photo
                  key={angle}
                  src={photoUrl(data.slug, photo.id)}
                  alt={`${frameTitle(frame)}, ${angleLabel[angle]}`}
                  logo={data.logo}
                  className="aspect-[3/4] rounded-[calc(var(--p-radius)*0.5)] bg-tl-tint"
                />
              ) : (
                <span key={angle} className="p-hatch aspect-[3/4] rounded-[calc(var(--p-radius)*0.5)] text-tl-line" />
              );
            })}
          </div>
        ) : (
          <p className={`pt-1.5 text-[0.9375rem] ${today ? "font-medium text-tl-accent" : "text-tl-muted"}`}>
            {today ? "הצילום של היום מחכה לך" : frame.status === "missed" ? "לא צולם" : statusText[frame.status]}
          </p>
        )}
      </div>
    </div>
  );

  return openable ? (
    <Link href={frameHref(data.slug, frame)} aria-label={`${frameTitle(frame)}, ${statusText[frame.status]}`} className="block rounded-p">
      {content}
    </Link>
  ) : (
    <div className={frame.status === "upcoming" || frame.status === "locked" ? "opacity-70" : ""}>{content}</div>
  );
}
