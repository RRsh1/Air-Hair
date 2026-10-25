import { describe, expect, it } from "vitest";
import { parseClinicSettings } from "../clinic-settings/schema";
import { resolveStaffAccess, staffTwoFactorRequired, type StaffRecord } from "./staff-access";

const staff: StaffRecord = {
  id: "s1",
  clinicId: "c1",
  clinicName: "מרפאה",
  role: "admin",
  fullName: "אדמין",
  disabledAt: null,
  settings: parseClinicSettings({}),
};
const notEnrolled = { id: "u1", email: "a@test.com", twoFactorEnabled: false };

describe("staffTwoFactorRequired", () => {
  it("is required by default", () => {
    expect(staffTwoFactorRequired({ NODE_ENV: "development" })).toBe(true);
  });

  it("can be switched off for local development only", () => {
    expect(staffTwoFactorRequired({ NODE_ENV: "development", REQUIRE_STAFF_2FA: "false" })).toBe(false);
    expect(staffTwoFactorRequired({ NODE_ENV: "production", REQUIRE_STAFF_2FA: "false" })).toBe(true);
  });
});

describe("resolveStaffAccess", () => {
  it("sends non-enrolled staff to setup when 2FA is required", () => {
    expect(resolveStaffAccess(notEnrolled, staff).state).toBe("needs_2fa_setup");
  });

  it("lets non-enrolled staff in when 2FA is switched off", () => {
    expect(resolveStaffAccess(notEnrolled, staff, { requireTwoFactor: false }).state).toBe("ok");
  });

  it("still blocks disabled staff and non-staff when 2FA is switched off", () => {
    expect(resolveStaffAccess(notEnrolled, { ...staff, disabledAt: new Date() }, { requireTwoFactor: false }).state).toBe(
      "disabled",
    );
    expect(resolveStaffAccess(notEnrolled, null, { requireTwoFactor: false }).state).toBe("not_staff");
  });
});
