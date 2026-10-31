import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const control =
  "block h-11 w-full rounded-md border bg-surface px-3.5 text-[1rem] text-ink placeholder:text-slate/60 focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20";

/** A labelled input; `error` marks it invalid and shows the message under it. */
export function TextField({ label, id, error, hint, ...input }: { label: string; id: string; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-[0.9375rem] font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${control} mt-1.5 ${error ? "border-signal" : "border-line"}`}
        {...input}
      />
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({
  label,
  id,
  error,
  children,
  ...select
}: { label: string; id: string; error?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-[0.9375rem] font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${control} mt-1.5 ${error ? "border-signal" : "border-line"}`}
        {...select}
      >
        {children}
      </select>
      <FieldMessage id={id} error={error} />
    </div>
  );
}

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error)
    return (
      <p id={`${id}-error`} className="mt-1.5 text-[0.875rem] text-signal">
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={`${id}-hint`} className="mt-1.5 text-[0.875rem] text-slate">
        {hint}
      </p>
    );
  return null;
}
