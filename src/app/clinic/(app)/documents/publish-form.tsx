"use client";

import { useState } from "react";
import type { LegalKind } from "@/lib/legal/documents";

/** New version of a document: pasted text or a PDF, posted to the publish route (works without scripts). */
export function PublishForm({ kind, hasCurrent, error }: { kind: LegalKind; hasCurrent: boolean; error?: string }) {
  const [format, setFormat] = useState<"text" | "file">("text");
  const [sending, setSending] = useState(false);
  return (
    <details className="group" open={Boolean(error) || !hasCurrent}>
      <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-md border border-petrol px-4 text-[0.9375rem] font-semibold text-petrol hover:bg-petrol hover:text-white group-open:hidden">
        {hasCurrent ? "פרסום גרסה חדשה" : "פרסום המסמך"}
      </summary>
      <form
        method="post"
        action="/clinic/documents/publish"
        encType="multipart/form-data"
        onSubmit={() => setSending(true)}
        className="space-y-4"
      >
        <input type="hidden" name="kind" value={kind} />
        <fieldset className="flex gap-1 rounded-md border border-line bg-paper p-1" aria-label="צורת המסמך">
          {(["text", "file"] as const).map((value) => (
            <label key={value} className={`flex h-9 flex-1 cursor-pointer items-center justify-center rounded-[5px] text-[0.9375rem] ${format === value ? "bg-surface font-semibold shadow-[0_1px_2px_rgb(23_38_43/0.12)]" : "text-slate"}`}>
              <input type="radio" name="format" value={value} checked={format === value} onChange={() => setFormat(value)} className="sr-only" />
              {value === "text" ? "הדבקת טקסט" : "העלאת PDF"}
            </label>
          ))}
        </fieldset>
        {format === "text" ? (
          <div>
            <label htmlFor={`${kind}-text`} className="block text-[0.9375rem] font-medium">
              נוסח המסמך
            </label>
            <textarea
              id={`${kind}-text`}
              name="text"
              rows={10}
              className="mt-1.5 block w-full rounded-md border border-line bg-surface px-3.5 py-3 text-[1rem] leading-relaxed focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
            />
            <p className="mt-1.5 text-[0.875rem] text-slate">שורה ריקה יוצרת פסקה חדשה. כך המטופל יראה את המסמך באפליקציה.</p>
          </div>
        ) : (
          <div>
            <label htmlFor={`${kind}-pdf`} className="block text-[0.9375rem] font-medium">
              קובץ PDF
            </label>
            <input id={`${kind}-pdf`} name="pdf" type="file" accept="application/pdf" className="mt-1.5 block w-full text-[0.9375rem] file:me-3 file:h-10 file:rounded-md file:border file:border-line file:bg-surface file:px-4 file:font-medium" />
            <p className="mt-1.5 text-[0.875rem] text-slate">עד 10MB.</p>
          </div>
        )}
        {kind === "consent" && hasCurrent && (
          <p className="rounded-md border border-signal/20 bg-signal/5 px-4 py-3 text-[0.9375rem] text-ink">
            אחרי הפרסום, כל מטופל יתבקש לחתום על הגרסה החדשה בכניסה הבאה שלו לאפליקציה.
          </p>
        )}
        {error && (
          <p role="alert" className="text-[0.9375rem] text-signal">
            {error}
          </p>
        )}
        <button type="submit" disabled={sending} className="flex h-11 items-center rounded-md bg-petrol px-6 font-semibold text-white hover:bg-petrol-strong disabled:opacity-60">
          {sending ? "מפרסם…" : "פרסום"}
        </button>
      </form>
    </details>
  );
}
