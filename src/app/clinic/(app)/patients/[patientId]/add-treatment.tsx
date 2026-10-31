"use client";

import { useActionState, useRef } from "react";
import { SelectField, TextField } from "@/components/clinic/fields";
import type { ProcedureOption } from "@/components/clinic/procedure-options";
import type { Branch } from "@/lib/branches/branches";
import { addTreatmentAction, type FormState } from "../actions";

/** Opens another treatment on this card: a returning patient, or a second procedure. */
export function AddTreatment({ patientId, branches, procedures }: { patientId: string; branches: Branch[]; procedures: ProcedureOption[] }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [state, submit, pending] = useActionState<FormState, FormData>(async (prev, form) => {
    const next = await addTreatmentAction(patientId, prev, form);
    if (next.status === "done" && details.current) details.current.open = false;
    return next;
  }, { status: "idle" });
  const v = state.values ?? {};
  const error = (field: string) => (state.status === "error" && state.field === field ? state.message : undefined);

  return (
    <details ref={details} className="group rounded-lg border border-dashed border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
        <span>
          <span className="block text-[1.0625rem] font-semibold">טיפול חדש למטופל</span>
          <span className="block text-[0.875rem] text-slate">באותו כרטיס, בלי לגעת בטיפולים הקודמים</span>
        </span>
        <span className="text-[0.9375rem] font-medium text-petrol group-open:hidden">פתיחה</span>
      </summary>
      {/* Keyed by the last values, so the selects come back with what was chosen after an error. */}
      <form key={JSON.stringify(v)} action={submit} className="grid gap-5 border-t border-line px-5 pb-5 pt-4 md:grid-cols-3" noValidate>
        <SelectField label="סוג הטיפול" id="add-procedure" name="procedure" defaultValue={v.procedure ?? procedures[0]?.value} error={error("procedure")}>
          {procedures.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </SelectField>
        {branches.length > 1 ? (
          <SelectField label="סניף" id="add-branch" name="branchId" defaultValue={v.branchId ?? branches[0].id} error={error("branch")}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="branchId" value={branches[0]?.id ?? ""} />
        )}
        <TextField label="תאריך ניתוח מתוכנן" id="add-date" name="plannedSurgeryDate" type="date" defaultValue={v.plannedSurgeryDate} error={error("plannedSurgeryDate")} required />
        {state.status === "error" && !state.field && (
          <p role="alert" className="text-[0.9375rem] text-signal md:col-span-3">
            {state.message}
          </p>
        )}
        <div className="md:col-span-3">
          <button type="submit" disabled={pending} className="flex h-11 items-center rounded-md bg-petrol px-5 font-semibold text-white hover:bg-petrol-strong disabled:opacity-60">
            {pending ? "פותח…" : "פתיחת הטיפול"}
          </button>
        </div>
      </form>
    </details>
  );
}
