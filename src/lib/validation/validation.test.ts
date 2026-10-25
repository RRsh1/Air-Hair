import { describe, expect, it } from "vitest";
import { normalizeIsraeliId } from "./israeli-id";
import { maskPhone, normalizeIsraeliMobile } from "./phone";
import { smsSenderNameSchema } from "./sms-sender";

describe("normalizeIsraeliId", () => {
  it("accepts valid IDs and pads to 9 digits", () => {
    expect(normalizeIsraeliId("123456782")).toBe("123456782");
    expect(normalizeIsraeliId("12345678-2")).toBe("123456782");
    expect(normalizeIsraeliId("18")).toBeNull(); // too short to be a real ID
    expect(normalizeIsraeliId("000000018")).toBe("000000018");
    expect(normalizeIsraeliId("00018")).toBe("000000018");
  });

  it("rejects a wrong check digit, letters and all zeros", () => {
    expect(normalizeIsraeliId("123456789")).toBeNull();
    expect(normalizeIsraeliId("12345678a")).toBeNull();
    expect(normalizeIsraeliId("000000000")).toBeNull();
  });
});

describe("normalizeIsraeliMobile", () => {
  it.each(["050-1234567", "0501234567", "+972501234567", "00972501234567", "972-50-123-4567", "(050) 123 4567"])("normalizes %s", (input) => {
    expect(normalizeIsraeliMobile(input)).toBe("+972501234567");
  });

  it("rejects landlines and malformed numbers", () => {
    expect(normalizeIsraeliMobile("08-6234567")).toBeNull();
    expect(normalizeIsraeliMobile("050123456")).toBeNull();
    expect(normalizeIsraeliMobile("phone")).toBeNull();
  });

  it("masks all but the last four digits", () => {
    expect(maskPhone("+972501234567")).toBe("•••4567");
  });
});

describe("smsSenderNameSchema", () => {
  it("accepts short Latin names", () => {
    expect(smsSenderNameSchema.parse(" HairClinic ")).toBe("HairClinic");
  });

  it("rejects long, Hebrew or digit-only names", () => {
    expect(smsSenderNameSchema.safeParse("HairClinicTLV").success).toBe(false);
    expect(smsSenderNameSchema.safeParse("מרפאה").success).toBe(false);
    expect(smsSenderNameSchema.safeParse("12345").success).toBe(false);
  });
});
