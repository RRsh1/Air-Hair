"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormError, PrimaryButton } from "@/components/clinic/form";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/error-messages";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword.length < 12) return setError("הסיסמה צריכה להכיל לפחות 12 תווים.");
    if (newPassword !== String(form.get("confirm"))) return setError("שתי הסיסמאות לא זהות.");

    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    if (error) {
      setError(authErrorMessage(error));
      setPending(false);
      return;
    }
    router.replace("/clinic/login?note=reset");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError>{error}</FormError>
      <Field id="password" name="password" type="password" label="סיסמה חדשה" autoComplete="new-password" minLength={12} dir="ltr" required />
      <Field id="confirm" name="confirm" type="password" label="אותה סיסמה שוב" autoComplete="new-password" dir="ltr" required />
      <PrimaryButton type="submit" pending={pending}>
        שמירת הסיסמה
      </PrimaryButton>
    </form>
  );
}
