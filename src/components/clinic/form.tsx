"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Field({
  label,
  hint,
  id,
  ...input
}: { label: string; hint?: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[0.9375rem] font-medium">
        {label}
      </label>
      <input
        id={id}
        className="block h-12 w-full rounded-md border border-line bg-surface px-3.5 text-[1.0625rem] text-ink placeholder:text-slate/60 focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
        {...input}
      />
      {hint && <p className="text-[0.875rem] text-slate">{hint}</p>}
    </div>
  );
}

export function PrimaryButton({ children, pending, ...props }: { pending?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={pending || props.disabled}
      className="flex h-12 w-full items-center justify-center rounded-md bg-petrol text-[1.0625rem] font-semibold text-white transition-colors hover:bg-petrol-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "רגע…" : children}
    </button>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md border border-signal/25 bg-signal/5 px-3.5 py-2.5 text-[0.9375rem] text-signal">
      {children}
    </p>
  );
}

export function FormNote({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-md border border-petrol/25 bg-petrol/5 px-3.5 py-2.5 text-[0.9375rem] text-petrol-strong">
      {children}
    </p>
  );
}
