import type { ThemeBlocks } from "@/lib/theme/patient-theme";
import { DiaryView } from "./diary";
import type { TimelineData } from "./shared";

/** The recovery diary block: overview of the whole follow-up, months, and days. */
export function TimelineBlock({ data }: { config: ThemeBlocks["timeline"]; data: TimelineData }) {
  return (
    <section data-block="timeline" aria-labelledby="diary-title" className="border-t border-tl-line pb-2 pt-8">
      <h2 id="diary-title" className="p-heading mx-auto mb-3 w-full max-w-md px-5 text-[1.3125rem] text-tl-ink">
        היומן שלי
      </h2>
      <DiaryView data={data} />
    </section>
  );
}
