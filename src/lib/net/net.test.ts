import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../../proxy";
import { consoleSms, getSmsProvider } from "../notifications/sms";
import { clientIpFromHeaders, normalizeIp } from "./client-ip";
import { isSameOrigin } from "./same-origin";

const headers = (values: Record<string, string>) => new Headers(values);

describe("clientIpFromHeaders", () => {
  const spoofed = headers({ "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "5.6.7.8" });

  it("ignores client-controlled headers unless a trusted proxy is declared", () => {
    expect(clientIpFromHeaders(spoofed, {})).toBeNull();
  });

  it("uses the platform header on Vercel and x-forwarded-for only when trusted", () => {
    expect(clientIpFromHeaders(spoofed, { VERCEL: "1" })).toBe("5.6.7.8");
    expect(clientIpFromHeaders(spoofed, { TRUST_PROXY_HEADERS: "1" })).toBe("1.2.3.4");
  });

  it("rejects values that aren't IP addresses", () => {
    expect(clientIpFromHeaders(headers({ "x-vercel-forwarded-for": "a".repeat(5000) }), { VERCEL: "1" })).toBeNull();
    expect(clientIpFromHeaders(headers({ "x-vercel-forwarded-for": "otp:id:x" }), { VERCEL: "1" })).toBeNull();
  });

  it("buckets IPv6 by /64 and unwraps IPv4-mapped addresses", () => {
    expect(normalizeIp("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(normalizeIp("2001:db8:1:2:bbbb:cccc:dddd:eeee")).toBe("2001:db8:1:2::/64");
    expect(normalizeIp("::1")).toBe("0:0:0:0::/64");
    expect(normalizeIp("::ffff:10.0.0.1")).toBe("10.0.0.1");
  });
});

describe("isSameOrigin", () => {
  it("requires an Origin header matching the host", () => {
    expect(isSameOrigin({ headers: headers({ origin: "https://app.example", host: "app.example" }) })).toBe(true);
    expect(isSameOrigin({ headers: headers({ origin: "https://evil.example", host: "app.example" }) })).toBe(false);
    expect(isSameOrigin({ headers: headers({ host: "app.example" }) })).toBe(false);
    expect(isSameOrigin({ headers: headers({ origin: "null", host: "app.example" }) })).toBe(false);
  });
});

describe("getSmsProvider", () => {
  it("prints to the console in development and is closed in production", () => {
    expect(getSmsProvider({ NODE_ENV: "development" })).toBe(consoleSms);
    expect(getSmsProvider({ NODE_ENV: "production" })).toBeNull();
    expect(getSmsProvider({ NODE_ENV: "production", SMS_DRIVER: "console" })).toBeNull();
    expect(getSmsProvider({ NODE_ENV: "development", SMS_DRIVER: "none" })).toBeNull();
  });
});

describe("proxy", () => {
  const token = "A".repeat(43);

  it("slides the patient cookie's lifetime on each visit, scoped to the clinic path", () => {
    const response = proxy(new NextRequest("http://localhost/c/demo/frame/2", { headers: { cookie: `hairair_patient=${token}` } }));
    const cookie = response.cookies.get("hairair_patient");
    expect(cookie).toMatchObject({ value: token, path: "/c/demo", httpOnly: true, maxAge: 30 * 86_400 });
  });

  it("leaves visitors without a valid-looking cookie alone", () => {
    expect(proxy(new NextRequest("http://localhost/c/demo")).cookies.get("hairair_patient")).toBeUndefined();
    const junk = proxy(new NextRequest("http://localhost/c/demo", { headers: { cookie: "hairair_patient=x;y" } }));
    expect(junk.cookies.get("hairair_patient")).toBeUndefined();
  });
});
