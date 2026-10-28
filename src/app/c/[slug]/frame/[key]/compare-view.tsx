"use client";

import { useState } from "react";
import { angleLabel, photoUrl } from "@/components/patient/format";
import { PhotoLogo, type PhotoLogoConfig } from "@/components/patient/photo-logo";
import type { Frame } from "@/lib/journal/film-strip";
import { photoAngles, type PhotoAngle } from "@/lib/timeline/capture-schedule";

export type ComparableFrame = { key: string; title: string; photos: Frame["photos"] };

/**
 * One day's photos by angle, with an optional before/after slider against an earlier day.
 * The slider reveals the earlier photo from the right (the reading start in Hebrew).
 */
export function CompareView({
  slug,
  current,
  frames,
  logo,
}: {
  slug: string;
  current: string;
  frames: ComparableFrame[];
  logo: PhotoLogoConfig;
}) {
  const frame = frames.find((f) => f.key === current)!;
  const available = photoAngles.filter((angle) => frame.photos[angle]);
  const [angle, setAngle] = useState<PhotoAngle>(available[0]);
  const candidates = frames.filter((f) => f.key !== current && f.photos[angle]);
  const [againstKey, setAgainstKey] = useState<string>("");
  const against = candidates.find((f) => f.key === againstKey);
  const [split, setSplit] = useState(50);

  const photo = frame.photos[angle]!;
  // Comparison labels sit on the edge the logo doesn't use.
  const labelEdge = logo?.position.startsWith("top") ? "bottom-2" : "top-2";
  const earlier = against?.photos[angle];

  return (
    <div>
      <div role="tablist" aria-label="זווית" className="flex gap-1 rounded-p bg-p-surface p-1">
        {available.map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={a === angle}
            onClick={() => {
              setAngle(a);
              setAgainstKey("");
            }}
            className={`flex-1 rounded-[calc(var(--p-radius)-4px)] py-2 text-[0.9375rem] font-medium ${
              a === angle ? "bg-p-accent text-p-accent-ink" : "text-p-muted"
            }`}
          >
            {angleLabel[a]}
          </button>
        ))}
      </div>

      <div className="relative mt-3 aspect-[3/4] overflow-hidden rounded-p bg-p-film">
        {/* eslint-disable-next-line @next/next/no-img-element -- private photo served by an authenticated route */}
        <img src={photoUrl(slug, photo.id)} alt={`${frame.title}, ${angleLabel[angle]}`} className="absolute inset-0 h-full w-full object-cover" />
        {earlier && (
          <>
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${100 - split}%)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private photo served by an authenticated route */}
              <img src={photoUrl(slug, earlier.id)} alt={`${against!.title}, ${angleLabel[angle]}`} className="absolute inset-0 h-full w-full object-cover" />
            </div>
            <div aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-white/90" style={{ left: `${100 - split}%` }} />
            <span className={`absolute right-2 ${labelEdge} rounded bg-black/45 px-2 py-0.5 text-[0.8125rem] font-medium text-white`}>{against!.title}</span>
            <span className={`absolute left-2 ${labelEdge} rounded bg-black/45 px-2 py-0.5 text-[0.8125rem] font-medium text-white`}>{frame.title}</span>
          </>
        )}
        <PhotoLogo logo={logo} />
      </div>

      {candidates.length > 0 && (
        <div className="mt-4 space-y-3">
          <label htmlFor="against" className="block text-[0.9375rem] font-medium">
            השוואה ליום אחר
          </label>
          <select
            id="against"
            value={againstKey}
            onChange={(event) => setAgainstKey(event.target.value)}
            className="block h-12 w-full rounded-p border border-p-line bg-p-surface px-3 text-[1rem]"
          >
            <option value="">בלי השוואה</option>
            {candidates.map((f) => (
              <option key={f.key} value={f.key}>
                {f.title}
              </option>
            ))}
          </select>
          {earlier && (
            <input
              type="range"
              min={0}
              max={100}
              value={split}
              onChange={(event) => setSplit(Number(event.target.value))}
              aria-label="הזזת קו ההשוואה"
              className="w-full accent-[var(--p-accent)]"
            />
          )}
        </div>
      )}
    </div>
  );
}
