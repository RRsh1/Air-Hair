"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CaptureBlock } from "@/components/patient/blocks/capture";
import { GuidanceBlock } from "@/components/patient/blocks/guidance";
import { HeaderBlock } from "@/components/patient/blocks/header";
import { HeroBlock } from "@/components/patient/blocks/hero";
import { RulerBlock } from "@/components/patient/blocks/ruler";
import { PREVIEW_SLUG } from "@/components/patient/format";
import { photoLogo } from "@/components/patient/photo";
import { TimelineBlock } from "@/components/patient/timeline/timeline-block";
import type { BlockName, PatientTheme } from "@/lib/theme/patient-theme";
import { themeToCss } from "@/lib/theme/patient-theme";
import { samplePatient } from "./sample";

/**
 * The patient home screen, rendered with the draft theme by the same block components the app uses,
 * inside an iframe at phone width (so rem sizes, the type scale and media queries behave as on a phone).
 * Clicking a block selects it in the editor; links inside the preview don't navigate.
 */
export function ThemePreview({
  theme,
  clinicName,
  logoSrc,
  selected,
  onSelect,
}: {
  theme: PatientTheme;
  clinicName: string;
  logoSrc: string | null;
  selected: BlockName | null;
  onSelect: (block: BlockName) => void;
}) {
  const sample = samplePatient();
  const logo = photoLogo(theme, logoSrc);
  const blocks = theme.blocks;
  return (
    <PhoneFrame css={themeToCss(theme)} selected={selected} onSelect={onSelect}>
      <HeaderBlock config={blocks.header} clinicName={clinicName} logoSrc={logoSrc} end={<span className="text-[0.9375rem]">יציאה</span>} />
      <main className="flex-1">
        <HeroBlock config={blocks.hero} data={{ firstName: "דנה", today: sample.today, position: { phase: "post_op", day: sample.day }, plannedSurgeryDate: null }} />
        <RulerBlock config={blocks.ruler} data={{ day: sample.day, totalDays: 180, plannedSurgeryDate: null }} />
        <div className="space-y-10 pt-2">
          <CaptureBlock
            config={blocks.capture}
            data={{ slug: PREVIEW_SLUG, open: ["front", "top", "back"], photos: sample.todayPhotos, next: null, logo }}
          />
          <GuidanceBlock config={blocks.guidance} items={sample.content} />
        </div>
        <div className="pt-12">
          <TimelineBlock config={blocks.timeline} data={{ ...sample.timeline, logo }} />
        </div>
      </main>
      <footer data-block="footer" className="mx-auto w-full max-w-md px-5 pb-10 pt-8">
        <span className="text-[0.875rem] text-ft-ink">מדיניות הפרטיות של המרפאה</span>
      </footer>
    </PhoneFrame>
  );
}

function PhoneFrame({ css, selected, onSelect, children }: { css: string; selected: BlockName | null; onSelect: (b: BlockName) => void; children: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    const setup = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      // The dashboard's stylesheets (Tailwind utilities, patient fonts) are copied in once.
      for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) doc.head.appendChild(node.cloneNode(true));
      doc.documentElement.dir = "rtl";
      doc.documentElement.lang = "he";
      doc.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a")) event.preventDefault();
        const block = target.closest<HTMLElement>("[data-block]")?.dataset.block;
        if (block) onSelectRef.current(block as BlockName);
      });
      setBody(doc.body);
    };
    if (iframe.contentDocument?.readyState === "complete") setup();
    else iframe.addEventListener("load", setup, { once: true });
  }, []);

  return (
    <div className="rounded-[2.25rem] border border-line bg-ink/90 p-2.5 shadow-[0_24px_48px_-24px_rgb(23_38_43/0.45)]">
      <iframe
        ref={frame}
        title="תצוגה חיה של אפליקציית המטופל"
        srcDoc="<!doctype html><html><head><meta charset='utf-8'></head><body style='margin:0'></body></html>"
        className="block h-[44rem] w-[390px] max-w-full rounded-[1.75rem] bg-white"
      />
      {body &&
        createPortal(
          <div className="p-root flex min-h-dvh flex-col bg-p-bg text-p-ink" data-selected={selected ?? undefined}>
            <style>{css}</style>
            {selected && <style>{`[data-block="${selected}"]{outline:2px dashed #1f5c63;outline-offset:4px;border-radius:4px}`}</style>}
            {children}
          </div>,
          body,
        )}
    </div>
  );
}
