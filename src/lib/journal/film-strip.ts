import { photoAngles, postOpCaptureDays, type PhotoAngle } from "../timeline/capture-schedule";
import { currentPosition, entryPosition, localDate, type IsoDate } from "../timeline/days";
import type { ContentItem, JournalEntryView, PatientJournal } from "./patient-journal";

/**
 * Turns a patient's journal into the frames of the film strip: one frame before surgery,
 * then one per capture day, plus any extra day the patient photographed off-schedule.
 */

export type FrameStatus = "done" | "partial" | "today" | "missed" | "upcoming" | "locked";

export type Frame = {
  key: string; // "pre" or the post-op day number
  kind: "pre_op" | "post_op";
  day: number | null;
  date: IsoDate | null;
  status: FrameStatus;
  photos: Partial<Record<PhotoAngle, { id: string; width: number; height: number }>>;
};

function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) as IsoDate;
}

function merge(entries: JournalEntryView[]): Frame["photos"] {
  const out: Frame["photos"] = {};
  for (const entry of entries) Object.assign(out, entry.photos);
  return out;
}

function statusFor(photos: Frame["photos"], isToday: boolean, isPast: boolean, locked: boolean): FrameStatus {
  const count = photoAngles.filter((angle) => photos[angle]).length;
  if (count === photoAngles.length) return "done";
  if (isToday) return "today";
  if (count > 0) return "partial";
  if (locked) return "locked";
  return isPast ? "missed" : "upcoming";
}

export function buildFilmStrip(journal: PatientJournal, now: Date): Frame[] {
  const { timing, timeZone } = journal;
  const position = currentPosition(now, timing, timeZone);
  const scheduled = timing.status === "scheduled";

  const preEntries = journal.entries.filter((entry) => entry.phase === "pre_op");
  const prePhotos = merge(preEntries);
  const frames: Frame[] = [
    {
      key: "pre",
      kind: "pre_op",
      day: null,
      date: preEntries.at(-1) ? localDate(preEntries.at(-1)!.capturedAt, timeZone) : null,
      // Before surgery the pre-op frame is always open; afterwards it's done, partial or missed.
      status: statusFor(prePhotos, scheduled, !scheduled, false),
      photos: prePhotos,
    },
  ];

  const postByDay = new Map<number, JournalEntryView[]>();
  for (const entry of journal.entries) {
    if (entry.phase !== "post_op") continue;
    const at = entryPosition(entry, timing, timeZone);
    if (at.phase !== "post_op") continue;
    postByDay.set(at.day, [...(postByDay.get(at.day) ?? []), entry]);
  }

  const today = position.phase === "post_op" ? position.day : -1;
  const days = new Set([...postOpCaptureDays(journal.rules), ...postByDay.keys()]);
  for (const day of [...days].sort((a, b) => a - b)) {
    const photos = merge(postByDay.get(day) ?? []);
    frames.push({
      key: String(day),
      kind: "post_op",
      day,
      date: timing.status === "performed" ? addDays(timing.actualSurgeryDate, day) : null,
      status: statusFor(photos, day === today, today > day, scheduled),
      photos,
    });
  }
  return frames;
}

/** Content items that apply on a given position of the timeline. */
export function contentFor(items: ContentItem[], frame: Pick<Frame, "kind" | "day">): ContentItem[] {
  return items.filter((item) => {
    if (frame.kind === "pre_op") return item.phase === "pre_op";
    if (item.phase !== "post_op" || frame.day === null) return false;
    return (item.fromDay ?? 0) <= frame.day && frame.day <= (item.toDay ?? Number.POSITIVE_INFINITY);
  });
}
