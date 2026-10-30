"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { photoUrl } from "@/components/patient/format";
import { Photo } from "@/components/patient/photo";
import type { Frame } from "@/lib/journal/film-strip";
import type { IsoDate } from "@/lib/timeline/days";
import { frameHref, frameTitle, isOpenable, statusText, type TimelineData } from "./shared";

const monthName = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric", timeZone: "UTC" });
const WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

type Month = { year: number; month: number }; // month 0–11

const monthOf = (date: IsoDate): Month => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 });
const monthIndex = (m: Month) => m.year * 12 + m.month;
const fromIndex = (i: number): Month => ({ year: Math.floor(i / 12), month: i % 12 });
const iso = (m: Month, day: number) => `${m.year}-${String(m.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` as IsoDate;

/**
 * A month calendar: photographed days show their photo, planned capture days a ring, missed days
 * a hatch; the surgery day is marked. Arrows move between the months of the recovery.
 */
export function CalendarView({ data }: { data: TimelineData }) {
  const byDate = useMemo(() => {
    const map = new Map<IsoDate, Frame>();
    for (const frame of data.frames) if (frame.date) map.set(frame.date, frame);
    return map;
  }, [data.frames]);

  const dates = [...byDate.keys(), data.today, ...(data.surgeryDate ? [data.surgeryDate] : [])].sort();
  const first = monthIndex(monthOf(dates[0]));
  const last = monthIndex(monthOf(dates.at(-1)!));
  const [current, setCurrent] = useState(monthIndex(monthOf(data.today)));
  const month = fromIndex(current);

  const daysInMonth = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const lead = new Date(Date.UTC(month.year, month.month, 1)).getUTCDay(); // Sunday first, as in Israel
  const cells: (IsoDate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => iso(month, i + 1))];

  return (
    <div className="mx-auto w-full max-w-md px-5">
      <div className="flex items-center justify-between">
        <h3 className="p-heading text-[1.0625rem] text-tl-ink">{monthName.format(new Date(Date.UTC(month.year, month.month, 1)))}</h3>
        <div className="flex gap-1">
          <MonthButton label="החודש הקודם" disabled={current <= first} onClick={() => setCurrent(current - 1)} direction="prev" />
          <MonthButton label="החודש הבא" disabled={current >= last} onClick={() => setCurrent(current + 1)} direction="next" />
        </div>
      </div>

      <div className="mt-3">
        <div aria-hidden="true" className="grid grid-cols-7 gap-1 pb-1.5">
          {WEEKDAYS.map((d) => (
            <span key={d} className="text-center text-[0.75rem] text-tl-muted">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => (date ? <DayCell key={date} data={data} date={date} frame={byDate.get(date)} /> : <span key={`lead-${i}`} />))}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-tl-muted">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-tl-accent" /> צולם
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-tl-accent" /> מתוכנן
        </li>
        <li className="flex items-center gap-1.5">
          <span className="p-hatch h-2.5 w-2.5 rounded-[2px] text-tl-muted" /> לא צולם
        </li>
        {data.surgeryDate && (
          <li className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-tl-ink" /> {data.surgeryDone ? "יום הניתוח" : "הניתוח המתוכנן"}
          </li>
        )}
      </ul>
    </div>
  );
}

function DayCell({ data, date, frame }: { data: TimelineData; date: IsoDate; frame?: Frame }) {
  const dayNumber = Number(date.slice(8));
  const isToday = date === data.today;
  const isSurgery = date === data.surgeryDate;
  const photo = frame && (frame.photos.front ?? frame.photos.top ?? frame.photos.back);
  const planned = frame && (frame.status === "upcoming" || frame.status === "today");
  const missed = frame?.status === "missed";

  const inner = (
    <span
      className={`relative flex aspect-square flex-col overflow-hidden rounded-[calc(var(--p-radius)*0.45)] ${
        photo ? "" : missed ? "p-hatch text-tl-muted" : ""
      } ${isToday ? "outline outline-2 outline-offset-1 outline-tl-accent" : ""}`}
    >
      {photo && <Photo src={photoUrl(data.slug, photo.id)} alt="" logo={null} className="absolute inset-0" />}
      <span
        className={`p-numeral relative m-1 self-start rounded-[3px] px-1 text-[0.8125rem] leading-[1.15rem] ${
          photo ? "bg-black/45 text-white" : planned ? "text-tl-accent" : "text-tl-ink"
        }`}
      >
        {dayNumber}
      </span>
      {planned && !photo && <span className="absolute inset-[18%] rounded-full border-[1.5px] border-tl-accent/70" aria-hidden="true" />}
      {isSurgery && <span className="absolute bottom-1 start-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-tl-ink rtl:translate-x-1/2" aria-hidden="true" />}
    </span>
  );

  const label = [new Date(`${date}T00:00:00Z`).getUTCDate(), frame ? `${frameTitle(frame)}, ${statusText[frame.status]}` : "", isSurgery ? "ניתוח" : ""]
    .filter(Boolean)
    .join(", ");

  return frame && isOpenable(frame) ? (
    <Link href={frameHref(data.slug, frame)} aria-label={label} className="block rounded-[calc(var(--p-radius)*0.45)]">
      {inner}
    </Link>
  ) : (
    <span aria-label={label || undefined}>
      {inner}
    </span>
  );
}

function MonthButton({ label, disabled, onClick, direction }: { label: string; disabled: boolean; onClick: () => void; direction: "prev" | "next" }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-tl-ink hover:bg-tl-tint disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {/* In RTL "previous" points right. */}
      <svg viewBox="0 0 20 20" className={`h-4 w-4 ${direction === "prev" ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M7.5 4.5 13 10l-5.5 5.5" />
      </svg>
    </button>
  );
}

