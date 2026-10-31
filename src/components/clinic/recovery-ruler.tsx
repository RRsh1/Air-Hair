import type { TreatmentLine } from "@/lib/clinic-patients/patients";
import { formatShort } from "./format";

/** Milestones of a follow-up, in days after surgery. */
const MARKS = [7, 30, 90, 180, 365];

/** Square-root scale: the first weeks, where most happens, get room; the last months stay visible. */
const at = (day: number, total: number) => Math.sqrt(Math.min(Math.max(day, 0), total) / total) * 100;

/**
 * Where a treatment stands: a small ruler of the follow-up with today's day on it, or the planned
 * date before surgery. The same idea as the patient's ruler, at register size.
 */
export function RecoveryRuler({ treatment, totalDays }: { treatment: TreatmentLine; totalDays: number }) {
  if (treatment.status === "scheduled") {
    return (
      <p className="text-[0.9375rem] text-slate">
        ניתוח ב-<span className="tabular-nums text-ink">{formatShort(treatment.plannedSurgeryDate)}</span>
      </p>
    );
  }
  if (treatment.status !== "performed" || treatment.day === null) {
    return <p className="text-[0.9375rem] text-slate">{treatment.status === "cancelled" ? "בוטל" : "הסתיים"}</p>;
  }
  const position = at(treatment.day, totalDays);
  const over = treatment.day > totalDays;
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[0.9375rem] font-semibold tabular-nums text-ink">יום {treatment.day}</span>
      <span className="relative block h-3 w-full max-w-36" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        {MARKS.filter((m) => m <= totalDays).map((m) => (
          <span key={m} className="absolute top-[3px] h-1.5 w-px bg-line" style={{ insetInlineStart: `${at(m, totalDays)}%` }} />
        ))}
        <span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-petrol" style={{ insetInlineStart: 0, width: `${position}%` }} />
        <span
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-surface ${over ? "bg-slate" : "bg-petrol"}`}
          style={{ insetInlineStart: `calc(${position}% - 5px)` }}
        />
      </span>
    </div>
  );
}
