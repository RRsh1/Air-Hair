import Link from "next/link";
import type { Frame } from "@/lib/journal/film-strip";
import { formatShortDate, photoUrl } from "./format";
import { ScrollIntoView } from "./scroll-into-view";

/**
 * The signature of the patient app: recovery days as frames on a strip of film.
 * Frames read right to left like the rest of the page; today's frame is scrolled into view.
 */
export function FilmStrip({ slug, frames }: { slug: string; frames: Frame[] }) {
  const focusKey = frames.find((f) => f.status === "today")?.key ?? frames.findLast((f) => f.status === "done")?.key;

  return (
    <section aria-label="ציר ההחלמה" className="relative bg-p-film py-5">
      <Sprockets className="top-1.5" />
      <ol className="flex snap-x gap-2.5 overflow-x-auto px-5 py-1 [scrollbar-width:none]">
        {frames.map((frame) => (
          <li key={frame.key} className="snap-center">
            <FrameCell slug={slug} frame={frame} focused={frame.key === focusKey} />
          </li>
        ))}
      </ol>
      <Sprockets className="bottom-1.5" />
    </section>
  );
}

const statusLabel: Record<Frame["status"], string> = {
  done: "צולם",
  partial: "חלקי",
  today: "היום",
  missed: "לא צולם",
  upcoming: "בהמשך",
  locked: "אחרי הניתוח",
};

function FrameCell({ slug, frame, focused }: { slug: string; frame: Frame; focused: boolean }) {
  const thumb = frame.photos.front ?? frame.photos.top ?? frame.photos.back;
  const title = frame.kind === "pre_op" ? "לפני" : `יום ${frame.day}`;
  const today = frame.status === "today";
  const clickable = frame.status !== "upcoming" && frame.status !== "locked";

  const body = (
    <div
      className={`relative flex h-36 w-[6.5rem] flex-col overflow-hidden rounded-[4px] bg-p-film-frame ${
        today ? "ring-2 ring-white ring-offset-2 ring-offset-p-film" : ""
      } ${frame.status === "upcoming" || frame.status === "locked" ? "opacity-45" : ""}`}
    >
      <div className="relative flex-1">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- private photo served by an authenticated route
          <img src={photoUrl(slug, thumb.id)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : frame.status === "missed" ? (
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 7px, rgba(255,255,255,.06) 7px 8px)" }}
          />
        ) : null}
        {!thumb && today && (
          <span className="absolute inset-0 flex items-center justify-center text-[0.8125rem] font-semibold text-white">לצלם עכשיו</span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-1 bg-black/25 px-2 py-1.5 text-white">
        <span className="text-[0.9375rem] font-semibold">{title}</span>
        <span dir="ltr" className="text-[0.75rem] tabular-nums text-white/70">
          {frame.date ? formatShortDate(frame.date) : ""}
        </span>
      </div>
      <span className="sr-only">{statusLabel[frame.status]}</span>
    </div>
  );

  return (
    <>
      {focused && <ScrollIntoView targetId={`frame-${frame.key}`} />}
      {clickable ? (
        <Link href={`/c/${slug}/frame/${frame.key}`} id={`frame-${frame.key}`} aria-label={`${title}, ${statusLabel[frame.status]}`} className="block rounded-[4px]">
          {body}
        </Link>
      ) : (
        <div id={`frame-${frame.key}`} aria-label={`${title}, ${statusLabel[frame.status]}`}>
          {body}
        </div>
      )}
    </>
  );
}

function Sprockets({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 block h-2.5 ${className}`}
      style={{
        backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--p-bg) 85%, transparent) 0 3px, transparent 3.5px)",
        backgroundSize: "16px 10px",
        backgroundPosition: "center",
      }}
    />
  );
}
