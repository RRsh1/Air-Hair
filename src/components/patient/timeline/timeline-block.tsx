"use client";

import { useState, useSyncExternalStore } from "react";
import { Segmented } from "@/components/patient/segmented";
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
  const storageKey = `hairair:view:${data.slug}`;
  const stored = useSyncExternalStore(subscribeToStorage, () => readStorage(storageKey), () => null) as TimelineView | null;
  const [chosen, setChosen] = useState<TimelineView | null>(null);
  const view = chosen ?? (stored && enabled.includes(stored) ? stored : enabled[0]);

  const choose = (next: TimelineView) => {
    setChosen(next);
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
        <div className="mx-auto w-full max-w-md px-5 pb-5">
          <Segmented label="תצוגת הציר" options={enabled.map((v) => ({ value: v, label: viewLabel[v] }))} value={view} onChange={choose} />
        </div>
      )}
      <View data={data} />
    </section>
  );
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private mode or blocked storage: the clinic's default applies
  }
}
