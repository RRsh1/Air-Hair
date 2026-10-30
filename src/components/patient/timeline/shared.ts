import type { PhotoLogo } from "@/components/patient/photo";
import type { Frame } from "@/lib/journal/film-strip";
import type { IsoDate } from "@/lib/timeline/days";

export type TimelineData = {
  slug: string;
  frames: Frame[];
  logo: PhotoLogo;
  today: IsoDate;
  /** Actual surgery date when performed, otherwise the planned one. */
  surgeryDate: IsoDate | null;
  surgeryDone: boolean;
};

export const frameTitle = (frame: Frame) => (frame.kind === "pre_op" ? "לפני הניתוח" : frame.day === 0 ? "יום הניתוח" : `יום ${frame.day}`);
export const frameShortTitle = (frame: Frame) => (frame.kind === "pre_op" ? "לפני" : `יום ${frame.day}`);
export const isOpenable = (frame: Frame) => frame.status !== "upcoming" && frame.status !== "locked";
export const frameHref = (slug: string, frame: Frame) => `/c/${slug}/frame/${frame.key}`;

export const statusText: Record<Frame["status"], string> = {
  done: "צולם",
  partial: "צולם חלקית",
  today: "היום",
  missed: "לא צולם",
  upcoming: "בהמשך",
  locked: "אחרי הניתוח",
};

/** The frame to focus first: today's, else the latest photographed. */
export function focusFrame(frames: Frame[]): Frame | undefined {
  return frames.find((f) => f.status === "today") ?? frames.findLast((f) => f.status === "done" || f.status === "partial") ?? frames[0];
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) as IsoDate;
}
