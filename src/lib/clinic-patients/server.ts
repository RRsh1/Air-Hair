import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { requireStaff } from "@/lib/auth/server";
import { clientIpFromHeaders } from "@/lib/net/client-ip";
import type { StaffContext } from "./patients";

/** The signed-in staff member as an access-policy context, memoized per request. */
export const getStaffContext = cache(async () => {
  const access = await requireStaff();
  const context: StaffContext = { actor: access.actor, settings: access.staff.settings };
  return { ...context, staff: access.staff };
});

export async function staffRequestIp(): Promise<string | null> {
  return clientIpFromHeaders(await headers());
}
