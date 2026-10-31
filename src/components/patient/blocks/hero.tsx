import { formatDayMonth } from "@/components/patient/format";
import { formatWeekdayDate } from "@/components/patient/timeline/shared";
import type { ThemeBlocks } from "@/lib/theme/patient-theme";
import type { IsoDate } from "@/lib/timeline/days";

export type HeroData = {
  firstName: string;
  today: IsoDate;
  position:
    | { phase: "pre_op" }
    | { phase: "post_op"; day: number }
    /** A completed or cancelled treatment the patient is looking back at. */
    | { phase: "archived"; status: "completed" | "cancelled"; treatmentName: string; anchorDate: IsoDate };
  plannedSurgeryDate: IsoDate | null;
};

const fullDate = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Greeting and where the patient is in the recovery. Variants: numeral, compact, banner. */
export function HeroBlock({ config, data }: { config: ThemeBlocks["hero"]; data: HeroData }) {
  const { position } = data;
  const banner = config.variant === "banner";

  const body =
    position.phase === "archived" ? (
      <>
        <p className="text-[1.0625rem] text-hr-muted">שלום {data.firstName}</p>
        <h1 className={`p-title mt-1 leading-tight text-hr-ink ${config.variant === "compact" ? "text-[1.6875rem]" : "text-[2.125rem]"}`}>
          {position.treatmentName}
        </h1>
        <p className="mt-2 text-[1rem] text-hr-ink">
          {position.status === "completed"
            ? `הטיפול הסתיים · יום הניתוח ${fullDate.format(new Date(`${position.anchorDate}T00:00:00Z`))}`
            : "הטיפול בוטל"}
        </p>
        <p className="mt-1 max-w-[34ch] text-[0.9375rem] leading-relaxed text-hr-muted">
          כל התיעוד נשמר כאן לצפייה. אפשר לעבור בין הימים ולהשוות תמונות.
        </p>
      </>
    ) : position.phase === "post_op" ? (
      config.variant === "compact" ? (
        <>
          <p className="text-[1.0625rem] text-hr-muted">שלום {data.firstName}</p>
          <h1 className="p-title mt-1 text-[1.6875rem] leading-tight text-hr-ink">
            <span className="p-numeral">יום {position.day}</span> להחלמה
          </h1>
          <p className="mt-1 text-[0.9375rem] text-hr-muted">{formatWeekdayDate(data.today)}</p>
        </>
      ) : (
        <>
          <p className="text-[1.0625rem] text-hr-muted">שלום {data.firstName}</p>
          <h1 className="mt-2 flex items-baseline gap-3 text-hr-ink">
            <span className="p-numeral p-title text-[3.375rem] leading-[0.9]">יום {position.day}</span>
            <span className="text-[1.0625rem] text-hr-muted">להחלמה</span>
          </h1>
          <p className="mt-3 text-[0.9375rem] text-hr-muted">{formatWeekdayDate(data.today)}</p>
        </>
      )
    ) : (
      <>
        <p className="text-[1.0625rem] text-hr-muted">שלום {data.firstName}</p>
        <h1 className={`p-title mt-1 leading-tight text-hr-ink ${config.variant === "compact" ? "text-[1.6875rem]" : "text-[2.125rem]"}`}>
          לפני הניתוח
        </h1>
        <p className="mt-2 max-w-[34ch] text-[1rem] leading-relaxed text-hr-muted">
          {data.plannedSurgeryDate
            ? `הניתוח מתוכנן ל-${formatDayMonth(data.plannedSurgeryDate)}. צלמו עכשיו תיעוד אחד, כדי שתוכלו להשוות אליו לאורך ההחלמה.`
            : "צלמו עכשיו תיעוד אחד, כדי שתוכלו להשוות אליו לאורך ההחלמה."}
        </p>
      </>
    );

  return (
    <section data-block="hero" aria-label="היום שלך" className="mx-auto w-full max-w-md px-5 pb-5 pt-4">
      {banner ? <div className="rounded-p bg-hr-bg px-5 py-6">{body}</div> : body}
    </section>
  );
}
