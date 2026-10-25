"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormError, FormNote, PrimaryButton } from "@/components/clinic/form";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/error-messages";

export function LoginForm({ note, initialError }: { note?: string; initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? "");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError(authErrorMessage(error));
      setPending(false);
      return;
    }
    // With 2FA enrolled, no session exists yet: the code screen completes the sign-in.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      router.push("/clinic/login/verify");
      return;
    }
    router.replace("/clinic");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormNote>{note}</FormNote>
      <FormError>{error}</FormError>
      <Field id="email" name="email" type="email" label="אימייל" autoComplete="username" dir="ltr" required />
      <Field id="password" name="password" type="password" label="סיסמה" autoComplete="current-password" dir="ltr" required />
      <PrimaryButton type="submit" pending={pending}>
        כניסה
      </PrimaryButton>
      <p className="text-center text-[0.9375rem]">
        <Link href="/clinic/forgot-password" className="text-petrol underline-offset-4 hover:underline">
          שכחתי סיסמה
        </Link>
      </p>
    </form>
  );
}
