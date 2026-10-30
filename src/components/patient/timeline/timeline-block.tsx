"use client";

import { useEffect, useState } from "react";
import type { ThemeBlocks, TimelineView } from "@/lib/theme/patient-theme";
import { CalendarView } from "./calendar";
import { CardsView } from "./cards";
import { FilmView } from "./film";
import { GalleryView } from "./gallery";
import { JournalView } from "./journal";
import type { TimelineData } from "./shared";

export const viewLabel: Record<TimelineView, string> = {
  film: "סרט",
  journal: "יומן",
  gallery: "גלריה",
  calendar: "לוח",
  cards: "כרטיסים",
};

const views: Record<TimelineView, (props: { data: TimelineData }) => React.ReactNode> = {
  film: FilmView,
  journal: JournalView,
  gallery: GalleryView,
  calendar: CalendarView,
  cards: CardsView,
};

/**
 * The recovery timeline in the views the clinic enabled; the first is the default. When there is
 * more than one, the patient can switch, and the choice is remembered on this device.
 */
export function TimelineBlock({ config, data }: { config: ThemeBlocks["timeline"]; data: TimelineData }) {
  const enabled = config.views;
  const [view, setView] = useState<TimelineView>(enabled[0]);
  const storageKey = `hairair:view:${data.slug}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) as TimelineView | null;
      if (saved && enabled.includes(saved)) setView(saved);
    } catch {
      // Storage unavailable (private mode): keep the clinic's default.
    }
  }, [storageKey, enabled]);

  const choose = (next: TimelineView) => {
    setView(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Not remembered; nothing else depends on it.
    }
  };

  const View = views[enabled.includes(view) ? view : enabled[0]];
  return (
    <section data-block="timeline" aria-label="ציר ההחלמה" className="pb-2">
      {enabled.length > 1 && (
        <div className="mx-auto w-full max-w-md px-5 pb-4">
          <div role="radiogroup" aria-label="תצוגת הציר" className="p-scroll flex gap-1 overflow-x-auto">
            {enabled.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={v === view}
                onClick={() => choose(v)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[0.875rem] transition-colors ${
                  v === view ? "bg-tl-ink text-p-bg" : "text-tl-muted hover:text-tl-ink"
                }`}
              >
                {viewLabel[v]}
              </button>
            ))}
          </div>
        </div>
      )}
      <View data={data} />
    </section>
  );
}
