import "server-only";
import { cache } from "react";
import { getDb } from "@/db/client";
import { loadClinicBranding } from "./branding";

/** The clinic's published theme and logo, memoized per request. */
/** Branding for patient pages: the organization's, or with a branch's override when one is given. Per request. */
export const getClinicBranding = cache((clinicId: string, branchId: string | null = null) => loadClinicBranding(getDb(), clinicId, branchId));

export const logoUrl = (slug: string, logoId: string) => `/c/${slug}/logo/${logoId}`;
