import { describe, expect, it } from "vitest";
import { courseProfile } from "@/config/clinic.config";
import { laborRules, workdaysByMonth } from "@/config/labor.config";
import { planAutoSchedule } from "@/domain/rules/auto-schedule";
import {
  canAssignShift,
  evaluateLaborIssues,
  shiftMinutes,
  summarizeMonth,
  targetRange,
} from "@/domain/rules/labor-hours";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";

const settings = { ...laborRules, workdaysByMonth: { ...workdaysByMonth, "2026-10": 20 }, shifts: courseProfile.shifts };
const person = "1001";

function shift(date: string, shiftId: string, personId = person): ScheduleEntry {
  return { id: `${date}_${personId}_${shiftId}`, date, personId, state: "shift", shiftId, updatedAt: 1 };
}

function octoberDays(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, index) => `2026-10-${String(from + index).padStart(2, "0")}`);
}

describe("labor settings", () => {
  it("uses the real shift lengths", () => {
    expect(Object.fromEntries(shiftMinutes(courseProfile.shifts))).toEqual({ morning: 220, afternoon: 190, evening: 190 });
  });

  it("derives October limits from 20 workdays", () => {
    const summary = summarizeMonth([], person, "2026-10", settings);
    expect(summary.normalCapMinutes).toBe(160 * 60);
    expect(summary.totalCapMinutes).toBe(206 * 60);
    expect(summary.requiredRestDays).toBe(9);
    expect(summary.restDays).toBe(31);
  });

  it("reports an unknown month as not configured", () => {
    expect(summarizeMonth([], person, "2028-01", settings).normalCapMinutes).toBeUndefined();
  });

  it("includes the 2027 government calendar", () => {
    expect(summarizeMonth([], person, "2027-02", settings).normalCapMinutes).toBe(120 * 60);
    expect(summarizeMonth([], person, "2027-10", settings).normalCapMinutes).toBe(152 * 60);
    const year = Object.entries(workdaysByMonth).filter(([month]) => month.startsWith("2027"));
    expect(year).toHaveLength(12);
    expect(year.reduce((sum, [, days]) => sum + days, 0)).toBe(244);
  });
});

describe("labor checks", () => {
  it("counts leave as a rest day", () => {
    const entries: ScheduleEntry[] = [
      shift("2026-10-01", "morning"),
      { id: `2026-10-02_${person}`, date: "2026-10-02", personId: person, state: "leave", updatedAt: 1 },
    ];
    expect(summarizeMonth(entries, person, "2026-10", settings).restDays).toBe(30);
  });

  it("refuses a shift that would exceed the monthly normal hours", () => {
    // 15 天 × 早午晚（600 分）= 9000 分，再加 10/20 早＋午 410 分 = 9410 分
    const fullDays = [...octoberDays(1, 7), ...octoberDays(10, 12), ...octoberDays(15, 19)];
    const entries = [
      ...fullDays.flatMap((date) => ["morning", "afternoon", "evening"].map((shiftId) => shift(date, shiftId))),
      shift("2026-10-20", "morning"),
      shift("2026-10-20", "afternoon"),
    ];
    expect(summarizeMonth(entries, person, "2026-10", settings).workedMinutes).toBe(9410);
    // 再排晚診剛好 9600 分＝160 小時，可以
    expect(canAssignShift(entries, person, "2026-10-20", "evening", settings)).toBe(true);
    const full = [...entries, shift("2026-10-20", "evening")];
    // 已滿 160 小時，再排就超過
    expect(canAssignShift(full, person, "2026-10-21", "afternoon", settings)).toBe(false);
  });

  it("refuses to take away the last rest days of a two-week block", () => {
    const entries = octoberDays(1, 12).map((date) => shift(date, "morning"));
    expect(summarizeMonth(entries, person, "2026-10", settings).blockRestDays[0]).toBe(2);
    expect(canAssignShift(entries, person, "2026-10-13", "morning", settings)).toBe(false);
    expect(canAssignShift(entries, person, "2026-10-12", "afternoon", settings)).toBe(true);
  });

  it("refuses a fourth shift beyond ten hours in a day", () => {
    const entries = [shift("2026-10-05", "morning"), shift("2026-10-05", "afternoon"), shift("2026-10-05", "evening")];
    expect(summarizeMonth(entries, person, "2026-10", settings).maxDailyMinutes).toBe(600);
  });

  it("flags manual schedules that break the rules", () => {
    const entries = octoberDays(1, 14).map((date) => shift(date, "morning"));
    const messages = evaluateLaborIssues(entries, [person], ["2026-10"], settings).map((issue) => issue.message);
    expect(messages).toContain("1–14 日只休 0 天");
  });
});

describe("auto schedule with labor limits", () => {
  it("never pushes anyone past the normal monthly hours or rest rules", () => {
    const doctor: CoursePerson = { id: "doctor-x", displayName: "醫師 X", role: "doctor" };
    const assistants: CoursePerson[] = Array.from({ length: 3 }, (_, index) => ({
      id: `assistant-${index}`,
      displayName: `助理 ${index}`,
      role: "assistant",
    }));
    const days = octoberDays(1, 31);
    const doctorEntries = days.flatMap((date) => ["morning", "afternoon", "evening"].map((shiftId) => shift(date, shiftId, doctor.id)));
    const planned = planAutoSchedule(doctorEntries, [doctor, ...assistants], days, courseProfile.shifts, 3, 1, 3, {
      canAssign: (personId, date, shiftId, current) => canAssignShift(current, personId, date, shiftId, settings),
      loadOf: (personId, current) => summarizeMonth(current, personId, "2026-10", settings).workedMinutes,
    });
    const all = [...doctorEntries, ...planned];
    expect(planned.length).toBeGreaterThan(0);
    expect(evaluateLaborIssues(all, assistants.map((item) => item.id), ["2026-10"], settings)).toEqual([]);
    for (const assistant of assistants) {
      expect(summarizeMonth(all, assistant.id, "2026-10", settings).workedMinutes).toBeLessThanOrEqual(160 * 60);
    }
  });
});

describe("leave hours and monthly target", () => {
  const preLeave = (date: string): ScheduleEntry => ({
    id: `${date}_${person}`, date, personId: person, state: "leave", note: "預假｜特休", updatedAt: 1,
  });

  it("counts each pre-leave day as 8 paid hours, but not a plain day off", () => {
    const entries: ScheduleEntry[] = [
      shift("2026-10-01", "morning"),
      preLeave("2026-10-02"),
      preLeave("2026-10-05"),
      { id: `2026-10-06_${person}`, date: "2026-10-06", personId: person, state: "leave", updatedAt: 1 },
    ];
    const summary = summarizeMonth(entries, person, "2026-10", settings);
    expect(summary.workedMinutes).toBe(220);
    expect(summary.leaveMinutes).toBe(16 * 60);
    expect(summary.paidMinutes).toBe(220 + 16 * 60);
  });

  it("includes leave hours in the normal-hours cap", () => {
    // 13 天早午晚（7800 分）＋ 早（220）＋ 早午（410）＋ 2 天特休（960）＝ 9390 分；
    // 再加午診 190 分 = 9580 分可以，加早診 220 分 = 9610 分超過 9600 分。
    const entries = [
      ...octoberDays(1, 13).flatMap((date) => ["morning", "afternoon", "evening"].map((id) => shift(date, id))),
      preLeave("2026-10-14"),
      preLeave("2026-10-15"),
      shift("2026-10-17", "morning"),
      shift("2026-10-18", "morning"),
      shift("2026-10-18", "afternoon"),
    ];
    expect(canAssignShift(entries, person, "2026-10-20", "afternoon", settings)).toBe(true);
    expect(canAssignShift(entries, person, "2026-10-20", "morning", settings)).toBe(false);
    expect(canAssignShift(entries, person, "2026-10-20", "afternoon", settings, 9500)).toBe(false);
  });

  it("defaults the target to 8–10 hours under the normal hours and accepts a monthly override", () => {
    expect(targetRange("2027-01", settings)).toEqual({ minMinutes: 150 * 60, maxMinutes: 152 * 60 });
    expect(targetRange("2027-02", settings)).toEqual({ minMinutes: 110 * 60, maxMinutes: 112 * 60 });
    expect(targetRange("2027-01", settings, { min: 148, max: 152 })).toEqual({ minMinutes: 148 * 60, maxMinutes: 152 * 60 });
    expect(targetRange("2028-01", settings)).toBeUndefined();
  });
});
