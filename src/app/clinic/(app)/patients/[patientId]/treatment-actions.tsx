"use client";

import { useActionState, type ReactNode } from "react";
import type { TreatmentStatus } from "@/lib/treatments/lifecycle";
import { treatmentStepAction, type FormState, type TreatmentStep } from "../actions";

/** The lifecycle steps that fit the treatment's status, each behind its own small disclosure. */
export function TreatmentActions({
  treatmentId,
  status,
  today,
  plannedDate,
  actualDate,
  canEdit,
  canMark,
}: {
  treatmentId: string;
  status: TreatmentStatus;
  today: string;
  plannedDate: string;
  actualDate: string | null;
  canEdit: boolean;
  canMark: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === "scheduled" && canMark && (
        <Step treatmentId={treatmentId} step="perform" label="סימון שהניתוח בוצע" submit="הניתוח בוצע" primary>
          <DateInput name="date" label="תאריך הניתוח" defaultValue={today} />
          <Explain>מהתאריך הזה נספרים ימי ההחלמה, והמטופל עובר לצילומי המעקב.</Explain>
        </Step>
      )}
      {status === "scheduled" && canEdit && (
        <Step treatmentId={treatmentId} step="reschedule" label="שינוי תאריך" submit="שמירת התאריך">
          <DateInput name="date" label="תאריך מתוכנן חדש" defaultValue={plannedDate} />
        </Step>
      )}
      {status === "performed" && canMark && (
        <Step treatmentId={treatmentId} step="complete" label="סיום המעקב" submit="סיום המעקב" primary>
          <Explain>הטיפול יעבור לארכיון. התמונות וההערות נשמרות, והמטופל לא יוכל להוסיף חדשות לטיפול הזה.</Explain>
        </Step>
      )}
      {status === "performed" && canMark && (
        <Step treatmentId={treatmentId} step="perform" label="תיקון תאריך הניתוח" submit="שמירת התאריך">
          <DateInput name="date" label="תאריך הניתוח" defaultValue={actualDate ?? today} />
          <Explain>ימי ההחלמה של כל התמונות יחושבו מחדש לפי התאריך המתוקן.</Explain>
        </Step>
      )}
      {(status === "scheduled" || status === "performed") && canMark && (
        <Step treatmentId={treatmentId} step="cancel" label="ביטול הטיפול" submit="ביטול הטיפול" danger>
          <Explain>הטיפול יעבור לארכיון כמבוטל. מה שכבר תועד נשמר.</Explain>
        </Step>
      )}
    </div>
  );
}

function Step({
  treatmentId,
  step,
  label,
  submit,
  primary,
  danger,
  children,
}: {
  treatmentId: string;
  step: TreatmentStep;
  label: string;
  submit: string;
  primary?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(treatmentStepAction.bind(null, treatmentId, step), { status: "idle" });
  return (
    <details className="group relative">
      <summary
        className={`flex h-10 cursor-pointer list-none items-center rounded-md border px-4 text-[0.9375rem] font-medium ${
          primary ? "border-petrol bg-petrol text-white hover:bg-petrol-strong" : danger ? "border-line text-signal hover:border-signal" : "border-line hover:border-petrol hover:text-petrol"
        } group-open:ring-2 group-open:ring-petrol/20`}
      >
        {label}
      </summary>
      <form action={action} className="absolute start-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-3rem))] space-y-3 rounded-lg border border-line bg-surface p-4 shadow-[0_8px_24px_-12px_rgb(23_38_43/0.25)]">
        {children}
        {state.status === "error" && (
          <p role="alert" className="text-[0.875rem] text-signal">
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className={`flex h-10 items-center rounded-md px-4 text-[0.9375rem] font-semibold text-white disabled:opacity-60 ${danger ? "bg-signal" : "bg-petrol hover:bg-petrol-strong"}`}
        >
          {pending ? "שומר…" : submit}
        </button>
      </form>
    </details>
  );
}

function DateInput({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  const id = `${name}-${label}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[0.875rem] font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="date"
        defaultValue={defaultValue}
        required
        className="mt-1 block h-10 w-full rounded-md border border-line bg-surface px-3 text-[1rem] focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
      />
    </div>
  );
}

function Explain({ children }: { children: ReactNode }) {
  return <p className="text-[0.875rem] leading-relaxed text-slate">{children}</p>;
}
