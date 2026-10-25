import { isIP } from "node:net";

/**
 * The client IP, only from headers a trusted proxy controls.
 *  - On Vercel (VERCEL=1) the platform overwrites x-vercel-forwarded-for.
 *  - Behind another proxy that overwrites x-forwarded-for, set TRUST_PROXY_HEADERS=1.
 *  - Otherwise headers are client-controlled and ignored: the result is null, and callers fall
 *    back to a shared "unknown" rate-limit bucket.
 * IPv6 addresses are reduced to their /64 network (one subscriber), which also keeps less data.
 */
export function clientIpFromHeaders(
  headers: { get(name: string): string | null },
  env: { VERCEL?: string; TRUST_PROXY_HEADERS?: string } = {
    VERCEL: process.env.VERCEL,
    TRUST_PROXY_HEADERS: process.env.TRUST_PROXY_HEADERS,
  },
): string | null {
  const raw =
    env.VERCEL === "1"
      ? headers.get("x-vercel-forwarded-for")
      : env.TRUST_PROXY_HEADERS === "1"
        ? headers.get("x-forwarded-for")
        : null;
  return normalizeIp(raw?.split(",")[0]?.trim() ?? "");
}

export function normalizeIp(value: string): string | null {
  const ip = value.slice(0, 64);
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6) return null;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  return `${expandIpv6(ip).slice(0, 4).join(":")}::/64`;
}

function expandIpv6(ip: string): string[] {
  const withoutV4 = ip.includes(".") ? ip.slice(0, ip.lastIndexOf(":") + 1) + "0:0" : ip;
  const [head, tail] = withoutV4.split("::");
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const middle = tail === undefined ? [] : Array(8 - left.length - right.length).fill("0");
  return [...left, ...middle, ...right].map((part) => (parseInt(part, 16) || 0).toString(16));
}

/** Rate-limit key part for an IP; requests without a trusted IP share one bucket. */
export const ipBucket = (ip: string | null) => ip ?? "unknown";
