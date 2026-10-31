"use client";

import { useActionState } from "react";
import { SelectField, TextField } from "@/components/clinic/fields";
import { saveSettingsAction, type SettingsState } from "./actions";

const months = [3, 6, 9, 12, 18, 24];

export function GeneralForm(props: { name: string; smsSenderName: string; followUpMonths: number; structuralChangesApplyTo: "new_patients" | "all_patients" }) {
  const [state, submit, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, { status: "idle" });
  const error = (field: string) => (state.status === "error" && state.field === field ? state.message : undefined);
  const monthOptions = months.includes(props.followUpMonths) ? months : [...months, props.followUpMonths].sort((a, b) => a - b);

  return (
    <form action={submit} className="mt-4 space-y-6 rounded-lg border border-line bg-surface px-5 py-6 md:px-7" noValidate>
      <div className="grid gap-5 md:grid-cols-2">
        <TextField label="שם המרפאה" id="name" name="name" defaultValue={props.name} error={error("name")} hint="כך המרפאה מופיעה למטופלים" required />
        <TextField
          label="שם השולח בהודעות"
          id="smsSenderName"
          name="smsSenderName"
          dir="ltr"
          defaultValue={props.smsSenderName}
          error={error("smsSenderName")}
          hint="באנגלית, עד 11 תווים. ריק: HairAir"
          maxLength={11}
        />
        <SelectField label="משך המעקב אחרי הניתוח" id="followUpMonths" name="followUpMonths" defaultValue={String(props.followUpMonths)} error={error("followUpMonths")}>
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {m === 12 ? "שנה" : m === 24 ? "שנתיים" : m === 18 ? "שנה וחצי" : `${m} חודשים`}
            </option>
          ))}
        </SelectField>
      </div>

      <fieldset>
        <legend className="text-[0.9375rem] font-medium">שינוי בלוח הצילומים חל על</legend>
        <div className="mt-2 space-y-2">
          {[
            { value: "new_patients", label: "מטופלים חדשים בלבד", hint: "מי שכבר בהחלמה ממשיך לפי הלוח שקיבל" },
            { value: "all_patients", label: "כל המטופלים", hint: "גם מי שכבר בהחלמה עובר ללוח המעודכן" },
          ].map((option) => (
            <label key={option.value} className="flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="structuralChangesApplyTo"
                value={option.value}
                defaultChecked={props.structuralChangesApplyTo === option.value}
                className="mt-1.5 h-4 w-4 accent-[var(--petrol)]"
              />
              <span>
                <span className="block text-[1rem]">{option.label}</span>
                <span className="block text-[0.875rem] text-slate">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="flex h-11 items-center rounded-md bg-petrol px-6 font-semibold text-white hover:bg-petrol-strong disabled:opacity-60">
          {pending ? "שומר…" : "שמירת ההגדרות"}
        </button>
        {state.status === "saved" && (
          <p role="status" className="text-[0.9375rem] text-petrol-strong">
            ההגדרות נשמרו
          </p>
        )}
        {state.status === "error" && !state.field && (
          <p role="alert" className="text-[0.9375rem] text-signal">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
