"use client";

import Link from "next/link";
import { useState } from "react";
import { angleLabel, photoUrl } from "@/components/patient/format";
import { Photo } from "@/components/patient/photo";
import { Segmented } from "@/components/patient/segmented";
import { photoAngles, type PhotoAngle } from "@/lib/timeline/capture-schedule";
import { frameHref, frameShortTitle, frameTitle, isOpenable, type TimelineData } from "./shared";

/**
 * A contact sheet: one angle across every day so far, three to a row, the day printed under each
 * frame. Switching the angle is the only control.
 */
export function GalleryView({ data }: { data: TimelineData }) {
  const [angle, setAngle] = useState<PhotoAngle>("front");
  const frames = data.frames.filter(isOpenable);

  return (
    <div className="mx-auto w-full max-w-md px-5">
      <AngleSwitch value={angle} onChange={setAngle} />
      {frames.length === 0 ? (
        <p className="mt-4 text-[0.9375rem] text-tl-muted">התמונות יופיעו כאן אחרי הצילום הראשון.</p>
      ) : (
        <ol className="mt-4 grid grid-cols-3 gap-x-2 gap-y-3">
          {frames.map((frame) => {
            const photo = frame.photos[angle];
            return (
              <li key={frame.key}>
                <Link href={frameHref(data.slug, frame)} aria-label={`${frameTitle(frame)}, ${angleLabel[angle]}`} className="block rounded-[calc(var(--p-radius)*0.5)]">
                  {photo ? (
                    <Photo src={photoUrl(data.slug, photo.id)} alt="" logo={data.logo} className="aspect-[3/4] rounded-[calc(var(--p-radius)*0.5)] bg-tl-tint" />
                  ) : (
                    <span
                      className={`flex aspect-[3/4] items-center justify-center rounded-[calc(var(--p-radius)*0.5)] border border-dashed text-[0.8125rem] ${
                        frame.status === "today" ? "border-tl-accent font-medium text-tl-accent" : "p-hatch border-tl-line text-tl-muted"
                      }`}
                    >
                      {frame.status === "today" ? "לצלם היום" : ""}
                    </span>
                  )}
                  <span className="mt-1.5 block text-[0.8125rem] text-tl-ink">
                    <span className="p-numeral">{frameShortTitle(frame)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function AngleSwitch({ value, onChange }: { value: PhotoAngle; onChange: (angle: PhotoAngle) => void }) {
  return <Segmented label="זווית" options={photoAngles.map((a) => ({ value: a, label: angleLabel[a] }))} value={value} onChange={onChange} />;
}
