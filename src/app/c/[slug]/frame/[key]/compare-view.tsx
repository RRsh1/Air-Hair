"use client";

import { useState } from "react";
import { downloadWithLogo } from "@/components/patient/download-with-logo";
import { angleLabel, photoUrl } from "@/components/patient/format";
import { Photo, type PhotoLogo } from "@/components/patient/photo";
import type { Frame } from "@/lib/journal/film-strip";
import { photoAngles, type PhotoAngle } from "@/lib/timeline/capture-schedule";

export type ComparableFrame = { key: string; title: string; fileTag: string; photos: Frame["photos"] };

const angleTag: Record<PhotoAngle, string> = { front: "front", top: "top", back: "back" };

/**
 * One day's photos by angle, with an optional before/after slider against another day, and a
 * download that carries the clinic logo. The earlier photo is revealed from the start edge.
 */
export function CompareView({
  slug,
  current,
  frames,
  logo,
  logoOpacity,
}: {
  slug: string;
  current: string;
  frames: ComparableFrame[];
  logo: PhotoLogo;
  logoOpacity: number;
}) {
  const frame = frames.find((f) => f.key === current)!;
  const available = photoAngles.filter((angle) => frame.photos[angle]);
  const [angle, setAngle] = useState<PhotoAngle>(available[0]);
  const candidates = frames.filter((f) => f.key !== current && f.photos[angle]);
  const [againstKey, setAgainstKey] = useState("");
  const against = candidates.find((f) => f.key === againstKey);
  const [split, setSplit] = useState(50);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photo = frame.photos[angle]!;
  const earlier = against?.photos[angle];
  const labelEdge = logo?.position.startsWith("top") ? "bottom-2" : "top-2";

  async function download() {
    setSaving(true);
    setError(null);
    try {
      await downloadWithLogo({
        photoSrc: photoUrl(slug, photo.id),
        logo,
        opacity: logoOpacity,
        fileName: `hairair-${frame.fileTag}-${angleTag[angle]}.jpg`,
      });
    } catch {
      setError("ההורדה לא הצליחה. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div role="radiogroup" aria-label="זווית" className="flex gap-5 border-b border-p-line">
        {available.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={a === angle}
            onClick={() => {
              setAngle(a);
              setAgainstKey("");
            }}
            className={`-mb-px border-b-2 pb-2 text-[0.9375rem] ${a === angle ? "border-p-accent font-medium text-p-ink" : "border-transparent text-p-muted"}`}
          >
            {angleLabel[a]}
          </button>
        ))}
      </div>

      <Photo
        src={photoUrl(slug, photo.id)}
        alt={`${frame.title}, ${angleLabel[angle]}`}
        logo={logo}
        className="mt-4 aspect-[3/4] rounded-p bg-p-line"
      >
        {earlier && (
          <>
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${100 - split}%)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private photo served by an authenticated route */}
              <img src={photoUrl(slug, earlier.id)} alt={`${against!.title}, ${angleLabel[angle]}`} className="absolute inset-0 h-full w-full object-cover" />
            </div>
            <div aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-white/90" style={{ left: `${100 - split}%` }} />
            <span className={`absolute right-2 ${labelEdge} rounded-[3px] bg-black/50 px-2 py-0.5 text-[0.8125rem] font-medium text-white`}>{against!.title}</span>
            <span className={`absolute left-2 ${labelEdge} rounded-[3px] bg-black/50 px-2 py-0.5 text-[0.8125rem] font-medium text-white`}>{frame.title}</span>
          </>
        )}
      </Photo>

      {earlier && (
        <input
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(event) => setSplit(Number(event.target.value))}
          aria-label="הזזת קו ההשוואה"
          className="mt-3 w-full accent-[var(--p-accent)]"
        />
      )}

      <div className="mt-4 flex items-end gap-3">
        {candidates.length > 0 && (
          <div className="min-w-0 flex-1">
            <label htmlFor="against" className="block text-[0.875rem] text-p-muted">
              השוואה ליום אחר
            </label>
            <select
              id="against"
              value={againstKey}
              onChange={(event) => setAgainstKey(event.target.value)}
              className="mt-1.5 block h-11 w-full rounded-p border border-p-line bg-p-surface px-3 text-[1rem] text-p-ink"
            >
              <option value="">בלי השוואה</option>
              {candidates.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={download}
          disabled={saving}
          className="p-btn flex h-11 shrink-0 items-center gap-2 px-4 text-[0.9375rem] font-medium disabled:opacity-60"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" />
          </svg>
          {saving ? "מכין…" : "הורדה"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[0.875rem] text-[#9b1c27]">
          {error}
        </p>
      )}
    </div>
  );
}
