import { describe, expect, it } from "vitest";
import { courseProfile, doctorDefaultFloors, doctorWeekdayFloors, pediatricDoctorIds } from "@/config/clinic.config";
import { doctorIdsByName } from "@/config/doctors";
import { closures2027, specialistVisits2027, weeklyTemplate2027 } from "@/config/doctor-schedule-2027";
import { FLEX_SHIFT_NOTE, laborRules, workdaysByMonth } from "@/config/labor.config";
import { schedulingPreferences } from "@/config/scheduling-preferences";
import { evaluateSessionDemand } from "@/domain/rules/assistant-demand";
import { planAutoSchedule, planHourTopUp, type RelaxStats } from "@/domain/rules/auto-schedule";
import { planDoctorScheduleImport } from "@/domain/rules/doctor-schedule-import";
import { buildMonthSessions } from "@/domain/rules/doctor-template";
import { canAssignShift, evaluateLaborIssues, summarizeMonth, targetRange } from "@/domain/rules/labor-hours";
import type { ScheduleEntry } from "@/domain/types";

const rules = { pediatricDoctorIds, defaultFloors: doctorDefaultFloors, weekdayFloors: doctorWeekdayFloors };
const labor = { ...laborRules, workdaysByMonth: { ...workdaysByMonth, "2026-10": 20 }, shifts: courseProfile.shifts };
const assistantIds = courseProfile.people.filter((person) => person.role === "assistant").map((person) => person.id);
const days = Array.from({ length: 31 }, (_, index) => `2027-01-${String(index + 1).padStart(2, "0")}`);

describe("one-click schedule for a whole month", () => {
  const doctors = planDoctorScheduleImport(
    [],
    buildMonthSessions("2027-01", weeklyTemplate2027, specialistVisits2027, closures2027, doctorIdsByName),
    1,
  );
  const demandFor = (date: string, shiftId: string, current: ScheduleEntry[]) =>
    evaluateSessionDemand(current, courseProfile.people, [date], courseProfile.shifts.filter((shift) => shift.id === shiftId), rules)[0]?.total ?? 0;
  const stats: RelaxStats = { triple: 0, consecutiveTriple: 0, eveningStreak: 0 };
  const planned = planAutoSchedule(doctors, courseProfile.people, days, courseProfile.shifts, demandFor, 1, 3, {
    preferences: schedulingPreferences,
    stats,
    canAssign: (personId, date, shiftId, current) => canAssignShift(current, personId, date, shiftId, labor),
    loadOf: (personId, current) => summarizeMonth(current, personId, "2027-01", labor).workedMinutes,
  });
  const all = [...doctors, ...planned];

  it("fills every session of January 2027", () => {
    const demands = evaluateSessionDemand(all, courseProfile.people, days, courseProfile.shifts, rules);
    expect(demands.length).toBeGreaterThan(50);
    expect(demands.filter((demand) => demand.scheduled < demand.total)).toEqual([]);
  });

  it("keeps everyone within the monthly hours and rest rules", () => {
    expect(evaluateLaborIssues(all, assistantIds, ["2027-01"], labor)).toEqual([]);
  });

  it("spreads the monthly hours evenly", () => {
    const hours = assistantIds.map((id) => summarizeMonth(all, id, "2027-01", labor).workedMinutes / 60);
    expect(Math.max(...hours) - Math.min(...hours)).toBeLessThan(12);
  });
});

describe("one-click schedule tops up to the monthly target", () => {
  const doctors = planDoctorScheduleImport(
    [],
    buildMonthSessions("2027-01", weeklyTemplate2027, specialistVisits2027, closures2027, doctorIdsByName),
    1,
  );
  const demandFor = (date: string, shiftId: string, current: ScheduleEntry[]) =>
    evaluateSessionDemand(current, courseProfile.people, [date], courseProfile.shifts.filter((shift) => shift.id === shiftId), rules)[0]?.total ?? 0;
  // 第一位助理排休兩天特休（1/6、1/7）。
  const onLeave = assistantIds[0];
  const leaves: ScheduleEntry[] = ["2027-01-06", "2027-01-07"].map((date) => ({
    id: `${date}_${onLeave}`, date, personId: onLeave, state: "leave", note: "預假｜特休", updatedAt: 1,
  }));
  const start = [...doctors, ...leaves];
  const paidOf = (personId: string, month: string, current: ScheduleEntry[]) => summarizeMonth(current, personId, month, labor).paidMinutes;
  const first = planAutoSchedule(start, courseProfile.people, days, courseProfile.shifts, demandFor, 1, 3, {
    preferences: schedulingPreferences,
    canAssign: (personId, date, shiftId, current) => canAssignShift(current, personId, date, shiftId, labor),
    loadOf: (personId, current) => paidOf(personId, "2027-01", current),
  });
  const topUpStats: RelaxStats = { triple: 0, consecutiveTriple: 0, eveningStreak: 0 };
  const flex = planHourTopUp([...start, ...first], courseProfile.people, days, courseProfile.shifts, {
    targetOf: (_personId, month) => targetRange(month, labor),
    paidOf,
    canAssign: (personId, date, shiftId, current, limit) => canAssignShift(current, personId, date, shiftId, labor, limit),
    preferences: schedulingPreferences,
    note: FLEX_SHIFT_NOTE,
    stats: topUpStats,
  }, 1);
  const all = [...start, ...first, ...flex];

  it("brings everyone into 150–152 hours, counting leave hours", () => {
    const hours = assistantIds.map((id) => paidOf(id, "2027-01", all) / 60);
    expect(Math.max(...hours) - Math.min(...hours)).toBeLessThanOrEqual(2);
    hours.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(150);
      expect(value).toBeLessThanOrEqual(152);
    });
    expect(summarizeMonth(all, onLeave, "2027-01", labor).leaveMinutes).toBe(16 * 60);
  });

  it("marks the extra shifts and keeps the labor rules", () => {
    expect(flex.length).toBeGreaterThan(0);
    expect(flex.every((entry) => entry.note === FLEX_SHIFT_NOTE)).toBe(true);
    // 不排連續兩天三診；機動只排在有醫師看診的診。
    expect(topUpStats.consecutiveTriple).toBe(0);
    const doctorSessions = new Set(doctors.map((entry) => `${entry.date}_${entry.shiftId}`));
    expect(flex.every((entry) => doctorSessions.has(`${entry.date}_${entry.shiftId}`))).toBe(true);
    expect(evaluateLaborIssues(all, assistantIds, ["2027-01"], labor)).toEqual([]);
    expect(flex.some((entry) => leaves.some((leave) => leave.date === entry.date && leave.personId === entry.personId))).toBe(false);
  });
});
