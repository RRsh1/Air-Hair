"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotoAngle } from "@/lib/timeline/capture-schedule";

/**
 * In-browser camera with an alignment "ghost": the previous photo of the same angle, semi-transparent
 * over the live preview, so every day is shot from the same distance and angle.
 * Photos are cropped to 3:4, resized to at most 1600px and re-encoded as JPEG in the browser, which
 * also strips EXIF metadata such as location. If the camera can't be opened (no permission, or an
 * insecure context), the patient can pick a photo from the gallery instead.
 */

const MAX_EDGE = 1600;
const ASPECT = 3 / 4; // width / height

type Phase =
  | { name: "starting" }
  | { name: "live" }
  | { name: "unavailable" }
  | { name: "review"; blob: Blob; url: string }
  | { name: "uploading"; blob: Blob; url: string };

const uploadErrors: Record<string, string> = {
  not_allowed: "אי אפשר לצלם את הזווית הזו היום.",
  format: "הקובץ לא נקרא כתמונה. נסו לצלם שוב.",
  size: "התמונה גדולה מדי. נסו לצלם שוב.",
  dimensions: "התמונה גדולה מדי. נסו לצלם שוב.",
  unauthorized: "פג הזמן של הכניסה. התחברו שוב.",
};

export function Camera({ slug, angle, label, hint, ghostUrl }: { slug: string; angle: PhotoAngle; label: string; hint: string; ghostUrl: string | null }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "starting" });
  const [facing, setFacing] = useState<"environment" | "user">(angle === "front" ? "user" : "environment");
  const [ghostOpacity, setGhostOpacity] = useState(0.35);
  const [streamKey, setStreamKey] = useState(0); // bump to reopen the camera after a review
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      stop();
      if (!navigator.mediaDevices?.getUserMedia) return setPhase({ name: "unavailable" });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase({ name: "live" });
      } catch {
        if (!cancelled) setPhase({ name: "unavailable" });
      }
    }
    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, streamKey, stop]);

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const blob = await cropToJpeg(video, video.videoWidth, video.videoHeight);
    stop();
    setPhase({ name: "review", blob, url: URL.createObjectURL(blob) });
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const blob = await cropToJpeg(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      stop();
      setPhase({ name: "review", blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("הקובץ לא נקרא כתמונה. בחרו תמונה אחרת.");
    }
  }

  async function save() {
    if (phase.name !== "review") return;
    setPhase({ ...phase, name: "uploading" });
    setError("");
    const form = new FormData();
    form.set("angle", angle);
    form.set("photo", phase.blob, `${angle}.jpg`);
    const response = await fetch(`/c/${slug}/photos`, { method: "POST", body: form }).catch(() => null);
    if (response?.ok) {
      router.replace(`/c/${slug}`);
      router.refresh();
      return;
    }
    const code = response ? ((await response.json().catch(() => ({}))) as { error?: string }).error : undefined;
    setError(uploadErrors[code ?? ""] ?? "השמירה נכשלה. בדקו את החיבור ונסו שוב.");
    setPhase({ ...phase, name: "review" });
  }

  function retake() {
    if (phase.name === "review") URL.revokeObjectURL(phase.url);
    setError("");
    setPhase({ name: "starting" });
    setStreamKey((key) => key + 1);
  }

  const mirrored = facing === "user";
  const reviewing = phase.name === "review" || phase.name === "uploading";

  return (
    <div className="flex min-h-dvh flex-col bg-[#0d1416] text-white">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-4">
        <Link href={`/c/${slug}`} className="text-[0.9375rem] font-medium text-white/80">
          ביטול
        </Link>
        <p className="text-[1.0625rem] font-semibold">צילום {label}</p>
        <span className="w-10" aria-hidden="true" />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8">
        <p className="text-center text-[0.9375rem] text-white/70">{hint}</p>

        <div className="relative mt-4 aspect-[3/4] w-full overflow-hidden rounded-[10px] bg-black">
          {reviewing ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the photo just taken
            <img src={phase.url} alt="התמונה שצולמה" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
              />
              {phase.name === "live" &&
                (ghostUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private photo served by an authenticated route
                  <img
                    src={ghostUrl}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                    style={{ opacity: ghostOpacity, transform: mirrored ? "scaleX(-1)" : undefined }}
                  />
                ) : (
                  <svg viewBox="0 0 300 400" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
                    <ellipse cx="150" cy="185" rx="92" ry="120" fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="6 6" />
                  </svg>
                ))}
              {phase.name === "starting" && (
                <p className="absolute inset-0 flex items-center justify-center text-[0.9375rem] text-white/70">פותחים את המצלמה…</p>
              )}
              {phase.name === "unavailable" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
                  <p className="text-[1rem] leading-relaxed text-white/85">
                    אין גישה למצלמה. אפשר לאשר גישה בהגדרות הדפדפן, או לבחור תמונה מהגלריה.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-[8px] bg-[#b4232f]/25 px-4 py-3 text-center text-[0.9375rem]">
            {error}
          </p>
        )}

        {reviewing ? (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={retake}
              disabled={phase.name === "uploading"}
              className="h-13 rounded-[10px] border border-white/30 text-[1.0625rem] font-semibold disabled:opacity-50"
            >
              צילום חוזר
            </button>
            <button
              type="button"
              onClick={save}
              disabled={phase.name === "uploading"}
              className="h-13 rounded-[10px] bg-white text-[1.0625rem] font-semibold text-[#0d1416] disabled:opacity-60"
            >
              {phase.name === "uploading" ? "שומרים…" : "שמירה"}
            </button>
          </div>
        ) : (
          <>
            {phase.name === "live" && ghostUrl && (
              <label className="mt-5 flex items-center gap-3 text-[0.875rem] text-white/75">
                <span className="shrink-0">שקיפות הצילום הקודם</span>
                <input
                  type="range"
                  min={0}
                  max={0.8}
                  step={0.05}
                  value={ghostOpacity}
                  onChange={(event) => setGhostOpacity(Number(event.target.value))}
                  className="w-full accent-white"
                />
              </label>
            )}
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-24 text-start text-[0.9375rem] font-medium text-white/85"
              >
                מהגלריה
              </button>
              <button
                type="button"
                onClick={capture}
                disabled={phase.name !== "live"}
                aria-label="צילום"
                className="h-18 w-18 rounded-full border-4 border-white/90 bg-white/15 transition-transform active:scale-95 disabled:opacity-30"
              />
              <button
                type="button"
                onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
                disabled={phase.name === "unavailable"}
                className="w-24 text-end text-[0.9375rem] font-medium text-white/85 disabled:opacity-30"
              >
                החלפת מצלמה
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => pickFile(event.target.files?.[0])} />
          </>
        )}
      </main>
    </div>
  );
}

/** Center-crops to 3:4, scales to MAX_EDGE and encodes as JPEG (drops all metadata). */
async function cropToJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  let cropW = width;
  let cropH = Math.round(width / ASPECT);
  if (cropH > height) {
    cropH = height;
    cropW = Math.round(height * ASPECT);
  }
  const sx = Math.round((width - cropW) / 2);
  const sy = Math.round((height - cropH) / 2);
  const scale = Math.min(1, MAX_EDGE / cropH);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropW * scale);
  canvas.height = Math.round(cropH * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(source, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))), "image/jpeg", 0.85),
  );
}
