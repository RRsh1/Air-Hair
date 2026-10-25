import { describe, expect, it } from "vitest";
import { anglesDue, defaultCaptureRules, postOpCaptureDays, validateCaptureRules } from "./capture-schedule";
import { daysBetween, isOverdueUnmarked, localDate, timelinePosition } from "./days";

const TZ = "Asia/Jerusalem";

describe("days", () => {
  it("uses the clinic's calendar date, not UTC", () => {
    // 23:30 UTC on Mar 1 is already Mar 2 in Israel.
    expect(localDate(new Date("2026-03-01T23:30:00Z"), TZ)).toBe("2026-03-02");
  });

  it("counts calendar days across a DST change", () => {
    expect(daysBetween("2026-03-26", "2026-03-28")).toBe(2); // Israel moves clocks on Mar 27, 2026
  });

  it("keeps patients in pre_op until the surgery is marked performed", () => {
    const longAfterPlannedDate = new Date("2026-05-01T10:00:00Z");
    expect(timelinePosition(longAfterPlannedDate, { status: "scheduled", plannedSurgeryDate: "2026-04-01" }, TZ)).toEqual({
      phase: "pre_op",
    });
  });

  it("derives day numbers from the actual surgery date", () => {
    const timing = { status: "performed", actualSurgeryDate: "2026-04-01" } as const;
    expect(timelinePosition(new Date("2026-04-01T15:00:00Z"), timing, TZ)).toEqual({ phase: "post_op", day: 0 });
    expect(timelinePosition(new Date("2026-04-13T08:00:00Z"), timing, TZ)).toEqual({ phase: "post_op", day: 12 });
    expect(timelinePosition(new Date("2026-03-28T08:00:00Z"), timing, TZ)).toEqual({ phase: "pre_op" });
  });

  it("re-orders existing photos when the surgery date is corrected", () => {
    const capturedAt = new Date("2026-04-05T09:00:00Z");
    expect(timelinePosition(capturedAt, { status: "performed", actualSurgeryDate: "2026-04-01" }, TZ)).toEqual({
      phase: "post_op",
      day: 4,
    });
    expect(timelinePosition(capturedAt, { status: "performed", actualSurgeryDate: "2026-04-03" }, TZ)).toEqual({
      phase: "post_op",
      day: 2,
    });
  });

  it("flags scheduled surgeries whose date has passed", () => {
    const timing = { status: "scheduled", plannedSurgeryDate: "2026-04-01" } as const;
    expect(isOverdueUnmarked(timing, new Date("2026-04-01T12:00:00Z"), TZ)).toBe(false);
    expect(isOverdueUnmarked(timing, new Date("2026-04-02T12:00:00Z"), TZ)).toBe(true);
    expect(isOverdueUnmarked({ status: "performed", actualSurgeryDate: "2026-04-01" }, new Date("2026-06-01"), TZ)).toBe(false);
  });
});

describe("default capture schedule", () => {
  const rules = defaultCaptureRules(6);

  it("captures day 0 to 12 daily, days 19 and 26, then monthly to month 6", () => {
    expect(postOpCaptureDays(rules)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 19, 26, 60, 90, 120, 150, 180]);
  });

  it("asks for all three angles on capture days and none in between", () => {
    expect(anglesDue(rules, { phase: "post_op", day: 5 })).toEqual(["front", "top", "back"]);
    expect(anglesDue(rules, { phase: "post_op", day: 15 })).toEqual([]);
    expect(anglesDue(rules, { phase: "post_op", day: 181 })).toEqual([]);
  });

  it("asks for one pre-op capture only", () => {
    expect(anglesDue(rules, { phase: "pre_op" }, 0)).toEqual(["front", "top", "back"]);
    expect(anglesDue(rules, { phase: "pre_op" }, 1)).toEqual([]);
  });

  it("follows the clinic's follow-up length", () => {
    expect(postOpCaptureDays(defaultCaptureRules(3)).at(-1)).toBe(90);
  });

  it("passes validation and reports broken rules", () => {
    expect(validateCaptureRules(rules)).toEqual([]);
    expect(
      validateCaptureRules([{ phase: "post_op", fromDay: 10, toDay: 5, everyDays: 0, angles: [] }]),
    ).toHaveLength(3);
  });
});
