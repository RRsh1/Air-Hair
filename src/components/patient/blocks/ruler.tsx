import { formatDayMonth } from "@/components/patient/format";
import type { ThemeBlocks } from "@/lib/theme/patient-theme";
import type { IsoDate } from "@/lib/timeline/days";

export type RulerData = {
  /** Post-op day today, or null before surgery. */
  day: number | null;
  totalDays: number;
  plannedSurgeryDate: IsoDate | null;
};

const DAYS_PER_MONTH = 30.44;

/**
 * The recovery ruler: surgery day to the end of follow-up, one tick per week. Ticks grow taller
 * toward the end, like the hair they measure; a needle marks today. Time runs from the start edge.
 */
export function RulerBlock({ config, data }: { config: ThemeBlocks["ruler"]; data: RulerData }) {
  if (config.variant === "hidden") return null;
  const total = Math.max(data.totalDays, 30);
  const day = data.day === null ? null : Math.min(Math.max(data.day, 0), total);
  const months = Math.floor(total / DAYS_PER_MONTH);
  const week = day === null ? 0 : Math.floor(day / 7) + 1;
  const weeks = Math.ceil(total / 7);
  const summary =
    day === null
      ? data.plannedSurgeryDate
        ? `הניתוח ב-${formatDayMonth(data.plannedSurgeryDate)}`
        : "לפני הניתוח"
      : `שבוע ${Math.min(week, weeks)} מתוך ${weeks}`;

  if (config.variant === "bar") {
    const pct = day === null ? 0 : (day / total) * 100;
    return (
      <section data-block="ruler" aria-label={`ציר ההחלמה: ${summary}`} className="mx-auto w-full max-w-md px-5 pb-6">
        <div className="h-2 overflow-hidden rounded-full bg-rl-line">
          <div className="h-full rounded-full bg-rl-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[0.8125rem] text-rl-muted">
          <span>{summary}</span>
          <span>חודש {months}</span>
        </div>
      </section>
    );
  }

  const ticks = Array.from({ length: weeks + 1 }, (_, i) => i * 7).filter((d) => d <= total);
  const labels = Array.from({ length: months }, (_, i) => i + 1).filter((m) => months <= 8 || m % 2 === 0);

  return (
    <section data-block="ruler" aria-label={`ציר ההחלמה: ${summary}`} className="mx-auto w-full max-w-md px-5 pb-7">
      <div aria-hidden="true" className="relative h-7">
        {ticks.map((d, i) => {
          const past = day !== null && d <= day;
          const isMonth = labels.some((m) => Math.abs(m * DAYS_PER_MONTH - d) < 3.5);
          const height = 7 + Math.round((i / (ticks.length - 1)) * 13);
          return (
            <span
              key={d}
              className={`absolute bottom-0 w-px ${past ? "bg-rl-ink" : "bg-rl-line"} ${isMonth ? "w-[1.5px]" : ""}`}
              style={{ insetInlineStart: `${(d / total) * 100}%`, height }}
            />
          );
        })}
        <span className="absolute inset-x-0 bottom-0 h-px bg-rl-line" />
        {day !== null && (
          <span className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center rtl:translate-x-1/2" style={{ insetInlineStart: `${(day / total) * 100}%` }}>
            <span className="h-2 w-2 rounded-full bg-rl-accent" />
            <span className="h-6 w-0.5 bg-rl-accent" />
          </span>
        )}
      </div>
      <div aria-hidden="true" className="relative mt-1.5 h-4 text-[0.8125rem] leading-4 text-rl-muted">
        <span className="absolute start-0">ניתוח</span>
        {labels.map((m) => {
          const pct = ((m * DAYS_PER_MONTH) / total) * 100;
          // The last label would overhang the end edge when centered; pin it to the edge instead.
          return pct > 90 ? (
            <span key={m} className="p-numeral absolute end-0 whitespace-nowrap">
              חודש {m}
            </span>
          ) : (
            <span
              key={m}
              className="p-numeral absolute -translate-x-1/2 whitespace-nowrap rtl:translate-x-1/2"
              style={{ insetInlineStart: `${pct}%` }}
            >
              {m}
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-[0.8125rem] text-rl-muted">{summary}</p>
    </section>
  );
}
