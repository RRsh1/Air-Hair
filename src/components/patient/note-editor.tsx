"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveNoteAction, type NoteState } from "@/app/c/[slug]/notes/actions";
import { CheckIcon, NoteIcon } from "./icons";

const MAX = 2000;

/**
 * The patient's note for one day. Reads as plain text until tapped; edits in place, saves to the
 * server, and says so. An empty note is removed.
 */
export function NoteEditor({ slug, date, initial }: { slug: string; date: string; initial: string }) {
  const [state, submit, pending] = useActionState<NoteState, FormData>(saveNoteAction.bind(null, slug, date), {
    status: "idle",
    text: initial,
  });
  const saved = state.status === "saved" ? state.text : state.status === "idle" ? initial : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);

  // A save finished: leave edit mode (adjusting state during render, not in an effect).
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.status === "saved") setEditing(false);
  }

  useEffect(() => {
    if (!editing || !area.current) return;
    area.current.focus();
    area.current.setSelectionRange(area.current.value.length, area.current.value.length);
  }, [editing]);

  const autosize = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(autosize, [editing, draft]);

  const current = saved ?? draft;

  if (!editing) {
    return current ? (
      <button
        type="button"
        onClick={() => {
          setDraft(current);
          setEditing(true);
        }}
        className="group block w-full rounded-p border border-tl-line bg-p-surface px-4 py-3.5 text-start"
      >
        <span className="flex items-center justify-between text-[0.8125rem] text-tl-muted">
          <span className="flex items-center gap-1.5">
            <NoteIcon className="h-4 w-4" />
            ההערה שלי
          </span>
          <span className="text-tl-accent group-hover:underline">עריכה</span>
        </span>
        <span className="mt-1.5 block whitespace-pre-line text-[1rem] leading-relaxed text-tl-ink">{current}</span>
        {state.status === "saved" && (
          <span role="status" className="mt-2 flex items-center gap-1 text-[0.8125rem] text-tl-muted">
            <CheckIcon className="h-4 w-4 text-tl-accent" />
            נשמר
          </span>
        )}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-h-12 w-full items-center gap-2.5 rounded-p border border-dashed border-tl-line px-4 text-[0.9375rem] text-tl-muted hover:border-tl-accent hover:text-tl-accent"
      >
        <NoteIcon className="h-[18px] w-[18px]" />
        הוספת הערה ליום הזה
      </button>
    );
  }

  const dirty = draft.trim() !== (current ?? "").trim() || state.status === "error";
  return (
    <form action={submit} className="rounded-p border border-tl-accent bg-p-surface px-4 pb-3 pt-3.5 shadow-[0_0_0_3px_color-mix(in_srgb,var(--tl-accent)_14%,transparent)]">
      <label htmlFor={`note-${date}`} className="flex items-center gap-1.5 text-[0.8125rem] text-tl-muted">
        <NoteIcon className="h-4 w-4" />
        ההערה שלי
      </label>
      <textarea
        ref={area}
        id={`note-${date}`}
        name="note"
        rows={3}
        maxLength={MAX}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="איך הרגשת היום? נפיחות, כאב, שאלות לרופא…"
        className="mt-1.5 block w-full resize-none bg-transparent text-[1rem] leading-relaxed text-tl-ink placeholder:text-tl-muted/70 focus:outline-none"
      />
      {state.status === "error" && (
        <p role="alert" className="mt-1 text-[0.875rem] text-[#9b1c27]">
          {state.message}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="p-numeral text-[0.75rem] text-tl-muted">{draft.length > MAX * 0.8 ? `${draft.length}/${MAX}` : ""}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setDraft(current ?? "");
              setEditing(false);
            }}
            className="h-9 rounded-full px-3.5 text-[0.9375rem] text-tl-muted hover:text-tl-ink"
          >
            ביטול
          </button>
          <button type="submit" disabled={pending || !dirty} className="p-btn h-9 px-4 text-[0.9375rem] font-medium disabled:opacity-45">
            {pending ? "שומר…" : "שמירה"}
          </button>
        </div>
      </div>
    </form>
  );
}
