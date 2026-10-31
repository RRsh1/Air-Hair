import { PREVIEW_SLUG } from "@/components/patient/format";
import type { TimelineData } from "@/components/patient/timeline/shared";
import type { Frame } from "@/lib/journal/film-strip";
import type { ContentItem } from "@/lib/journal/patient-journal";
import type { IsoDate } from "@/lib/timeline/days";

/** A made-up patient on day 9 of recovery, so every block of the preview has something to show. */

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10) as IsoDate;

export function samplePatient(now = Date.now()) {
  const today = iso(now);
  const surgery = iso(now - 9 * DAY);
  const shot = (day: number) => ({
    front: { id: `front-${day}`, width: 360, height: 480 },
    top: { id: `top-${day}`, width: 360, height: 480 },
    back: { id: `back-${day}`, width: 360, height: 480 },
  });
  const frame = (day: number, status: Frame["status"], photos: Frame["photos"]): Frame => ({
    key: String(day),
    kind: "post_op",
    day,
    date: iso(now - (9 - day) * DAY),
    status,
    photos,
  });
  const frames: Frame[] = [
    { key: "pre", kind: "pre_op", day: null, date: iso(now - 12 * DAY), status: "done", photos: shot(0) },
    frame(0, "done", shot(0)),
    frame(1, "done", shot(3)),
    frame(2, "done", shot(3)),
    frame(3, "done", shot(3)),
    frame(5, "partial", { front: shot(3).front }),
    frame(7, "done", shot(9)),
    frame(9, "today", { front: shot(9).front }),
    frame(14, "upcoming", {}),
    frame(21, "upcoming", {}),
  ];
  const content: ContentItem[] = [
    { id: "g1", phase: "post_op", fromDay: 7, toDay: 14, contentType: "instruction", title: "חפיפה עדינה פעמיים ביום", body: { blocks: [] } as never },
    { id: "g2", phase: "post_op", fromDay: 7, toDay: 30, contentType: "recommendation", title: "להימנע משמש ישירה על האזור", body: { blocks: [] } as never },
    { id: "g3", phase: "post_op", fromDay: 5, toDay: 21, contentType: "tip", title: "גרד קל הוא חלק רגיל מההחלמה", body: { blocks: [] } as never },
  ];
  const timeline: TimelineData = {
    slug: PREVIEW_SLUG,
    frames,
    logo: null,
    today,
    surgeryDate: surgery,
    surgeryDone: true,
    notes: { [iso(now - 2 * DAY)]: "הגלדים מתחילים לרדת." },
    content,
    totalDays: 180,
    archived: false,
  };
  return { today, surgery, day: 9, todayPhotos: { front: shot(9).front }, content, timeline };
}
