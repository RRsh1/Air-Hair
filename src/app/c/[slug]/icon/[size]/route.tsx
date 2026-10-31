import { ImageResponse } from "next/og";
import { getDb } from "@/db/client";
import { getClinic } from "@/lib/patient-auth/server";
import { getStorage } from "@/lib/storage";
import { parseIconSize } from "@/lib/theme/app-icon";
import { inspectLogo, logoObject } from "@/lib/theme/branding";
import { swatchHex } from "@/lib/theme/patient-theme";
import { getClinicBranding } from "@/lib/theme/server";

/**
 * The home-screen icon: the clinic logo on a white tile, or, without a logo, the recovery ruler's
 * marker in the clinic's accent color. "-maskable" keeps everything inside the safe zone.
 */
export async function GET(_request: Request, { params }: RouteContext<"/c/[slug]/icon/[size]">) {
  const { slug, size: raw } = await params;
  const spec = parseIconSize(raw);
  const clinic = spec ? await getClinic(slug) : null;
  if (!spec || !clinic) return new Response(null, { status: 404 });
  const { size, maskable } = spec;

  const { theme, logoId } = await getClinicBranding(clinic.id);
  const logo = logoId ? await logoObject(getDb(), { clinicId: clinic.id, logoId }) : null;
  const file = logo ? await getStorage().get(logo.storageKey) : null;
  const logoSrc = file && logo ? `data:${logo.contentType};base64,${Buffer.from(file.body).toString("base64")}` : null;
  const logoSize = file ? inspectLogo(file.body) : null;
  const accent = swatchHex(theme, theme.blocks.base.accent);
  const accentInk = swatchHex(theme, theme.blocks.base.accentInk);
  // Maskable icons may be cropped to a circle: keep the mark within the central 80%.
  const inset = maskable ? 0.2 : 0.12;

  // The logo fitted into the safe area (at most 60% as tall as wide), keeping its proportions.
  const box = { w: size * (1 - inset * 2), h: size * (1 - inset * 2) * 0.6 };
  const scale = logoSize ? Math.min(box.w / logoSize.width, box.h / logoSize.height) : 1;
  const mark = logoSrc && logoSize ? (
    // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
    <img src={logoSrc} alt="" width={Math.round(logoSize.width * scale)} height={Math.round(logoSize.height * scale)} />
  ) : (
    <div style={{ display: "flex", alignItems: "center", width: size * (1 - inset * 2) }}>
      <div style={{ height: size * 0.035, flex: 1, background: accentInk, opacity: 0.35, borderRadius: size }} />
      <div style={{ width: size * 0.2, height: size * 0.2, borderRadius: size, background: accentInk, margin: `0 ${size * 0.03}px` }} />
      <div style={{ height: size * 0.035, flex: 1, background: accentInk, opacity: 0.35, borderRadius: size }} />
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: logoSrc && logoSize ? "#ffffff" : accent }}>
        {mark}
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=3600" } },
  );
}
