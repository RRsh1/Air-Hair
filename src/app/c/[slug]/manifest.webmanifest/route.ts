import { getClinic } from "@/lib/patient-auth/server";
import { swatchHex } from "@/lib/theme/patient-theme";
import { getClinicBranding } from "@/lib/theme/server";

/**
 * The clinic's patient app as an installable web app: its name, colors and icon, opening on the
 * clinic's patient home and staying inside /c/<slug>/.
 */
export async function GET(_request: Request, { params }: RouteContext<"/c/[slug]/manifest.webmanifest">) {
  const { slug } = await params;
  const clinic = await getClinic(slug);
  if (!clinic) return new Response(null, { status: 404 });
  const { theme } = await getClinicBranding(clinic.id);
  const base = `/c/${slug}`;
  const manifest = {
    id: `${base}/`,
    name: clinic.name,
    short_name: clinic.name.length > 12 ? clinic.name.slice(0, 12) : clinic.name,
    description: "תיעוד ההחלמה שלך",
    lang: "he",
    dir: "rtl",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: swatchHex(theme, theme.blocks.base.bg),
    theme_color: swatchHex(theme, theme.blocks.base.bg),
    icons: [
      { src: `${base}/icon/192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icon/512`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/icon/512-maskable`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
