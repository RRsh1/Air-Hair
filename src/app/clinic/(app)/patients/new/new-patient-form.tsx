"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SelectField, TextField } from "@/components/clinic/fields";
import type { ProcedureOption } from "@/components/clinic/procedure-options";
import type { Branch } from "@/lib/branches/branches";
import { createPatientAction, type FormState } from "../actions";

export function NewPatientForm({ branches, procedures }: { branches: Branch[]; procedures: ProcedureOption[] }) {
  const [state, submit, pending] = useActionState<FormState, FormData>(createPatientAction, { status: "idle" });
  const v = state.values ?? {};
  const error = (field: string) => (state.status === "error" && state.field === field ? state.message : undefined);

  return (
    // Keyed by the last values, so the selects come back with what was chosen after an error.
    <form key={JSON.stringify(v)} action={submit} className="mt-8 space-y-8" noValidate>
      {state.status === "duplicate" && (
        <div role="alert" className="rounded-lg border border-petrol/30 bg-petrol/5 px-5 py-4">
          <p className="text-[1.0625rem] font-semibold text-petrol-strong">כבר יש כרטיס עם תעודת הזהות הזו</p>
          <p className="mt-1 text-[0.9375rem] text-ink">
            מטופל שחוזר לטיפול נוסף ממשיך באותו כרטיס. פותחים את הכרטיס ומוסיפים בו טיפול חדש.
          </p>
          {state.patientId && (
            <Link href={`/clinic/patients/${state.patientId}`} className="mt-3 inline-flex h-10 items-center rounded-md bg-petrol px-4 font-semibold text-white">
              פתיחת הכרטיס
            </Link>
          )}
        </div>
      )}
      {state.status === "error" && !state.field && (
        <p role="alert" className="rounded-md border border-signal/25 bg-signal/5 px-4 py-3 text-[0.9375rem] text-signal">
          {state.message}
        </p>
      )}

      <fieldset className="rounded-lg border border-line bg-surface px-5 pb-6 pt-4 md:px-7">
        <legend className="px-1 text-[1.0625rem] font-semibold">פרטי המטופל</legend>
        <div className="mt-2 grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <TextField label="שם מלא" id="fullName" name="fullName" autoComplete="off" defaultValue={v.fullName} error={error("fullName")} required />
          </div>
          <TextField
            label="תעודת זהות"
            id="nationalId"
            name="nationalId"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={v.nationalId}
            error={error("nationalId")}
            hint="תשע ספרות, כולל ספרת ביקורת"
            required
          />
          <TextField label="נייד" id="phone" name="phone" type="tel" inputMode="tel" autoComplete="off" defaultValue={v.phone} error={error("phone")} hint="לכאן יישלח קוד הכניסה" required />
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-line bg-surface px-5 pb-6 pt-4 md:px-7">
        <legend className="px-1 text-[1.0625rem] font-semibold">הטיפול</legend>
        <div className="mt-2 grid gap-5 md:grid-cols-2">
          <SelectField label="סוג הטיפול" id="procedure" name="procedure" defaultValue={v.procedure ?? procedures[0]?.value} error={error("procedure")}>
            {procedures.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </SelectField>
          {branches.length > 1 ? (
            <SelectField label="סניף" id="branchId" name="branchId" defaultValue={v.branchId ?? branches[0].id} error={error("branch")}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectField>
          ) : (
            <input type="hidden" name="branchId" value={branches[0]?.id ?? ""} />
          )}
          <TextField
            label="תאריך ניתוח מתוכנן"
            id="plannedSurgeryDate"
            name="plannedSurgeryDate"
            type="date"
            defaultValue={v.plannedSurgeryDate}
            error={error("plannedSurgeryDate")}
            hint="אפשר לשנות אחר כך, עד שמסמנים שהניתוח בוצע"
            required
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="flex h-11 items-center rounded-md bg-petrol px-6 text-[1rem] font-semibold text-white hover:bg-petrol-strong disabled:opacity-60">
          {pending ? "יוצר כרטיס…" : "יצירת כרטיס"}
        </button>
        <Link href="/clinic/patients" className="text-[1rem] text-slate hover:text-ink">
          ביטול
        </Link>
      </div>
    </form>
  );
}
