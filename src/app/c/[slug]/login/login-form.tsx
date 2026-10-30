"use client";

import { useActionState, type InputHTMLAttributes } from "react";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = { step: "identify" };

export function PatientLoginForm({ slug }: { slug: string }) {
  const [state, submit, pending] = useActionState(loginAction.bind(null, slug), initial);

  if (state.step === "code") {
    return (
      <form action={submit} className="space-y-5" noValidate>
        <p className="text-[1.0625rem] leading-relaxed">
          שלחנו קוד בן 6 ספרות לנייד שמסתיים ב-<span dir="ltr" className="font-semibold tabular-nums">{state.phoneEnding}</span>.
        </p>
        <ErrorMessage>{state.error}</ErrorMessage>
        <PatientField
          id="code"
          name="code"
          label="קוד מההודעה"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]*"
          autoFocus
          dir="ltr"
          className="text-center text-2xl tracking-[0.4em] tabular-nums"
          required
        />
        <SubmitButton pending={pending}>כניסה</SubmitButton>
        <button
          type="submit"
          name="intent"
          value="restart"
          formNoValidate
          className="block w-full text-center text-[0.9375rem] text-p-accent underline-offset-4 hover:underline"
        >
          לא קיבלתי קוד, לשלוח שוב
        </button>
      </form>
    );
  }

  return (
    <form action={submit} className="space-y-5" noValidate>
      <ErrorMessage>{state.error}</ErrorMessage>
      <PatientField
        id="nationalId"
        name="nationalId"
        label="תעודת זהות"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        defaultValue={state.nationalId}
        dir="ltr"
        required
      />
      <PatientField
        id="phone"
        name="phone"
        label="מספר נייד"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={state.phone}
        dir="ltr"
        required
      />
      <SubmitButton pending={pending}>שליחת קוד</SubmitButton>
    </form>
  );
}

function PatientField({ label, id, className = "", ...input }: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[0.9375rem] font-medium">
        {label}
      </label>
      <input
        id={id}
        className={`block h-13 w-full rounded-p border border-p-line bg-p-surface px-4 text-[1.125rem] text-p-ink focus:border-p-accent focus:outline-none focus:ring-2 focus:ring-p-accent/20 ${className}`}
        {...input}
      />
    </div>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-13 w-full items-center justify-center p-btn text-[1.0625rem] font-semibold transition-opacity disabled:opacity-60"
    >
      {pending ? "רגע…" : children}
    </button>
  );
}

function ErrorMessage({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-p border border-[#b4232f]/25 bg-[#b4232f]/5 px-4 py-3 text-[0.9375rem] text-[#9b1c27]">
      {children}
    </p>
  );
}
