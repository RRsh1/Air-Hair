"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/clinic/login");
        router.refresh();
      }}
      className="rounded-md border border-line px-3 py-1.5 font-medium hover:border-petrol hover:text-petrol"
    >
      יציאה
    </button>
  );
}
