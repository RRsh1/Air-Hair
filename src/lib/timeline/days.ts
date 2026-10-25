/**
 * Day arithmetic for the recovery timeline.
 *
 * Two rules keep the timeline stable when dates change:
 *  1. The PHASE of a journal entry is recorded at capture time and is authoritative.
 *     A photo taken while the treatment was still "scheduled" is pre_op forever, even if it was
 *     taken on the morning of the surgery day.
 *  2. The DAY NUMBER of a post_op entry is never stored. It is derived from captured_at and the
 *     actual surgery date, in the clinic's time zone, so correcting the surgery date re-orders
 *     the timeline without touching a single photo.
 *
 * Day 0 = surgery day (the photo taken after the operation).
 */

export type IsoDate = `${number}-${number}-${number}`;

export type TreatmentTiming =
  | { status: "scheduled"; plannedSurgeryDate: IsoDate }
  | { status: "performed"; actualSurgeryDate: IsoDate };

export type Phase = "pre_op" | "post_op";

export type TimelinePosition = { phase: "pre_op" } | { phase: "post_op"; day: number };

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date of an instant as seen in the clinic's time zone. */
export function localDate(instant: Date, timeZone: string): IsoDate {
  if (Number.isNaN(instant.getTime())) throw new Error("Invalid instant");
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instant,
  ) as IsoDate;
}

/** Whole days from `from` to `to` (both calendar dates); independent of DST. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) throw new Error(`Invalid date: ${from} / ${to}`);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
  if (!Number.isFinite(days)) throw new Error(`Invalid date: ${from} / ${to}`);
  return days;
}

/** Phase to record on a new journal entry: post_op only once the clinic marked the surgery performed. */
export function phaseForNewEntry(timing: TreatmentTiming): Phase {
  return timing.status === "performed" ? "post_op" : "pre_op";
}

/**
 * Where a stored journal entry sits on the timeline.
 * A post_op entry that falls before a corrected surgery date is clamped to day 0 rather than
 * hidden; the dashboard flags it so the clinic can check the date.
 */
export function entryPosition(
  entry: { phase: Phase; capturedAt: Date },
  timing: TreatmentTiming,
  timeZone: string,
): TimelinePosition {
  if (entry.phase === "pre_op" || timing.status === "scheduled") return { phase: "pre_op" };
  const day = daysBetween(timing.actualSurgeryDate, localDate(entry.capturedAt, timeZone));
  return { phase: "post_op", day: Math.max(0, day) };
}

/** A post_op entry captured before the (corrected) surgery date: data the clinic should review. */
export function isEntryBeforeSurgery(entry: { phase: Phase; capturedAt: Date }, timing: TreatmentTiming, timeZone: string): boolean {
  return (
    entry.phase === "post_op" &&
    timing.status === "performed" &&
    daysBetween(timing.actualSurgeryDate, localDate(entry.capturedAt, timeZone)) < 0
  );
}

/** Where the patient is right now: drives which tips and capture slots the app shows today. */
export function currentPosition(now: Date, timing: TreatmentTiming, timeZone: string): TimelinePosition {
  if (timing.status === "scheduled") return { phase: "pre_op" };
  return { phase: "post_op", day: Math.max(0, daysBetween(timing.actualSurgeryDate, localDate(now, timeZone))) };
}

/** A scheduled surgery whose planned date has passed without being marked performed. */
export function isOverdueUnmarked(timing: TreatmentTiming, now: Date, timeZone: string): boolean {
  return timing.status === "scheduled" && daysBetween(timing.plannedSurgeryDate, localDate(now, timeZone)) > 0;
}
