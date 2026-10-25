"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Field, FormError, FormNote, PrimaryButton } from "@/components/clinic/form";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/error-messages";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const { error } = await authClient.requestPasswordReset({
      email: String(new FormData(event.currentTarget).get("email")),
      redirectTo: `${window.location.origin}/clinic/reset-password`,
    });
    setPending(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <FormNote>אם הכתובת רשומה במערכת, נשלח אליה קישור לבחירת סיסמה. הקישור בתוקף לשעה.</FormNote>
        <Link href="/clinic/login" className="block text-center text-[0.9375rem] text-petrol underline-offset-4 hover:underline">
          חזרה לכניסה
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError>{error}</FormError>
      <Field id="email" name="email" type="email" label="אימייל" autoComplete="email" dir="ltr" required />
      <PrimaryButton type="submit" pending={pending}>
        שליחת קישור
      </PrimaryButton>
      <Link href="/clinic/login" className="block text-center text-[0.9375rem] text-slate underline-offset-4 hover:underline">
        חזרה לכניסה
      </Link>
    </form>
  );
}
