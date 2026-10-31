import { selectTreatmentAction } from "@/app/c/[slug]/treatment/actions";
import type { TreatmentSummary } from "@/lib/journal/patient-journal";

const statusLabel: Record<TreatmentSummary["status"], string> = {
  scheduled: "מתוכנן",
  performed: "בהחלמה",
  completed: "הסתיים",
  cancelled: "בוטל",
};

/**
 * The patient's treatments, when there is more than one (a returning patient, or two procedures at
 * once). Each is its own diary; switching is a plain form post, so it works before scripts load.
 */
export function TreatmentSwitcher({ slug, treatments, selectedId }: { slug: string; treatments: TreatmentSummary[]; selectedId: string }) {
  if (treatments.length < 2) return null;
  return (
    <nav aria-label="הטיפולים שלי" className="mx-auto w-full max-w-md pt-3">
      <ul className="p-scroll flex gap-2 overflow-x-auto px-5 pb-1">
        {treatments.map((treatment) => {
          const selected = treatment.id === selectedId;
          const live = treatment.status === "scheduled" || treatment.status === "performed";
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-[0.9375rem] font-medium leading-tight">
                {live && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-p-accent" />}
                {treatment.name}
              </span>
              <span className="mt-0.5 block text-[0.8125rem] leading-tight text-p-muted">
                {statusLabel[treatment.status]} · {treatment.anchorDate.slice(0, 4)}
              </span>
            </>
          );
          const shape = "block min-w-[8.5rem] rounded-p border px-3.5 py-2.5 text-start";
          return (
            <li key={treatment.id} className="shrink-0">
              {selected ? (
                <span aria-current="true" className={`${shape} border-p-ink bg-p-surface text-p-ink shadow-[inset_0_0_0_1px_var(--p-ink)]`}>
                  {body}
                </span>
              ) : (
                <form action={selectTreatmentAction.bind(null, slug, treatment.id)}>
                  <button type="submit" className={`${shape} border-p-line text-p-ink transition-colors hover:border-p-muted`}>
                    {body}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
