"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { angleLabel, photoUrl } from "@/components/patient/format";
import { CameraIcon, ChevronEndIcon, ChevronStartIcon, NoteIcon } from "@/components/patient/icons";
import { NoteEditor } from "@/components/patient/note-editor";
import { Photo } from "@/components/patient/photo";
import { contentFor, type Frame } from "@/lib/journal/film-strip";
import { photoAngles } from "@/lib/timeline/capture-schedule";
import type { IsoDate } from "@/lib/timeline/days";
import { addDays, dayNumberOf, frameHref, formatWeekdayDate, isOpenable, type TimelineData } from "./shared";

/**
 * The recovery diary, in the manner of a phone's calendar app, at two levels:
 *
 *  - Overview: every month of the follow-up on one screen, like a year view. Photographed days are
 *    filled, planned capture days ringed, today in ink. Tapping a month opens it.
 *  - Month: the month grid on top and the month's days below it as a list. The selected day opens
 *    in place with its photos, the clinic's guidance titles and the patient's own note; its title
 *    leads into the full day page.
 */

const monthLong = new Intl.DateTimeFormat("he-IL", { month: "long", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric", timeZone: "UTC" });
const weekdayShort = new Intl.DateTimeFormat("he-IL", { weekday: "short", timeZone: "UTC" });
const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

type Month = { year: number; month: number }; // month 0–11
const monthOf = (date: IsoDate): Month => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 });
const monthIndex = (m: Month) => m.year * 12 + m.month;
const fromIndex = (i: number): Month => ({ year: Math.floor(i / 12), month: i % 12 });
const iso = (m: Month, day: number) => `${m.year}-${String(m.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` as IsoDate;
const asDate = (m: Month) => new Date(Date.UTC(m.year, m.month, 1));

function monthCells(m: Month): (IsoDate | null)[] {
  const days = new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate();
  const lead = asDate(m).getUTCDay(); // weeks start on Sunday, as in Israel
  const cells: (IsoDate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(m, i + 1))];
  while (cells.length % 7) cells.push(null);
  return cells;
}

type DayInfo = { frame?: Frame; photographed: boolean; planned: boolean; missed: boolean; note?: string };

export function DiaryView({ data }: { data: TimelineData }) {
  const byDate = useMemo(() => {
    const map = new Map<IsoDate, Frame>();
    for (const frame of data.frames) if (frame.date) map.set(frame.date, frame);
    return map;
  }, [data.frames]);

  const info = (date: IsoDate): DayInfo => {
    const frame = byDate.get(date);
    const photographed = Boolean(frame && photoAngles.some((a) => frame.photos[a]));
    return {
      frame,
      photographed,
      planned: Boolean(frame && !photographed && (frame.status === "upcoming" || frame.status === "today")),
      missed: frame?.status === "missed",
      note: data.notes[date],
    };
  };

  // The follow-up runs from the first thing on record to the end of the schedule.
  const end = data.surgeryDate ? addDays(data.surgeryDate, data.totalDays) : data.today;
  const starts = [data.today, ...(data.surgeryDate ? [data.surgeryDate] : []), ...byDate.keys(), ...(Object.keys(data.notes) as IsoDate[])].sort();
  const first = monthIndex(monthOf(starts[0]));
  const last = Math.max(monthIndex(monthOf(end)), monthIndex(monthOf(data.today)));

  const [level, setLevel] = useState<"overview" | "month">("month");
  const [current, setCurrent] = useState(monthIndex(monthOf(data.today)));
  const [selected, setSelected] = useState<IsoDate>(data.today);

  const openMonth = (index: number) => {
    setCurrent(index);
    setLevel("month");
    const m = fromIndex(index);
    const todayHere = monthIndex(monthOf(data.today)) === index;
    // Select today in its own month, otherwise the month's first day with something on it.
    const firstWithContent = monthCells(m).find((d) => d && (byDate.has(d) || data.notes[d]));
    setSelected(todayHere ? data.today : (firstWithContent ?? iso(m, 1)));
  };

  return level === "overview" ? (
    <Overview data={data} info={info} first={first} last={last} onOpen={openMonth} />
  ) : (
    <MonthLevel
      data={data}
      info={info}
      month={fromIndex(current)}
      canBack={current > first}
      canForward={current < last}
      onMove={(delta) => openMonth(current + delta)}
      onOverview={() => setLevel("overview")}
      onToday={() => openMonth(monthIndex(monthOf(data.today)))}
      isCurrentMonth={current === monthIndex(monthOf(data.today))}
      selected={selected}
      onSelect={setSelected}
    />
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────

function Overview({
  data,
  info,
  first,
  last,
  onOpen,
}: {
  data: TimelineData;
  info: (date: IsoDate) => DayInfo;
  first: number;
  last: number;
  onOpen: (index: number) => void;
}) {
  const months = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const due = data.frames.filter((f) => f.date && f.date <= data.today && f.kind === "post_op");
  const done = due.filter((f) => photoAngles.some((a) => f.photos[a])).length;
  const notes = Object.keys(data.notes).length;

  return (
    <div className="mx-auto w-full max-w-md px-5">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="p-heading text-[1.6875rem] leading-none text-tl-ink">כל ההחלמה</h3>
          <p className="mt-1.5 text-[0.875rem] text-tl-muted">
            {monthYear.format(asDate(fromIndex(first)))} עד {monthYear.format(asDate(fromIndex(last)))}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-p border border-tl-line bg-tl-line text-center">
        <div className="bg-p-bg px-3 py-2.5">
          <dt className="text-[0.75rem] text-tl-muted">ימי צילום עד היום</dt>
          <dd className="p-numeral mt-0.5 text-[1.3125rem] text-tl-ink">
            {done}
            <span className="text-[0.9375rem] text-tl-muted"> מתוך {due.length}</span>
          </dd>
        </div>
        <div className="bg-p-bg px-3 py-2.5">
          <dt className="text-[0.75rem] text-tl-muted">הערות שכתבת</dt>
          <dd className="p-numeral mt-0.5 text-[1.3125rem] text-tl-ink">{notes}</dd>
        </div>
      </dl>

      <ol className="mt-5 grid grid-cols-2 gap-x-5 gap-y-6">
        {months.map((index) => (
          <li key={index}>
            <MiniMonth data={data} info={info} month={fromIndex(index)} onOpen={() => onOpen(index)} />
          </li>
        ))}
      </ol>

      <Legend data={data} />
    </div>
  );
}

function MiniMonth({ data, info, month, onOpen }: { data: TimelineData; info: (date: IsoDate) => DayInfo; month: Month; onOpen: () => void }) {
  const isCurrent = monthIndex(month) === monthIndex(monthOf(data.today));
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-[6px] text-start" aria-label={`פתיחת ${monthYear.format(asDate(month))}`}>
      <span className={`p-heading block text-[1.0625rem] ${isCurrent ? "text-tl-accent" : "text-tl-ink"}`}>
        {monthLong.format(asDate(month))}
        {month.month === 0 && <span className="p-numeral ms-1.5 text-[0.8125rem] font-normal text-tl-muted">{month.year}</span>}
      </span>
      <span aria-hidden="true" className="mt-1.5 grid grid-cols-7 gap-y-[3px]">
        {monthCells(month).map((date, i) => {
          if (!date) return <span key={i} />;
          const d = info(date);
          const isToday = date === data.today;
          return (
            <span key={date} className="flex justify-center">
              <span
                className={`p-numeral flex h-[17px] w-[17px] items-center justify-center rounded-full text-[0.625rem] leading-none ${
                  isToday
                    ? "bg-tl-ink font-semibold text-p-bg"
                    : d.photographed
                      ? "bg-tl-accent text-p-accent-ink"
                      : d.planned
                        ? "border border-tl-accent text-tl-accent"
                        : d.missed
                          ? "text-tl-muted line-through"
                          : date === data.surgeryDate
                            ? "font-semibold text-tl-ink underline"
                            : "text-tl-muted"
                }`}
              >
                {Number(date.slice(8))}
              </span>
            </span>
          );
        })}
      </span>
    </button>
  );
}

// ─── Month ──────────────────────────────────────────────────────────────────

function MonthLevel({
  data,
  info,
  month,
  canBack,
  canForward,
  onMove,
  onOverview,
  onToday,
  isCurrentMonth,
  selected,
  onSelect,
}: {
  data: TimelineData;
  info: (date: IsoDate) => DayInfo;
  month: Month;
  canBack: boolean;
  canForward: boolean;
  onMove: (delta: number) => void;
  onOverview: () => void;
  onToday: () => void;
  isCurrentMonth: boolean;
  selected: IsoDate;
  onSelect: (date: IsoDate) => void;
}) {
  const cells = monthCells(month);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const touch = useRef<number | null>(null);

  // The month's days that have something on them, plus the selected day, in order.
  const listed = cells.filter((d): d is IsoDate => Boolean(d && (info(d).frame || info(d).note || d === selected || d === data.surgeryDate)));

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="flex items-center justify-between px-3">
        <button type="button" onClick={onOverview} className="flex h-10 items-center gap-0.5 rounded-full pe-3 ps-1.5 text-[0.9375rem] text-tl-accent">
          <ChevronStartIcon className="h-[18px] w-[18px]" />
          כל ההחלמה
        </button>
        <div className="flex items-center">
          {(!isCurrentMonth || selected !== data.today) && (
            <button type="button" onClick={onToday} className="me-1 h-10 rounded-full px-3 text-[0.9375rem] font-medium text-tl-accent">
              היום
            </button>
          )}
          <IconButton label="החודש הקודם" disabled={!canBack} onClick={() => onMove(-1)}>
            <ChevronStartIcon />
          </IconButton>
          <IconButton label="החודש הבא" disabled={!canForward} onClick={() => onMove(1)}>
            <ChevronEndIcon />
          </IconButton>
        </div>
      </div>
      <h3 className="mt-1 flex items-baseline gap-2 px-5" aria-live="polite">
        <span className="p-heading text-[1.6875rem] leading-none text-tl-ink">{monthLong.format(asDate(month))}</span>
        <span className="p-numeral text-[1.0625rem] text-tl-muted">{month.year}</span>
      </h3>

      <div
        className="mt-4 px-3"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          // Right-to-left: later months lie to the left, so a leftward swipe moves forward.
          if (dx < -48 && canForward) onMove(1);
          if (dx > 48 && canBack) onMove(-1);
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
                      <DayButton data={data} date={date} info={info(date)} weekend={d === 6} selected={date === selected} onSelect={() => onSelect(date)} />
                    </td>
                  ) : (
                    <td key={`e-${w}-${d}`} />
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-tl-line" />
      </div>

      <ol className="mt-2 px-5">
        {listed.map((date) => (
          <DayRow key={date} data={data} date={date} info={info(date)} expanded={date === selected} onSelect={() => onSelect(date)} />
        ))}
      </ol>
    </div>
  );
}

function DayButton({
  data,
  date,
  info,
  weekend,
  selected,
  onSelect,
}: {
  data: TimelineData;
  date: IsoDate;
  info: DayInfo;
  weekend: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const isToday = date === data.today;
  const isSurgery = date === data.surgeryDate;
  const circle = isToday
    ? "bg-tl-accent text-p-accent-ink font-semibold"
    : selected
      ? "bg-tl-ink text-p-bg font-semibold"
      : weekend || date > data.today
        ? "text-tl-muted"
        : "text-tl-ink";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={[formatWeekdayDate(date), isSurgery ? "יום הניתוח" : "", info.photographed ? "צולם" : info.planned ? "צילום מתוכנן" : "", info.note ? "יש הערה" : ""]
        .filter(Boolean)
        .join(", ")}
      className="flex h-[3.4rem] w-full flex-col items-center pt-1.5"
    >
      <span
        className={`p-numeral flex h-8 w-8 items-center justify-center rounded-full text-[1.0625rem] ${circle} ${
          selected && isToday ? "ring-2 ring-tl-accent ring-offset-2 ring-offset-p-bg" : ""
        } ${isSurgery && !isToday && !selected ? "underline decoration-tl-ink decoration-2 underline-offset-[5px]" : ""}`}
      >
        {Number(date.slice(8))}
      </span>
      <span className="mt-1 flex h-1.5 items-center gap-[3px]" aria-hidden="true">
        {info.photographed && <span className="h-1.5 w-1.5 rounded-full bg-tl-accent" />}
        {info.planned && <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-tl-accent" />}
        {info.note && <span className="h-1.5 w-1.5 rounded-full bg-tl-muted" />}
      </span>
    </button>
  );
}

/** One day in the month's list: compact (date, thumbnails, note line) or open (everything about it). */
function DayRow({ data, date, info, expanded, onSelect }: { data: TimelineData; date: IsoDate; info: DayInfo; expanded: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (expanded) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [expanded]);

  const { frame } = info;
  const dayNumber = dayNumberOf(data, date);
  const isToday = date === data.today;
  const isFuture = date > data.today;
  const label =
    date === data.surgeryDate
      ? data.surgeryDone
        ? "יום הניתוח"
        : "הניתוח המתוכנן"
      : dayNumber !== null && dayNumber > 0
        ? `יום ${dayNumber}`
        : frame?.kind === "pre_op" || (data.surgeryDate && date < data.surgeryDate)
          ? "לפני הניתוח"
          : "";
  const guidance = frame ? contentFor(data.content, frame) : dayNumber !== null && dayNumber >= 0 ? contentFor(data.content, { kind: "post_op", day: dayNumber }) : [];

  const dateColumn = (
    <div className="w-[3.25rem] shrink-0 text-center">
      <p className={`text-[0.75rem] ${isToday ? "font-medium text-tl-accent" : "text-tl-muted"}`}>{weekdayShort.format(new Date(`${date}T00:00:00Z`))}</p>
      <p className={`p-numeral mt-0.5 text-[1.6875rem] leading-none ${isToday ? "text-tl-accent" : isFuture ? "text-tl-muted" : "text-tl-ink"}`}>
        {Number(date.slice(8))}
      </p>
    </div>
  );

  return (
    <li ref={ref} className="border-b border-tl-line last:border-b-0">
      {!expanded ? (
        <button type="button" onClick={onSelect} className="flex w-full items-start gap-4 py-3.5 text-start">
          {dateColumn}
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-[0.9375rem] font-medium text-tl-ink">{label || formatWeekdayDate(date)}</span>
              <span className="text-[0.8125rem] text-tl-muted">{statusLine(info, isFuture)}</span>
            </p>
            {info.photographed && (
              <span className="mt-2 flex gap-1.5">
                {photoAngles.map((angle) => {
                  const photo = frame!.photos[angle];
                  return photo ? (
                    <Photo key={angle} src={photoUrl(data.slug, photo.id)} alt="" logo={null} className="h-12 w-9 rounded-[4px] bg-tl-tint" />
                  ) : (
                    <span key={angle} className="p-hatch h-12 w-9 rounded-[4px] text-tl-line" />
                  );
                })}
              </span>
            )}
            {info.note && (
              <span className="mt-2 flex gap-1.5 text-[0.875rem] leading-snug text-tl-muted">
                <NoteIcon className="mt-px h-4 w-4" />
                <span className="line-clamp-1 text-tl-ink/80">{info.note}</span>
              </span>
            )}
          </div>
        </button>
      ) : (
        <div className="py-4">
          <div className="flex items-start gap-4">
            {dateColumn}
            <div className="min-w-0 flex-1 pt-0.5">
              {frame && isOpenable(frame) ? (
                <Link href={frameHref(data.slug, frame)} className="group flex items-center justify-between gap-2">
                  <span className="p-heading text-[1.3125rem] text-tl-ink">{label || formatWeekdayDate(date)}</span>
                  <span className="flex items-center text-[0.875rem] text-tl-accent">
                    פתיחת היום
                    <ChevronEndIcon className="h-4 w-4" />
                  </span>
                </Link>
              ) : (
                <p className="p-heading text-[1.3125rem] text-tl-ink">{label || "יום רגיל"}</p>
              )}
              <p className="mt-0.5 text-[0.875rem] text-tl-muted">{formatWeekdayDate(date)}</p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {isToday ? (
              // Today's photos and guidance lead the home screen above the diary; only the note here.
              null
            ) : info.photographed ? (
              <div className="grid grid-cols-3 gap-2">
                {photoAngles.map((angle) => {
                  const photo = frame!.photos[angle];
                  const href = photo || !isToday ? frameHref(data.slug, frame!) : `/c/${data.slug}/capture/${angle}`;
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
            ) : frame && isOpenable(frame) ? (
              <p className="text-[0.9375rem] text-tl-muted">ביום הזה לא צולמו תמונות.</p>
            ) : frame ? (
              <p className="flex items-center gap-2 text-[0.9375rem] text-tl-muted">
                <span className="h-2 w-2 rounded-full border-[1.5px] border-tl-accent" aria-hidden="true" />
                צילום מתוכנן ליום הזה
              </p>
            ) : null}

            {guidance.length > 0 && !isToday && (
              <ul className="divide-y divide-tl-line rounded-p border border-tl-line">
                {guidance.map((item) => (
                  <li key={item.id} className="flex items-baseline gap-3 px-4 py-3">
                    <span className="w-12 shrink-0 text-[0.8125rem] text-tl-accent">{{ instruction: "הוראה", recommendation: "המלצה", tip: "טיפ" }[item.contentType]}</span>
                    <span className="text-[0.9375rem] text-tl-ink">{item.title}</span>
                  </li>
                ))}
              </ul>
            )}

            {!isFuture && <NoteEditor key={date} slug={data.slug} date={date} initial={info.note ?? ""} />}
          </div>
        </div>
      )}
    </li>
  );
}

function statusLine(info: DayInfo, isFuture: boolean): string {
  if (info.photographed) {
    const count = photoAngles.filter((a) => info.frame!.photos[a]).length;
    return count === photoAngles.length ? "צולם" : `צולמו ${count} מתוך 3`;
  }
  if (info.planned) return isFuture ? "צילום מתוכנן" : "לצלם היום";
  if (info.missed) return "לא צולם";
  return "";
}

function Legend({ data }: { data: TimelineData }) {
  return (
    <ul className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-tl-line pt-3 text-[0.75rem] text-tl-muted">
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-tl-accent" aria-hidden="true" />
        צולם
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full border border-tl-accent" aria-hidden="true" />
        מתוכנן
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-tl-ink" aria-hidden="true" />
        היום
      </li>
      {data.surgeryDate && (
        <li className="flex items-center gap-1.5">
          <span className="p-numeral text-tl-ink underline" aria-hidden="true">
            {Number(data.surgeryDate.slice(8))}
          </span>
          {data.surgeryDone ? "יום הניתוח" : "הניתוח המתוכנן"}
        </li>
      )}
    </ul>
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
