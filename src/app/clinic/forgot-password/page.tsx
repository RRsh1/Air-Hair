import { AuthShell } from "@/components/clinic/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="איפוס סיסמה" description="הזינו את האימייל שלכם ונשלח אליו קישור לבחירת סיסמה חדשה.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
