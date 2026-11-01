import { describe, expect, it } from "vitest";
import { leaveWindow } from "@/config/leave.config";
import { planAutoSchedule, type RelaxStats } from "@/domain/rules/auto-schedule";
import {
  brokenShiftRequests,
  hasShiftRequest,
  isSessionLeave,
  sessionLeaveMinutes,
  setRestInstead,
  setShiftRequest,
  requestedShiftsOn,
  shiftRequestDayStatus,
  toggleShiftRequest,
  type ShiftRequests,
} from "@/domain/rules/shift-request";
import type { CoursePerson, ScheduleEntry, ShiftDefinition } from "@/domain/types";

const shifts: ShiftDefinition[] = [
  { id: "morning", label: "早診", start: "08:30", end: "12:10" },
  { id: "afternoon", label: "午診", start: "14:00", end: "17:10" },
  { id: "evening", label: "晚診", start: "18:00", end: "21:10" },
];
const people: CoursePerson[] = [
  { id: "doc", displayName: "醫師", role: "doctor" },
  { id: "a1", displayName: "助理一", role: "assistant" },
  { id: "a2", displayName: "助理二", role: "assistant" },
];
const date = "2027-01-04";
const doctor: ScheduleEntry = { id: `${date}_doc_evening`, date, personId: "doc", state: "shift", shiftId: "evening", updatedAt: 1 };

describe("shift requests", () => {
  it("toggles a request on and off", () => {
    const on = toggleShiftRequest({}, date, "a1", "evening", "2026-10-22T10:00");
    expect(hasShiftRequest(on, date, "a1", "evening")).toBe(true);
    expect(requestedShiftsOn(on, date, "a1")).toEqual(["evening"]);
    expect(toggleShiftRequest(on, date, "a1", "evening", "x")).toEqual({});
  });

  it("follows the general pre-leave window", () => {
    const closed = new Set<string>();
    expect(shiftRequestDayStatus([], "a1", date, "2026-10-22", leaveWindow, closed).editable).toBe(true);
    // 長假登記期間（一般排休尚未開放）不能登記。
    expect(shiftRequestDayStatus([], "a1", "2027-02-01", "2026-10-22", leaveWindow, closed).editable).toBe(false);
    // 截止後不能登記。
    expect(shiftRequestDayStatus([], "a1", date, "2026-11-01", leaveWindow, closed).editable).toBe(false);
    expect(shiftRequestDayStatus([], "a1", "2027-01-03", "2026-10-22", leaveWindow, closed).reason).toBe("休診日不需登記");
  });

  it("is not needed on a whole-day pre-leave", () => {
    const leave: ScheduleEntry = { id: `${date}_a1`, date, personId: "a1", state: "leave", note: "預假｜特休", updatedAt: 1 };
    expect(shiftRequestDayStatus([leave], "a1", date, "2026-10-22", leaveWindow, new Set()).reason).toBe("這天已整天排休");
  });
});

describe("auto schedule with shift requests", () => {
  const requests: ShiftRequests = toggleShiftRequest({}, date, "a1", "evening", "x");
  const plan = (need: number) => {
    const stats: RelaxStats = { triple: 0, consecutiveTriple: 0, eveningStreak: 0, requested: 0 };
    const planned = planAutoSchedule([doctor], people, [date], shifts, need, 1, 3, {
      stats,
      requestedOff: (personId, day, shiftId) => hasShiftRequest(requests, day, personId, shiftId),
    });
    return { planned, stats };
  };

  it("avoids the requested shift when someone else can work", () => {
    const { planned, stats } = plan(1);
    expect(planned.map((entry) => entry.personId)).toEqual(["a2"]);
    expect(stats.requested).toBe(0);
  });

  it("still schedules the requested shift when short of staff, and counts it", () => {
    const { planned, stats } = plan(2);
    expect(planned.map((entry) => entry.personId).sort()).toEqual(["a1", "a2"]);
    expect(stats.requested).toBe(1);
    expect(brokenShiftRequests(requests, [doctor, ...planned])).toHaveLength(1);
  });
});

describe("session leave (用假)", () => {
  const minutes = new Map([["morning", 220], ["afternoon", 190], ["evening", 190]]);
  const leave = setShiftRequest({}, date, "a1", "evening", "x", "特休");

  it("counts the session hours unless converted to rest or scheduled", () => {
    expect(isSessionLeave(leave, date, "a1", "evening")).toBe(true);
    expect(sessionLeaveMinutes(leave, [], "a1", "2027-01", minutes)).toBe(190);
    const rest = setRestInstead(leave, leave[`${date}_a1_evening`], true);
    expect(sessionLeaveMinutes(rest, [], "a1", "2027-01", minutes)).toBe(0);
    const worked: ScheduleEntry = { id: `${date}_a1_evening`, date, personId: "a1", state: "shift", shiftId: "evening", updatedAt: 1 };
    expect(sessionLeaveMinutes(leave, [worked], "a1", "2027-01", minutes)).toBe(0);
    // 不用假的登記不算時數。
    expect(sessionLeaveMinutes(setShiftRequest({}, date, "a1", "evening", "x"), [], "a1", "2027-01", minutes)).toBe(0);
  });

  it("is never scheduled by auto schedule, even when short of staff", () => {
    const planned = planAutoSchedule([doctor], people, [date], shifts, 2, 1, 3, {
      requestedOff: (personId, day, shiftId) => hasShiftRequest(leave, day, personId, shiftId),
      leaveOff: (personId, day, shiftId) => isSessionLeave(leave, day, personId, shiftId),
    });
    expect(planned.map((entry) => entry.personId)).toEqual(["a2"]);
  });
});
