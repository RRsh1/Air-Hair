import Link from "next/link";
import { angleHint, angleLabel, formatDayMonth, photoUrl } from "@/components/patient/format";
import { Photo, type PhotoLogo } from "@/components/patient/photo";
import type { Frame } from "@/lib/journal/film-strip";
import type { ThemeBlocks } from "@/lib/theme/patient-theme";
import { photoAngles, type PhotoAngle } from "@/lib/timeline/capture-schedule";

export type CaptureData = {
  slug: string;
  open: PhotoAngle[];
  photos: Frame["photos"];
  next: { day: number | null; date: string | null } | null;
  logo: PhotoLogo;
};

/** Today's three angles. Variants: tiles (a row of three frames) or rows (a checklist). */
export function CaptureBlock({ config, data }: { config: ThemeBlocks["capture"]; data: CaptureData }) {
  if (data.open.length === 0) {
    return (
      <section data-block="capture" className="mx-auto w-full max-w-md px-5">
        <h2 className="p-heading text-[1.3125rem] text-cp-ink">אין צילום היום</h2>
        <p className="mt-1.5 text-[1rem] leading-relaxed text-cp-muted">
          {data.next?.date && data.next.day !== null
            ? `הצילום הבא ביום ${data.next.day}, ${formatDayMonth(data.next.date as never)}.`
            : "הצילום הבא יופיע כאן כשיגיע מועדו."}
        </p>
      </section>
    );
  }

  const done = photoAngles.filter((a) => data.photos[a]).length;
  return (
    <section data-block="capture" className="mx-auto w-full max-w-md px-5">
      <div className="flex items-baseline justify-between">
        <h2 className="p-heading text-[1.3125rem] text-cp-ink">הצילום של היום</h2>
        <p className="p-numeral text-[0.9375rem] text-cp-muted">
          {done} מתוך {photoAngles.length}
        </p>
      </div>
      {config.variant === "rows" ? <Rows data={data} /> : <Tiles data={data} />}
      {done === photoAngles.length && (
        <p className="mt-3 text-[0.9375rem] text-cp-muted">התיעוד של היום הושלם. אפשר לצלם שוב כל זווית עד סוף היום.</p>
      )}
    </section>
  );
}

function Tiles({ data }: { data: CaptureData }) {
  return (
    <ul className="mt-3 grid grid-cols-3 gap-2">
      {photoAngles.map((angle) => {
        const photo = data.photos[angle];
        const allowed = data.open.includes(angle);
        const tile = photo ? (
          <Photo src={photoUrl(data.slug, photo.id)} alt={`צילום ${angleLabel[angle]}`} logo={data.logo} className="aspect-[3/4] rounded-p bg-cp-line">
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2 pb-1.5 pt-7 text-center text-[0.9375rem] font-medium text-white">
              {angleLabel[angle]}
            </span>
          </Photo>
        ) : (
          <span className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-p border-[1.5px] border-dashed border-cp-accent/50 bg-cp-bg text-cp-accent">
            <CameraIcon />
            <span className="text-[0.9375rem] font-medium text-cp-ink">{angleLabel[angle]}</span>
          </span>
        );
        return (
          <li key={angle}>
            {allowed ? (
              <Link href={`/c/${data.slug}/capture/${angle}`} aria-label={photo ? `צילום חוזר, ${angleLabel[angle]}` : `לצלם ${angleLabel[angle]}`} className="block rounded-p">
                {tile}
              </Link>
            ) : (
              <div className="opacity-50">{tile}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Rows({ data }: { data: CaptureData }) {
  return (
    <ul className="mt-3 overflow-hidden rounded-p bg-cp-bg">
      {photoAngles.map((angle, i) => {
        const photo = data.photos[angle];
        const allowed = data.open.includes(angle);
        const row = (
          <span className={`flex items-center gap-3.5 px-3.5 py-3 ${i > 0 ? "border-t border-cp-line" : ""}`}>
            {photo ? (
              <Photo src={photoUrl(data.slug, photo.id)} alt="" logo={null} className="aspect-[3/4] w-12 shrink-0 rounded-[calc(var(--p-radius)*0.5)]" />
            ) : (
              <span className="flex aspect-[3/4] w-12 shrink-0 items-center justify-center rounded-[calc(var(--p-radius)*0.5)] border-[1.5px] border-dashed border-cp-accent/50 text-cp-accent">
                <CameraIcon small />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[1.0625rem] font-medium text-cp-ink">{angleLabel[angle]}</span>
              <span className="block truncate text-[0.875rem] text-cp-muted">{photo ? "צולם" : angleHint[angle]}</span>
            </span>
            {allowed && <span className="shrink-0 text-[0.9375rem] font-medium text-cp-accent">{photo ? "שוב" : "לצלם"}</span>}
          </span>
        );
        return <li key={angle}>{allowed ? <Link href={`/c/${data.slug}/capture/${angle}`}>{row}</Link> : row}</li>;
      })}
    </ul>
  );
}

function CameraIcon({ small }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={small ? "h-5 w-5" : "h-7 w-7"} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.4-2h5.8l1.4 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
