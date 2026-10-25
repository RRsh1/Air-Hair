import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/clinic/auth-shell";
import { getStaffAccess } from "@/lib/auth/server";
import { SetupTwoFactor } from "./setup-two-factor";

export default function SetupTwoFactorPage() {
  return (
    <AuthShell
      title="הגדרת אימות דו שלבי"
      description="כדי להגן על המידע של המטופלים, כל כניסה לדשבורד דורשת גם קוד מאפליקציית אימות בטלפון."
    >
      <Suspense fallback={null}>
        <SetupGate />
      </Suspense>
    </AuthShell>
  );
}

/** Only a signed-in staff member who has not enrolled yet may see the enrollment flow. */
async function SetupGate() {
  const access = await getStaffAccess();
  if (access.state === "anonymous") redirect("/clinic/login");
  if (access.state === "ok") redirect("/clinic");
  if (access.state !== "needs_2fa_setup") redirect("/clinic/login?error=no_access");
  return <SetupTwoFactor />;
}
