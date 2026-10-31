import type { PhotoAngle } from "@/lib/timeline/capture-schedule";
import type { IsoDate } from "@/lib/timeline/days";

const dayMonth = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", timeZone: "UTC" });

/** "12 ביוני" */
export const formatDayMonth = (date: IsoDate) => dayMonth.format(new Date(`${date}T00:00:00Z`));
/** "12.6" */
export const formatShortDate = (date: IsoDate) => shortDate.format(new Date(`${date}T00:00:00Z`));

export const angleLabel: Record<PhotoAngle, string> = { front: "קדימה", top: "למעלה", back: "אחורה" };

export const angleHint: Record<PhotoAngle, string> = {
  front: "פנים ישר למצלמה, קו השיער במרכז.",
  top: "קודקוד הראש מלמעלה, המצלמה מעל הראש.",
  back: "העורף והחלק האחורי של הראש.",
};

/** Slug of the branding editor's preview (never a real clinic slug: underscores aren't allowed). */
export const PREVIEW_SLUG = "__preview";

/** A patient photo; in the branding preview, a bundled sample image instead. */
export const photoUrl = (slug: string, photoId: string) =>
  slug === PREVIEW_SLUG ? `/branding-preview/${photoId}.jpg` : `/c/${slug}/photos/${photoId}`;
