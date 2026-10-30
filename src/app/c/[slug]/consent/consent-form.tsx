"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { signConsentAction, type ConsentFormState } from "./actions";

/** Ink needed before the signature counts (CSS pixels of stroke), so a tap isn't a signature. */
const MIN_INK = 120;
const MAX_BACKING_WIDTH = 1600;

export function ConsentForm({ slug, documentId }: { slug: string; documentId: string }) {
  const [state, submit, pending] = useActionState<ConsentFormState, FormData>(
    signConsentAction.bind(null, slug, documentId),
    {},
  );
  const [agreed, setAgreed] = useState(false);
  const { canvasRef, hasInk, hasSignature, clear, toBlob, onPointerDown, onPointerMove, onPointerUp } = useSignaturePad();
  const [localError, setLocalError] = useState<string | null>(null);

  const ready = agreed && hasSignature && !pending;
  const error = localError ?? state.error;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    const form = new FormData(event.currentTarget);
    toBlob().then((blob) => {
      if (!blob) {
        setLocalError("החתימה לא נקלטה. חתמו שוב בתוך המסגרת.");
        return;
      }
      setLocalError(null);
      form.set("signature", blob, "signature.png");
      startTransition(() => submit(form));
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <label className="flex cursor-pointer items-start gap-3 text-[1.0625rem] leading-relaxed">
        <input
          type="checkbox"
          name="agree"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-p-accent)]"
        />
        <span>קראתי את המסמך, הבנתי אותו ואני מסכים/ה לאמור בו.</span>
      </label>

      <div>
        <div className="flex items-baseline justify-between">
          <p id="signature-label" className="text-[0.9375rem] font-medium">
            חתימה
          </p>
          <button
            type="button"
            onClick={clear}
            disabled={!hasInk}
            className="text-[0.9375rem] text-p-accent underline-offset-4 hover:underline disabled:text-p-muted disabled:no-underline"
          >
            ניקוי
          </button>
        </div>
        <div className="relative mt-2 overflow-hidden rounded-p border border-p-line bg-p-surface">
          <canvas
            ref={canvasRef}
            role="img"
            aria-labelledby="signature-label"
            aria-describedby="signature-hint"
            className="block h-44 w-full touch-none text-p-ink"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {!hasInk && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[1rem] text-p-muted">
              חתמו כאן באצבע
            </span>
          )}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-p-line" />
        </div>
        <p id="signature-hint" className="mt-2 text-[0.875rem] text-p-muted">
          החתימה נשמרת יחד עם מועד החתימה ונוסח המסמך שהוצג לכם.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-p border border-[#b4232f]/25 bg-[#b4232f]/5 px-4 py-3 text-[0.9375rem] text-[#9b1c27]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready}
        className="flex h-13 w-full items-center justify-center p-btn text-[1.0625rem] font-semibold transition-opacity disabled:opacity-50"
      >
        {pending ? "שומר…" : "חתימה והמשך"}
      </button>
    </form>
  );
}

/** A finger/mouse signature canvas sized to its box and the screen's pixel density. */
function useSignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const ink = useRef(0);
  const [hasInk, setHasInk] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, MAX_BACKING_WIDTH / rect.width);
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const context = canvas.getContext("2d")!;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.6;
    context.strokeStyle = getComputedStyle(canvas).color;
    ink.current = 0;
    setHasInk(false);
    setHasSignature(false);
  }, []);

  useEffect(() => {
    setup();
    // Resizing a canvas wipes it, so a new size (rotation) starts the signature over.
    let width = canvasRef.current?.getBoundingClientRect().width ?? 0;
    const observer = new ResizeObserver(([entry]) => {
      if (Math.abs(entry.contentRect.width - width) < 1) return;
      width = entry.contentRect.width;
      setup();
    });
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [setup]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    last.current = p;
    const context = event.currentTarget.getContext("2d")!;
    context.beginPath();
    context.arc(p.x, p.y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fillStyle = context.strokeStyle;
    context.fill();
    setHasInk(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const p = point(event);
    const context = event.currentTarget.getContext("2d")!;
    context.beginPath();
    context.moveTo(last.current.x, last.current.y);
    context.lineTo(p.x, p.y);
    context.stroke();
    ink.current += Math.hypot(p.x - last.current.x, p.y - last.current.y);
    last.current = p;
    if (ink.current >= MIN_INK) setHasSignature(true);
  };

  const onPointerUp = () => {
    last.current = null;
  };

  const toBlob = () =>
    new Promise<Blob | null>((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      canvas.toBlob(resolve, "image/png");
    });

  return { canvasRef, hasInk, hasSignature, clear: setup, toBlob, onPointerDown, onPointerMove, onPointerUp };
}
