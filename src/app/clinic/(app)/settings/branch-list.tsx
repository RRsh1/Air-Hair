"use client";

import { useActionState, useRef } from "react";
import type { BranchWithCounts } from "@/lib/branches/branches";
import { addBranchAction, archiveBranchAction, renameBranchAction, type SettingsState } from "./actions";

const idle: SettingsState = { status: "idle" };

export function BranchList({ branches }: { branches: BranchWithCounts[] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
      <ul className="divide-y divide-line">
        {branches.map((branch) => (
          <BranchRow key={branch.id} branch={branch} />
        ))}
      </ul>
      <AddBranch />
    </div>
  );
}

function BranchRow({ branch }: { branch: BranchWithCounts }) {
  const [renameState, rename, renaming] = useActionState<SettingsState, FormData>(renameBranchAction.bind(null, branch.id), idle);
  const [archiveState, archive, archiving] = useActionState<SettingsState>(archiveBranchAction.bind(null, branch.id), idle);
  const message = renameState.status === "error" ? renameState.message : archiveState.status === "error" ? archiveState.message : null;
  return (
    <li className="px-5 py-4 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[1.0625rem] font-semibold">
            {branch.name}
            {branch.isMain && <span className="ms-2 rounded-full bg-petrol/10 px-2 py-0.5 text-[0.8125rem] font-medium text-petrol-strong">ראשי</span>}
          </p>
          <p className="text-[0.875rem] text-slate">
            {branch.activeTreatments === 0 ? "אין טיפולים פעילים" : branch.activeTreatments === 1 ? "טיפול פעיל אחד" : `${branch.activeTreatments} טיפולים פעילים`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <details className="group relative">
            <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-line px-3 text-[0.9375rem] hover:border-petrol hover:text-petrol">שינוי שם</summary>
            <form action={rename} className="absolute end-0 top-full z-20 mt-2 flex w-72 gap-2 rounded-lg border border-line bg-surface p-3 shadow-[0_8px_24px_-12px_rgb(23_38_43/0.25)]">
              <label htmlFor={`rename-${branch.id}`} className="sr-only">
                שם חדש לסניף
              </label>
              <input
                id={`rename-${branch.id}`}
                name="name"
                defaultValue={branch.name}
                className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
              />
              <button type="submit" disabled={renaming} className="h-10 rounded-md bg-petrol px-3 font-semibold text-white disabled:opacity-60">
                שמירה
              </button>
            </form>
          </details>
          {!branch.isMain && (
            <form action={archive}>
              <button type="submit" disabled={archiving} className="h-9 rounded-md px-3 text-[0.9375rem] text-slate hover:text-signal disabled:opacity-60">
                העברה לארכיון
              </button>
            </form>
          )}
        </div>
      </div>
      {message && (
        <p role="alert" className="mt-2 text-[0.875rem] text-signal">
          {message}
        </p>
      )}
    </li>
  );
}

function AddBranch() {
  const form = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState<SettingsState, FormData>(async (prev, data) => {
    const next = await addBranchAction(prev, data);
    if (next.status === "saved") form.current?.reset();
    return next;
  }, idle);
  return (
    <form ref={form} action={submit} className="flex flex-wrap items-start gap-3 border-t border-line bg-paper/60 px-5 py-4 md:px-6">
      <div className="min-w-0 flex-1">
        <label htmlFor="new-branch" className="sr-only">
          שם הסניף החדש
        </label>
        <input
          id="new-branch"
          name="name"
          placeholder="שם הסניף החדש, למשל סניף חיפה"
          className="block h-11 w-full rounded-md border border-line bg-surface px-3.5 focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
        />
        {state.status === "error" && (
          <p role="alert" className="mt-1.5 text-[0.875rem] text-signal">
            {state.message}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className="h-11 rounded-md border border-petrol px-5 font-semibold text-petrol hover:bg-petrol hover:text-white disabled:opacity-60">
        הוספת סניף
      </button>
    </form>
  );
}
