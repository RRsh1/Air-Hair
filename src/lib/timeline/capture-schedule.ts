import type { TimelinePosition } from "./days";

export const photoAngles = ["front", "top", "back"] as const;
export type PhotoAngle = (typeof photoAngles)[number];

/**
 * A capture rule as stored in capture_rules. The clinic edits these in the timeline editor.
 *  - pre_op rules: `maxCount` captures any time before surgery (no day numbers).
 *  - post_op rules: capture on fromDay, fromDay + everyDays, ... up to toDay.
 */
export type CaptureRule =
  | { phase: "pre_op"; maxCount: number; angles: readonly PhotoAngle[] }
  | { phase: "post_op"; fromDay: number; toDay: number; everyDays: number; angles: readonly PhotoAngle[] };

const ALL_ANGLES = photoAngles;

/**
 * Default schedule seeded into every new template:
 *  one capture before surgery, day 0 after the operation, daily days 1–12,
 *  weekly until the end of month one, then monthly until the end of follow-up.
 */
export function defaultCaptureRules(followUpMonths: number): CaptureRule[] {
  return [
    { phase: "pre_op", maxCount: 1, angles: ALL_ANGLES },
    { phase: "post_op", fromDay: 0, toDay: 12, everyDays: 1, angles: ALL_ANGLES },
    { phase: "post_op", fromDay: 19, toDay: 26, everyDays: 7, angles: ALL_ANGLES },
    { phase: "post_op", fromDay: 60, toDay: followUpMonths * 30, everyDays: 30, angles: ALL_ANGLES },
  ];
}

function matchesPostOp(rule: Extract<CaptureRule, { phase: "post_op" }>, day: number): boolean {
  return day >= rule.fromDay && day <= rule.toDay && (day - rule.fromDay) % rule.everyDays === 0;
}

/**
 * Angles expected at a timeline position, or an empty list when no capture is due.
 * `preOpCapturesSoFar` lets pre_op rules stop once their maxCount is reached.
 */
export function anglesDue(
  rules: readonly CaptureRule[],
  position: TimelinePosition,
  preOpCapturesSoFar = 0,
): PhotoAngle[] {
  const due = new Set<PhotoAngle>();
  for (const rule of rules) {
    if (rule.phase === "pre_op" && position.phase === "pre_op" && preOpCapturesSoFar < rule.maxCount) {
      rule.angles.forEach((angle) => due.add(angle));
    }
    if (rule.phase === "post_op" && position.phase === "post_op" && matchesPostOp(rule, position.day)) {
      rule.angles.forEach((angle) => due.add(angle));
    }
  }
  return photoAngles.filter((angle) => due.has(angle));
}

/** All post-op capture days in ascending order, for drawing the film strip. */
export function postOpCaptureDays(rules: readonly CaptureRule[]): number[] {
  const days = new Set<number>();
  for (const rule of rules) {
    if (rule.phase !== "post_op") continue;
    for (let day = rule.fromDay; day <= rule.toDay; day += rule.everyDays) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

/** Validation used by the timeline editor before publishing a version. */
export function validateCaptureRules(rules: readonly CaptureRule[]): string[] {
  const errors: string[] = [];
  rules.forEach((rule, index) => {
    if (rule.angles.length === 0) errors.push(`Rule ${index + 1}: choose at least one angle`);
    if (rule.phase === "pre_op" && (!Number.isInteger(rule.maxCount) || rule.maxCount < 1)) {
      errors.push(`Rule ${index + 1}: pre-op count must be at least 1`);
    }
    if (rule.phase === "post_op") {
      if (!Number.isInteger(rule.fromDay) || rule.fromDay < 0) errors.push(`Rule ${index + 1}: start day must be 0 or later`);
      if (rule.toDay < rule.fromDay) errors.push(`Rule ${index + 1}: end day is before start day`);
      if (!Number.isInteger(rule.everyDays) || rule.everyDays < 1) errors.push(`Rule ${index + 1}: interval must be at least 1 day`);
    }
  });
  return errors;
}
