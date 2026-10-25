"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { Field, FormError, PrimaryButton } from "@/components/clinic/form";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/error-messages";

type Step =
  | { name: "password" }
  | { name: "scan"; qr: string; secret: string; backupCodes: string[] }
  | { name: "backup"; backupCodes: string[] };

const steps = ["אישור סיסמה", "סריקת הקוד", "שמירת קודי גיבוי"];

export function SetupTwoFactor() {
  const [step, setStep] = useState<Step>({ name: "password" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const index = step.name === "password" ? 0 : step.name === "scan" ? 1 : 2;

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const password = String(new FormData(event.currentTarget).get("password"));
    const { data, error } = await authClient.twoFactor.enable({ password, method: "totp" });
    if (error || !data || data.method !== "totp") {
      setError(authErrorMessage(error));
      setPending(false);
      return;
    }
    // The QR is rendered here, in the browser; the secret never goes to a third-party service.
    const qr = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220, color: { dark: "#17262b", light: "#ffffff" } });
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setStep({ name: "scan", qr, secret, backupCodes: data.backupCodes });
    setPending(false);
  }

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.name !== "scan") return;
    setError("");
    setPending(true);
    const code = String(new FormData(event.currentTarget).get("code")).replace(/\s/g, "");
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    if (error) {
      setError(authErrorMessage(error));
      setPending(false);
      return;
    }
    setStep({ name: "backup", backupCodes: step.backupCodes });
    setPending(false);
  }

  return (
    <div className="space-y-6">
      <ol className="flex gap-2 text-[0.8125rem]" aria-label="שלבי ההגדרה">
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={i === index ? "step" : undefined}
            className={`flex-1 border-t-2 pt-2 ${i <= index ? "border-petrol text-ink" : "border-line text-slate"}`}
          >
            {label}
          </li>
        ))}
      </ol>

      <FormError>{error}</FormError>

      {step.name === "password" && (
        <form onSubmit={onPassword} className="space-y-5" noValidate>
          <Field id="password" name="password" type="password" label="הסיסמה שלכם" autoComplete="current-password" dir="ltr" required />
          <PrimaryButton type="submit" pending={pending}>
            המשך
          </PrimaryButton>
        </form>
      )}

      {step.name === "scan" && (
        <form onSubmit={onVerify} className="space-y-5" noValidate>
          <p className="text-[1rem] leading-relaxed text-slate">
            סרקו את הקוד באפליקציית אימות, כמו Google Authenticator או Microsoft Authenticator, והזינו את הקוד שמופיע בה.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated in the browser */}
          <img src={step.qr} alt="קוד QR לאפליקציית האימות" width={220} height={220} className="mx-auto rounded-md border border-line" />
          <details className="text-[0.9375rem] text-slate">
            <summary className="cursor-pointer text-petrol">אי אפשר לסרוק? הזנה ידנית</summary>
            <p dir="ltr" className="mt-2 select-all break-all rounded-md bg-surface px-3 py-2 text-center font-medium tracking-wider text-ink">
              {step.secret.replace(/(.{4})/g, "$1 ").trim()}
            </p>
          </details>
          <Field
            id="code"
            name="code"
            label="קוד מהאפליקציה"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            required
          />
          <PrimaryButton type="submit" pending={pending}>
            אימות והפעלה
          </PrimaryButton>
        </form>
      )}

      {step.name === "backup" && <BackupCodes codes={step.backupCodes} />}
    </div>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-5">
      <p className="text-[1rem] leading-relaxed text-slate">
        האימות הדו שלבי פעיל. אם הטלפון יאבד, אפשר להיכנס עם אחד מקודי הגיבוי האלה, וכל קוד עובד פעם אחת. שמרו אותם במקום בטוח, הם לא יוצגו שוב.
      </p>
      <ul dir="ltr" className="grid grid-cols-2 gap-2 rounded-md border border-line bg-surface p-4 text-center font-medium tabular-nums tracking-wide">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(codes.join("\n"));
          setCopied(true);
        }}
        className="h-12 w-full rounded-md border border-petrol text-[1.0625rem] font-semibold text-petrol hover:bg-petrol/5"
      >
        {copied ? "הקודים הועתקו" : "העתקת הקודים"}
      </button>
      <PrimaryButton type="button" onClick={() => router.replace("/clinic")}>
        שמרתי את הקודים, להמשך
      </PrimaryButton>
    </div>
  );
}
