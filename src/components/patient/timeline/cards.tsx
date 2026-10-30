"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { angleLabel, formatDayMonth, photoUrl } from "@/components/patient/format";
import { Photo } from "@/components/patient/photo";
import type { Frame } from "@/lib/journal/film-strip";
import { photoAngles } from "@/lib/timeline/capture-schedule";
import { focusFrame, frameHref, frameTitle, isOpenable, statusText, type TimelineData } from "./shared";

/**
 * One day at a time, as large as the screen allows: the front photo leads, top and back stand
 * beside it. Swipe between days; the next planned day closes the deck.
 */
export function CardsView({ data }: { data: TimelineData }) {
  const nextPlanned = data.frames.find((f) => f.status === "upcoming" || f.status === "locked");
  const frames = [...data.frames.filter(isOpenable), ...(nextPlanned ? [nextPlanned] : [])];
  const focusKey = focusFrame(frames)?.key;
  const listRef = useRef<HTMLOListElement>(null);
  const [index, setIndex] = useState(Math.max(0, frames.findIndex((f) => f.key === focusKey)));

  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
    // Only on mount: afterwards the patient's own scrolling decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setIndex(Number((entry.target as HTMLElement).dataset.index));
      },
      { root: list, threshold: 0.6 },
    );
    for (const child of list.children) observer.observe(child);
    return () => observer.disconnect();
  }, [frames.length]);

  const go = (to: number) => listRef.current?.children[to]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });

  return (
    <div className="mx-auto w-full max-w-md">
      <ol ref={listRef} className="p-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
        {frames.map((frame, i) => (
          <li key={frame.key} data-index={i} className="w-[calc(100%-1.5rem)] shrink-0 snap-center">
            <DayCard data={data} frame={frame} />
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center justify-between px-5">
        <p className="p-numeral text-[0.8125rem] text-tl-muted" aria-live="polite">
          {index + 1} מתוך {frames.length}
        </p>
        <div className="flex gap-1">
          <StepButton label="היום הקודם" disabled={index === 0} onClick={() => go(index - 1)} flip={false} />
          <StepButton label="היום הבא" disabled={index >= frames.length - 1} onClick={() => go(index + 1)} flip />
        </div>
      </div>
    </div>
  );
}

function DayCard({ data, frame }: { data: TimelineData; frame: Frame }) {
  const planned = frame.status === "upcoming" || frame.status === "locked";
  const [lead, ...rest] = photoAngles;

  const slot = (angle: (typeof photoAngles)[number], className: string) => {
    const photo = frame.photos[angle];
    return photo ? (
      <Photo key={angle} src={photoUrl(data.slug, photo.id)} alt={`${frameTitle(frame)}, ${angleLabel[angle]}`} logo={data.logo} className={`${className} bg-tl-tint`}>
        <span className="absolute bottom-0 start-0 m-1.5 rounded-[3px] bg-black/45 px-1.5 text-[0.75rem] leading-5 text-white">{angleLabel[angle]}</span>
      </Photo>
    ) : (
      <span key={angle} className={`${className} p-hatch relative flex items-end text-tl-line`}>
        <span className="m-1.5 text-[0.75rem] text-tl-muted">{angleLabel[angle]}</span>
      </span>
    );
  };

  const header = (
    <div className="flex items-baseline justify-between pb-2.5">
      <h3 className="p-heading p-numeral text-[1.3125rem] text-tl-ink">{frameTitle(frame)}</h3>
      <p className="text-[0.8125rem] text-tl-muted">
        {[frame.date ? formatDayMonth(frame.date) : "", planned ? "" : statusText[frame.status]].filter(Boolean).join(", ")}
      </p>
    </div>
  );

  if (planned) {
    return (
      <div className="flex aspect-[4/3.6] flex-col rounded-p border border-dashed border-tl-line p-4">
        {header}
        <p className="mt-auto text-[0.9375rem] text-tl-muted">
          הצילום הבא{frame.date ? ` ב-${formatDayMonth(frame.date)}` : " אחרי הניתוח"}.
        </p>
      </div>
    );
  }

  return (
    <Link href={frameHref(data.slug, frame)} className="block rounded-p">
      {header}
      <div className="grid grid-cols-[2fr_1fr] gap-1.5">
        {slot(lead, "row-span-2 aspect-[3/4] rounded-[calc(var(--p-radius)*0.6)]")}
        {rest.map((angle) => slot(angle, "aspect-[3/4] rounded-[calc(var(--p-radius)*0.45)]"))}
      </div>
    </Link>
  );
}

function StepButton({ label, disabled, onClick, flip }: { label: string; disabled: boolean; onClick: () => void; flip: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-tl-ink hover:bg-tl-tint disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 20 20" className={`h-4 w-4 ${flip ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M7.5 4.5 13 10l-5.5 5.5" />
      </svg>
    </button>
  );
}
