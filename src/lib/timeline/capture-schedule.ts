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
  const lastDay = followUpMonths * 30;
  const rules: CaptureRule[] = [
    { phase: "pre_op", maxCount: 1, angles: ALL_ANGLES },
    { phase: "post_op", fromDay: 0, toDay: Math.min(12, lastDay), everyDays: 1, angles: ALL_ANGLES },
  ];
  if (lastDay >= 19) rules.push({ phase: "post_op", fromDay: 19, toDay: Math.min(26, lastDay), everyDays: 7, angles: ALL_ANGLES });
  if (lastDay >= 60) rules.push({ phase: "post_op", fromDay: 60, toDay: lastDay, everyDays: 30, angles: ALL_ANGLES });
  return rules;
}

/** Upper bound for any rule's end day, so a typo can't create a decade-long schedule. */
export function maxScheduleDay(followUpMonths: number): number {
  return followUpMonths * 31;
}

function assertWellFormed(rule: Extract<CaptureRule, { phase: "post_op" }>): void {
  if (
    !Number.isInteger(rule.fromDay) ||
    !Number.isInteger(rule.toDay) ||
    !Number.isInteger(rule.everyDays) ||
    rule.everyDays < 1 ||
    rule.fromDay < 0 ||
    rule.toDay < rule.fromDay
  ) {
    throw new Error(`Malformed capture rule: ${JSON.stringify(rule)}`);
  }
}

function matchesPostOp(rule: Extract<CaptureRule, { phase: "post_op" }>, day: number): boolean {
  assertWellFormed(rule);
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
    assertWellFormed(rule);
    for (let day = rule.fromDay; day <= rule.toDay; day += rule.everyDays) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

/** Validation used by the timeline editor before publishing a version. */
export function validateCaptureRules(rules: readonly CaptureRule[], followUpMonths: number): string[] {
  const errors: string[] = [];
  const maxDay = maxScheduleDay(followUpMonths);
  rules.forEach((rule, index) => {
    const n = index + 1;
    if (rule.angles.length === 0) errors.push(`Rule ${n}: choose at least one angle`);
    if (rule.phase === "pre_op" && (!Number.isInteger(rule.maxCount) || rule.maxCount < 1)) {
      errors.push(`Rule ${n}: pre-op count must be at least 1`);
    }
    if (rule.phase === "post_op") {
      if (!Number.isInteger(rule.fromDay) || rule.fromDay < 0) errors.push(`Rule ${n}: start day must be 0 or later`);
      if (!Number.isInteger(rule.toDay)) errors.push(`Rule ${n}: end day must be a whole number`);
      else if (rule.toDay < rule.fromDay) errors.push(`Rule ${n}: end day is before start day`);
      else if (rule.toDay > maxDay) errors.push(`Rule ${n}: end day is past the follow-up period (day ${maxDay})`);
      if (!Number.isInteger(rule.everyDays) || rule.everyDays < 1) errors.push(`Rule ${n}: interval must be at least 1 day`);
    }
  });
  return errors;
}
