import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/clinic/auth-shell";
import { FormError } from "@/components/clinic/form";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage({ searchParams }: PageProps<"/clinic/reset-password">) {
  return (
    <AuthShell title="בחירת סיסמה" description="לפחות 12 תווים. משפט קצר שקל לזכור עובד טוב יותר מסיסמה מסובכת.">
      <Suspense fallback={null}>
        <ResetBody searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function ResetBody({ searchParams }: Pick<PageProps<"/clinic/reset-password">, "searchParams">) {
  const { token, error } = await searchParams;

  if (typeof token !== "string" || error) {
    return (
      <div className="space-y-5">
        <FormError>הקישור פג תוקף או שכבר השתמשו בו. אפשר לבקש קישור חדש.</FormError>
        <Link href="/clinic/forgot-password" className="block text-center text-[0.9375rem] text-petrol underline-offset-4 hover:underline">
          בקשת קישור חדש
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
