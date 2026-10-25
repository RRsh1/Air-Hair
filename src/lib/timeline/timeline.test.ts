import { describe, expect, it } from "vitest";
import { anglesDue, defaultCaptureRules, postOpCaptureDays, validateCaptureRules, type CaptureRule } from "./capture-schedule";
import {
  currentPosition,
  daysBetween,
  entryPosition,
  isEntryBeforeSurgery,
  isOverdueUnmarked,
  isValidTimeZone,
  localDate,
  phaseForNewEntry,
  type TreatmentTiming,
} from "./days";

const TZ = "Asia/Jerusalem";
const scheduled: TreatmentTiming = { status: "scheduled", plannedSurgeryDate: "2026-04-01" };
const performed: TreatmentTiming = { status: "performed", actualSurgeryDate: "2026-04-01" };

describe("days", () => {
  it("uses the clinic's calendar date, not UTC", () => {
    // 23:30 UTC on Mar 1 is already Mar 2 in Israel.
    expect(localDate(new Date("2026-03-01T23:30:00Z"), TZ)).toBe("2026-03-02");
  });

  it("counts calendar days across a DST change", () => {
    expect(daysBetween("2026-03-26", "2026-03-28")).toBe(2);
  });

  it("throws on malformed dates and instants instead of returning NaN", () => {
    expect(() => daysBetween("2026-4-1" as never, "2026-04-02")).toThrow(/Invalid date/);
    expect(() => localDate(new Date("nope"), TZ)).toThrow(/Invalid instant/);
  });

  it("validates IANA time zones", () => {
    expect(isValidTimeZone("Asia/Jerusalem")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("entry phase and position", () => {
  it("records pre_op until the clinic marks the surgery performed", () => {
    expect(phaseForNewEntry(scheduled)).toBe("pre_op");
    expect(phaseForNewEntry(performed)).toBe("post_op");
  });

  it("keeps a pre-op photo from the morning of surgery as pre_op, never day 0", () => {
    const surgeryMorning = { phase: "pre_op" as const, capturedAt: new Date("2026-04-01T05:00:00Z") };
    expect(entryPosition(surgeryMorning, performed, TZ)).toEqual({ phase: "pre_op" });
  });

  it("puts the post-surgery photo on day 0 and later photos on their day", () => {
    expect(entryPosition({ phase: "post_op", capturedAt: new Date("2026-04-01T15:00:00Z") }, performed, TZ)).toEqual({
      phase: "post_op",
      day: 0,
    });
    expect(entryPosition({ phase: "post_op", capturedAt: new Date("2026-04-13T08:00:00Z") }, performed, TZ)).toEqual({
      phase: "post_op",
      day: 12,
    });
  });

  it("re-orders post-op photos when the surgery date is corrected", () => {
    const entry = { phase: "post_op" as const, capturedAt: new Date("2026-04-05T09:00:00Z") };
    expect(entryPosition(entry, performed, TZ)).toEqual({ phase: "post_op", day: 4 });
    expect(entryPosition(entry, { status: "performed", actualSurgeryDate: "2026-04-03" }, TZ)).toEqual({
      phase: "post_op",
      day: 2,
    });
  });

  it("clamps and flags a post-op photo that now falls before a corrected surgery date", () => {
    const entry = { phase: "post_op" as const, capturedAt: new Date("2026-04-02T09:00:00Z") };
    const corrected: TreatmentTiming = { status: "performed", actualSurgeryDate: "2026-04-04" };
    expect(entryPosition(entry, corrected, TZ)).toEqual({ phase: "post_op", day: 0 });
    expect(isEntryBeforeSurgery(entry, corrected, TZ)).toBe(true);
    expect(isEntryBeforeSurgery(entry, performed, TZ)).toBe(false);
  });

  it("handles a capture just after local midnight on surgery day", () => {
    // 21:30 UTC on Mar 31 = 00:30 Apr 1 in Israel (UTC+3 in April).
    const entry = { phase: "post_op" as const, capturedAt: new Date("2026-03-31T21:30:00Z") };
    expect(entryPosition(entry, performed, TZ)).toEqual({ phase: "post_op", day: 0 });
  });

  it("keeps the patient in pre_op until the surgery is marked, even after the planned date", () => {
    expect(currentPosition(new Date("2026-05-01T10:00:00Z"), scheduled, TZ)).toEqual({ phase: "pre_op" });
    expect(currentPosition(new Date("2026-04-03T10:00:00Z"), performed, TZ)).toEqual({ phase: "post_op", day: 2 });
  });

  it("flags scheduled surgeries whose date has passed", () => {
    expect(isOverdueUnmarked(scheduled, new Date("2026-04-01T12:00:00Z"), TZ)).toBe(false);
    expect(isOverdueUnmarked(scheduled, new Date("2026-04-02T12:00:00Z"), TZ)).toBe(true);
    expect(isOverdueUnmarked(performed, new Date("2026-06-01T12:00:00Z"), TZ)).toBe(false);
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

  it("stays valid for short follow-up periods", () => {
    expect(postOpCaptureDays(defaultCaptureRules(1))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 19, 26]);
    expect(postOpCaptureDays(defaultCaptureRules(2))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 19, 26, 60]);
    for (const months of [1, 2, 3, 6, 12, 36]) {
      expect(validateCaptureRules(defaultCaptureRules(months), months)).toEqual([]);
    }
  });

  it("reports broken rules, including non-finite and out-of-range end days", () => {
    expect(validateCaptureRules([{ phase: "post_op", fromDay: 10, toDay: 5, everyDays: 0, angles: [] }], 6)).toHaveLength(3);
    expect(validateCaptureRules([{ phase: "post_op", fromDay: 0, toDay: Infinity, everyDays: 1, angles: ["front"] }], 6)).toHaveLength(1);
    expect(validateCaptureRules([{ phase: "post_op", fromDay: 0, toDay: 5000, everyDays: 1, angles: ["front"] }], 6)).toHaveLength(1);
  });

  it("throws instead of looping forever on a malformed rule", () => {
    const zeroInterval: CaptureRule = { phase: "post_op", fromDay: 0, toDay: 10, everyDays: 0, angles: ["front"] };
    const nullInterval = { phase: "post_op", fromDay: 0, toDay: 10, everyDays: null, angles: ["front"] } as unknown as CaptureRule;
    expect(() => postOpCaptureDays([zeroInterval])).toThrow(/Malformed/);
    expect(() => postOpCaptureDays([nullInterval])).toThrow(/Malformed/);
    expect(() => anglesDue([zeroInterval], { phase: "post_op", day: 1 })).toThrow(/Malformed/);
  });
});
