"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { angleLabel, photoUrl } from "@/components/patient/format";
import { CameraIcon, ChevronEndIcon, ChevronStartIcon } from "@/components/patient/icons";
import { NoteEditor } from "@/components/patient/note-editor";
import { Photo } from "@/components/patient/photo";
import { contentFor, type Frame } from "@/lib/journal/film-strip";
import { photoAngles } from "@/lib/timeline/capture-schedule";
import type { IsoDate } from "@/lib/timeline/days";
import { dayNumberOf, frameHref, formatWeekdayDate, isOpenable, type TimelineData } from "./shared";

const monthName = new Intl.DateTimeFormat("he-IL", { month: "long", timeZone: "UTC" });
const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

type Month = { year: number; month: number }; // month 0–11
const monthOf = (date: IsoDate): Month => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 });
const monthIndex = (m: Month) => m.year * 12 + m.month;
const fromIndex = (i: number): Month => ({ year: Math.floor(i / 12), month: i % 12 });
const iso = (m: Month, day: number) => `${m.year}-${String(m.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` as IsoDate;

/**
 * A month calendar in the manner of a phone's calendar app: weeks on hairlines, today in the
 * accent circle, the selected day in an ink circle, dots for photos and notes. Below it, the
 * selected day: its photos, the clinic's guidance titles and the patient's own note.
 */
export function CalendarView({ data }: { data: TimelineData }) {
  const byDate = useMemo(() => {
    const map = new Map<IsoDate, Frame>();
    for (const frame of data.frames) if (frame.date) map.set(frame.date, frame);
    return map;
  }, [data.frames]);

  const known = [...byDate.keys(), data.today, ...(data.surgeryDate ? [data.surgeryDate] : []), ...(Object.keys(data.notes) as IsoDate[])].sort();
  const first = monthIndex(monthOf(known[0]));
  const last = Math.max(monthIndex(monthOf(known.at(-1)!)), monthIndex(monthOf(data.today)));

  const [current, setCurrent] = useState(monthIndex(monthOf(data.today)));
  const [selected, setSelected] = useState<IsoDate>(data.today);
  const month = fromIndex(current);

  const daysInMonth = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const lead = new Date(Date.UTC(month.year, month.month, 1)).getUTCDay(); // weeks start on Sunday
  const cells: (IsoDate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => iso(month, i + 1))];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const go = (index: number) => setCurrent(Math.min(Math.max(index, first), last));
  const touch = useRef<number | null>(null);

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="flex items-end justify-between px-5">
        <h3 className="flex items-baseline gap-2" aria-live="polite">
          <span className="p-heading text-[1.6875rem] leading-none text-tl-ink">{monthName.format(new Date(Date.UTC(month.year, month.month, 1)))}</span>
          <span className="p-numeral text-[1.0625rem] text-tl-muted">{month.year}</span>
        </h3>
        <div className="flex items-center">
          {(current !== monthIndex(monthOf(data.today)) || selected !== data.today) && (
            <button
              type="button"
              onClick={() => {
                setCurrent(monthIndex(monthOf(data.today)));
                setSelected(data.today);
              }}
              className="me-1 h-9 rounded-full px-3 text-[0.9375rem] font-medium text-tl-accent"
            >
              היום
            </button>
          )}
          <IconButton label="החודש הקודם" disabled={current <= first} onClick={() => go(current - 1)}>
            <ChevronStartIcon />
          </IconButton>
          <IconButton label="החודש הבא" disabled={current >= last} onClick={() => go(current + 1)}>
            <ChevronEndIcon />
          </IconButton>
        </div>
      </div>

      <div
        className="mt-4 px-3"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          // Right-to-left: later months lie to the left, so a leftward swipe moves forward.
          if (Math.abs(dx) > 48) go(current + (dx < 0 ? 1 : -1));
        }}
      >
        <div aria-hidden="true" className="grid grid-cols-7 pb-2">
          {WEEKDAYS.map((d, i) => (
            <span key={d} className={`text-center text-[0.75rem] ${i === 6 ? "text-tl-muted/70" : "text-tl-muted"}`}>
              {d}
            </span>
          ))}
        </div>
        <table className="w-full table-fixed border-collapse" role="grid" aria-label="לוח החודש">
          <tbody>
            {weeks.map((week, w) => (
              <tr key={w} className="border-t border-tl-line">
                {week.map((date, d) =>
                  date ? (
                    <td key={date} className="p-0">
                      <DayButton
                        date={date}
                        frame={byDate.get(date)}
                        hasNote={Boolean(data.notes[date])}
                        isToday={date === data.today}
                        isSelected={date === selected}
                        isSurgery={date === data.surgeryDate}
                        isFuture={date > data.today}
                        weekend={d === 6}
                        onSelect={() => setSelected(date)}
                      />
                    </td>
                  ) : (
                    <td key={`e-${w}-${d}`} />
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-2 flex justify-center gap-4 border-t border-tl-line pt-2.5 text-[0.75rem] text-tl-muted">
          <Legend dot="bg-tl-accent">צילום</Legend>
          <Legend dot="border-[1.5px] border-tl-accent">מתוכנן</Legend>
          <Legend dot="bg-tl-muted">הערה</Legend>
          {data.surgeryDate && (
            <li className="flex items-center gap-1.5">
              <span className="p-numeral text-[0.75rem] text-tl-ink underline decoration-tl-ink decoration-2 underline-offset-2" aria-hidden="true">
                {Number(data.surgeryDate.slice(8))}
              </span>
              {data.surgeryDone ? "יום הניתוח" : "הניתוח המתוכנן"}
            </li>
          )}
        </ul>
      </div>

      <DayAgenda data={data} date={selected} frame={byDate.get(selected)} />
    </div>
  );
}

function DayButton({
  date,
  frame,
  hasNote,
  isToday,
  isSelected,
  isSurgery,
  isFuture,
  weekend,
  onSelect,
}: {
  date: IsoDate;
  frame?: Frame;
  hasNote: boolean;
  isToday: boolean;
  isSelected: boolean;
  isSurgery: boolean;
  isFuture: boolean;
  weekend: boolean;
  onSelect: () => void;
}) {
  const photographed = frame && photoAngles.some((a) => frame.photos[a]);
  const planned = frame && !photographed && (frame.status === "upcoming" || frame.status === "today");
  const day = Number(date.slice(8));
  const circle = isToday
    ? "bg-tl-accent text-p-accent-ink font-semibold"
    : isSelected
      ? "bg-tl-ink text-p-bg font-semibold"
      : weekend || isFuture
        ? "text-tl-muted"
        : "text-tl-ink";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={[formatWeekdayDate(date), isSurgery ? "יום הניתוח" : "", photographed ? "צולם" : planned ? "צילום מתוכנן" : "", hasNote ? "יש הערה" : ""]
        .filter(Boolean)
        .join(", ")}
      className="flex h-[3.4rem] w-full flex-col items-center pt-1.5"
    >
      <span
        className={`p-numeral flex h-8 w-8 items-center justify-center rounded-full text-[1.0625rem] ${circle} ${
          isSelected && isToday ? "ring-2 ring-tl-accent ring-offset-2 ring-offset-p-bg" : ""
        } ${isSurgery && !isToday && !isSelected ? "underline decoration-tl-ink decoration-2 underline-offset-[5px]" : ""}`}
      >
        {day}
      </span>
      <span className="mt-1 flex h-1.5 items-center gap-[3px]" aria-hidden="true">
        {photographed && <span className="h-1.5 w-1.5 rounded-full bg-tl-accent" />}
        {planned && <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-tl-accent" />}
        {hasNote && <span className="h-1.5 w-1.5 rounded-full bg-tl-muted" />}
      </span>
    </button>
  );
}

function DayAgenda({ data, date, frame }: { data: TimelineData; date: IsoDate; frame?: Frame }) {
  const dayNumber = dayNumberOf(data, date);
  const isFuture = date > data.today;
  const isToday = date === data.today;
  const photographed = frame && photoAngles.some((a) => frame.photos[a]);
  const guidance = frame ? contentFor(data.content, frame) : dayNumber !== null && dayNumber >= 0 ? contentFor(data.content, { kind: "post_op", day: dayNumber }) : [];
  const subtitle =
    date === data.surgeryDate
      ? data.surgeryDone
        ? "יום הניתוח"
        : "הניתוח המתוכנן"
      : dayNumber !== null && dayNumber > 0
        ? `יום ${dayNumber} להחלמה`
        : data.surgeryDate && date < data.surgeryDate
          ? "לפני הניתוח"
          : "";

  return (
    <section aria-label={formatWeekdayDate(date)} className="mt-5 border-t border-tl-line px-5 pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="p-heading text-[1.3125rem] text-tl-ink">{isToday ? "היום" : formatWeekdayDate(date)}</h4>
        {subtitle && <p className="shrink-0 text-[0.875rem] text-tl-muted">{subtitle}</p>}
      </div>
      {isToday && <p className="mt-0.5 text-[0.875rem] text-tl-muted">{formatWeekdayDate(date)}</p>}

      <div className="mt-4 space-y-4">
        {photographed ? (
          <div className="grid grid-cols-3 gap-2">
            {photoAngles.map((angle) => {
              const photo = frame.photos[angle];
              const href = photo || !isToday ? frameHref(data.slug, frame) : `/c/${data.slug}/capture/${angle}`;
              return (
                <Link key={angle} href={href} className="block rounded-[calc(var(--p-radius)*0.6)]" aria-label={photo ? `${angleLabel[angle]}, פתיחה` : isToday ? `לצלם ${angleLabel[angle]}` : `${angleLabel[angle]}, לא צולם`}>
                  {photo ? (
                    <Photo src={photoUrl(data.slug, photo.id)} alt="" logo={data.logo} className="aspect-[3/4] rounded-[calc(var(--p-radius)*0.6)] bg-tl-tint" />
                  ) : isToday ? (
                    <span className="flex aspect-[3/4] items-center justify-center rounded-[calc(var(--p-radius)*0.6)] border border-tl-line bg-p-surface">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-tl-accent/10 text-tl-accent">
                        <CameraIcon />
                      </span>
                    </span>
                  ) : (
                    <span className="p-hatch block aspect-[3/4] rounded-[calc(var(--p-radius)*0.6)] text-tl-line" />
                  )}
                  <span className={`mt-1.5 block text-center text-[0.8125rem] ${!photo && isToday ? "font-medium text-tl-accent" : "text-tl-muted"}`}>
                    {!photo && isToday ? `לצלם ${angleLabel[angle]}` : angleLabel[angle]}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : frame && isToday ? (
          <Link href={`/c/${data.slug}/capture/front`} className="p-btn flex h-12 items-center justify-center gap-2 text-[1rem] font-medium">
            <CameraIcon />
            לצלם את התיעוד של היום
          </Link>
        ) : frame && isOpenable(frame) ? (
          <p className="text-[0.9375rem] text-tl-muted">ביום הזה לא צולמו תמונות.</p>
        ) : frame ? (
          <p className="flex items-center gap-2 text-[0.9375rem] text-tl-muted">
            <span className="h-2 w-2 rounded-full border-[1.5px] border-tl-accent" aria-hidden="true" />
            צילום מתוכנן ליום הזה
          </p>
        ) : null}

        {guidance.length > 0 && (
          <ul className="divide-y divide-tl-line rounded-p border border-tl-line">
            {guidance.map((item) => (
              <li key={item.id} className="flex items-baseline gap-3 px-4 py-3">
                <span className="w-12 shrink-0 text-[0.8125rem] text-tl-accent">
                  {{ instruction: "הוראה", recommendation: "המלצה", tip: "טיפ" }[item.contentType]}
                </span>
                <span className="text-[0.9375rem] text-tl-ink">{item.title}</span>
              </li>
            ))}
          </ul>
        )}

        {!isFuture && <NoteEditor key={date} slug={data.slug} date={date} initial={data.notes[date] ?? ""} />}
      </div>
    </section>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full text-tl-accent hover:bg-tl-tint disabled:text-tl-line disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Legend({ dot, children }: { dot: string; children: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </li>
  );
}
