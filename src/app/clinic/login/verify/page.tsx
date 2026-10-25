import { AuthShell } from "@/components/clinic/auth-shell";
import { VerifyForm } from "./verify-form";

export default function VerifyPage() {
  return (
    <AuthShell title="קוד אימות" description="הזינו את הקוד בן שש הספרות מאפליקציית האימות בטלפון.">
      <VerifyForm />
    </AuthShell>
  );
}
