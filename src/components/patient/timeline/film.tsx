import Link from "next/link";
import { formatShortDate, photoUrl } from "@/components/patient/format";
import { Photo } from "@/components/patient/photo";
import { ScrollIntoView } from "@/components/patient/scroll-into-view";
import type { Frame } from "@/lib/journal/film-strip";
import { focusFrame, frameHref, frameShortTitle, isOpenable, statusText, type TimelineData } from "./shared";

/**
 * A strip of 35mm film: perforations along both edges, the day printed in the rebate under each
 * frame like edge numbers. Today's frame carries a mark in the accent color.
 */
export function FilmView({ data }: { data: TimelineData }) {
  const focus = focusFrame(data.frames);
  return (
    <div className="relative bg-tl-film py-[18px] text-tl-film-ink">
      <Perforations className="top-[5px]" />
      <ol className="p-scroll flex snap-x gap-[3px] overflow-x-auto px-5">
        {data.frames.map((frame) => (
          <li key={frame.key} className="snap-center">
            {focus?.key === frame.key && <ScrollIntoView targetId={`film-${frame.key}`} />}
            <FilmFrame data={data} frame={frame} />
          </li>
        ))}
      </ol>
      <Perforations className="bottom-[5px]" />
    </div>
  );
}

function FilmFrame({ data, frame }: { data: TimelineData; frame: Frame }) {
  const photo = frame.photos.front ?? frame.photos.top ?? frame.photos.back;
  const dim = !isOpenable(frame);
  const body = (
    <div className={`w-[6.75rem] ${dim ? "opacity-40" : ""}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-[2px] bg-white/[0.06]">
        {photo ? (
          <Photo src={photoUrl(data.slug, photo.id)} alt="" logo={data.logo} className="absolute inset-0" />
        ) : frame.status === "missed" ? (
          <span className="p-hatch absolute inset-0" />
        ) : frame.status === "today" ? (
          <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[0.8125rem] font-medium">לצלם היום</span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between px-0.5">
        <span className="p-numeral text-[0.9375rem] font-medium">{frameShortTitle(frame)}</span>
        <span dir="ltr" className="p-numeral text-[0.75rem] opacity-60">
          {frame.date ? formatShortDate(frame.date) : ""}
        </span>
      </div>
      <span aria-hidden="true" className={`mx-auto mt-1 block h-[3px] w-6 rounded-full ${frame.status === "today" ? "bg-tl-accent" : "bg-transparent"}`} />
    </div>
  );

  const label = `${frameShortTitle(frame)}, ${statusText[frame.status]}`;
  return isOpenable(frame) ? (
    <Link href={frameHref(data.slug, frame)} id={`film-${frame.key}`} aria-label={label} className="block rounded-[3px] p-1.5">
      {body}
    </Link>
  ) : (
    <div id={`film-${frame.key}`} aria-label={label} className="p-1.5">
      {body}
    </div>
  );
}

/** Rounded-rectangle sprocket holes, spaced like 35mm stock, cut through to the page color. */
const HOLE = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='14' height='7'><rect x='3' width='8' height='7' rx='1.6'/></svg>",
)}")`;

function Perforations({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 block h-[7px] bg-p-bg ${className}`}
      style={{ maskImage: HOLE, WebkitMaskImage: HOLE, maskSize: "14px 7px", WebkitMaskSize: "14px 7px", maskRepeat: "repeat-x", WebkitMaskRepeat: "repeat-x" }}
    />
  );
}
