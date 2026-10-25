/**
 * Day arithmetic for the recovery timeline.
 *
 * Day numbers are NEVER stored. They are derived from the photo's capture time and the
 * treatment's actual surgery date, in the clinic's time zone. Correcting the surgery date
 * therefore re-orders the whole timeline without touching a single photo.
 *
 * Day 0 = surgery day. Photos taken before the surgery belong to the "pre_op" phase and
 * have no day number, so postponing the surgery never moves them.
 */

export type IsoDate = `${number}-${number}-${number}`;

export type TreatmentTiming =
  | { status: "scheduled"; plannedSurgeryDate: IsoDate }
  | { status: "performed"; actualSurgeryDate: IsoDate };

export type TimelinePosition = { phase: "pre_op" } | { phase: "post_op"; day: number };

const MS_PER_DAY = 86_400_000;

/** Calendar date of an instant as seen in the clinic's time zone. */
export function localDate(instant: Date, timeZone: string): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instant,
  ) as IsoDate;
}

/** Whole days from `from` to `to` (both calendar dates); independent of DST. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * Where an instant falls on a treatment's timeline.
 * Until the clinic marks the surgery as performed, the patient stays in pre_op,
 * even if the planned date has passed.
 */
export function timelinePosition(instant: Date, timing: TreatmentTiming, timeZone: string): TimelinePosition {
  if (timing.status === "scheduled") return { phase: "pre_op" };
  const day = daysBetween(timing.actualSurgeryDate, localDate(instant, timeZone));
  return day < 0 ? { phase: "pre_op" } : { phase: "post_op", day };
}

/** A scheduled surgery whose planned date has passed without being marked performed. */
export function isOverdueUnmarked(timing: TreatmentTiming, now: Date, timeZone: string): boolean {
  return timing.status === "scheduled" && daysBetween(timing.plannedSurgeryDate, localDate(now, timeZone)) > 0;
}
