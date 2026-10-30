import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // PGlite ships WebAssembly that must be loaded by Node, not bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  partialPrefetching: true,
  // The floating dev badge overlaps the patient app's corners in reviews and screenshots.
  devIndicators: false,
  // Until there is a public landing page, the root goes to the clinic sign-in.
  async redirects() {
    return [{ source: "/", destination: "/clinic/login", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
