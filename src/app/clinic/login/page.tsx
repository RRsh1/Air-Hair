import { Suspense } from "react";
import { AuthShell } from "@/components/clinic/auth-shell";
import { LoginForm } from "./login-form";

const notes: Record<string, string> = {
  reset: "הסיסמה נשמרה. אפשר להתחבר.",
};

const errors: Record<string, string> = {
  no_access: "לחשבון הזה אין גישה לדשבורד של המרפאה. פנו לאדמין של המרפאה.",
};

export default function LoginPage({ searchParams }: PageProps<"/clinic/login">) {
  return (
    <AuthShell title="כניסה לצוות המרפאה" description="התחברו כדי לעקוב אחרי ההחלמה של המטופלים.">
      {/* The form prerenders; the optional note/error from the URL streams in. */}
      <Suspense fallback={<LoginForm />}>
        <LoginWithMessages searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function LoginWithMessages({ searchParams }: Pick<PageProps<"/clinic/login">, "searchParams">) {
  const params = await searchParams;
  const note = typeof params.note === "string" ? notes[params.note] : undefined;
  const error = typeof params.error === "string" ? errors[params.error] : undefined;
  return <LoginForm note={note} initialError={error} />;
}
