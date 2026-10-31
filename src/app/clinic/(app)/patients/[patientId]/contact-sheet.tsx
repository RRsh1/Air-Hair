import type { CaptureDay } from "@/lib/clinic-patients/patients";
import { formatShort } from "@/components/clinic/format";

const angles = [
  { key: "front", label: "קדימה" },
  { key: "top", label: "למעלה" },
  { key: "back", label: "אחורה" },
] as const;

/**
 * The treatment's photos as a contact sheet: one column per photographed day, one row per angle,
 * so the same angle reads across the recovery. Each photo opens full size.
 */
export function ContactSheet({ days }: { days: CaptureDay[] }) {
  return (
    <div className="mt-3 flex overflow-x-auto pb-2">
      <div className="sticky start-0 z-10 shrink-0 bg-surface pe-3" aria-hidden="true">
        <div className="h-11" />
        {angles.map((a) => (
          <div key={a.key} className="flex h-[6.5rem] items-center text-[0.8125rem] text-slate">
            {a.label}
          </div>
        ))}
      </div>
      <ol className="flex gap-2">
        {days.map((day) => (
          <li key={day.key} className="w-[4.5rem] shrink-0">
            <p className="h-11 pt-1 text-center leading-tight">
              <span className="block text-[0.875rem] font-semibold">{day.label}</span>
              <span className="block text-[0.75rem] tabular-nums text-slate">{formatShort(day.date)}</span>
            </p>
            {angles.map((a) => {
              const photo = day.photos.find((p) => p.angle === a.key);
              return (
                <div key={a.key} className="h-[6.5rem] py-1">
                  {photo ? (
                    <a href={`/clinic/photos/${photo.id}`} target="_blank" rel="noopener" className="block h-full overflow-hidden rounded-[5px] bg-paper" aria-label={`${day.label}, ${a.label}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- private photo route, no optimizer */}
                      <img src={`/clinic/photos/${photo.id}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </a>
                  ) : (
                    <span className="block h-full rounded-[5px] border border-dashed border-line" />
                  )}
                </div>
              );
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}
