import "server-only";
import { cache } from "react";
import { getDb } from "@/db/client";
import { loadClinicBranding } from "./branding";

/** The clinic's published theme and logo, memoized per request. */
export const getClinicBranding = cache((clinicId: string) => loadClinicBranding(getDb(), clinicId));

export const logoUrl = (slug: string, logoId: string) => `/c/${slug}/logo/${logoId}`;
