"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormError, PrimaryButton } from "@/components/clinic/form";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/error-messages";

export function VerifyForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const code = String(new FormData(event.currentTarget).get("code")).replace(/\s/g, "");
    const { error } =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code })
        : await authClient.twoFactor.verifyBackupCode({ code });
    if (error) {
      setError(error.status === 401 ? "פג הזמן לכניסה. התחברו שוב עם אימייל וסיסמה." : authErrorMessage(error));
      setPending(false);
      return;
    }
    router.replace("/clinic");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError>{error}</FormError>
      {mode === "totp" ? (
        <Field
          key="totp"
          id="code"
          name="code"
          label="קוד מהאפליקציה"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          dir="ltr"
          className="block h-14 w-full rounded-md border border-line bg-surface text-center text-2xl tracking-[0.4em] tabular-nums focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
          autoFocus
          required
        />
      ) : (
        <Field key="backup" id="code" name="code" label="קוד גיבוי" autoComplete="off" dir="ltr" autoFocus required />
      )}
      <PrimaryButton type="submit" pending={pending}>
        אימות
      </PrimaryButton>
      <div className="flex flex-col items-center gap-2 text-[0.9375rem]">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "totp" ? "backup" : "totp");
            setError("");
          }}
          className="text-petrol underline-offset-4 hover:underline"
        >
          {mode === "totp" ? "אין גישה לאפליקציה? כניסה עם קוד גיבוי" : "חזרה לקוד מהאפליקציה"}
        </button>
        <Link href="/clinic/login" className="text-slate underline-offset-4 hover:underline">
          חזרה לכניסה
        </Link>
      </div>
    </form>
  );
}
