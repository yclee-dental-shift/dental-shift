import { describe, expect, it } from "vitest";
import { leaveTypes, leaveWindow } from "@/config/leave.config";
import {
  isPreLeave,
  monthSchedule,
  PRE_LEAVE_PREFIX,
  preLeaveEditable,
  preLeaveType,
  shortLongLeaveRequests,
} from "@/domain/rules/leave-window";
import { planAutoSchedule } from "@/domain/rules/auto-schedule";
import { clearCell, setLeave, toggleShift } from "@/domain/schedule";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";

const phaseOn = (today: string) => monthSchedule("2027-01", today, leaveWindow).phase;

describe("pre-leave window for January 2027", () => {
  it("is closed when closed early, keeping the original deadline", () => {
    const settings = { ...leaveWindow, closedEarly: { "2027-01": "2026-10-18T09:00" } };
    expect(monthSchedule("2027-01", "2026-10-18", settings)).toMatchObject({
      phase: "closed",
      deadline: "2026-10-23",
      closedEarlyAt: "2026-10-18T09:00",
    });
    expect(monthSchedule("2027-02", "2026-11-18", settings).closedEarlyAt).toBeUndefined();
  });

  it("computes the key dates", () => {
    expect(monthSchedule("2027-01", "2026-10-22", leaveWindow)).toMatchObject({
      longLeaveOpen: "2026-09-01",
      generalOpen: "2026-10-16",
      deadline: "2026-10-23",
    });
  });

  it("moves through each phase on the right day", () => {
    expect(phaseOn("2026-08-31")).toBe("notOpen");
    expect(phaseOn("2026-09-01")).toBe("longLeaveOnly");
    expect(phaseOn("2026-10-15")).toBe("longLeaveOnly");
    expect(phaseOn("2026-10-16")).toBe("open");
    expect(phaseOn("2026-10-22")).toBe("open");
    expect(phaseOn("2026-10-23")).toBe("closed");
    expect(phaseOn("2027-03-01")).toBe("closed");
  });

  it("allows pre-leave edits only before the deadline", () => {
    expect(preLeaveEditable("notOpen")).toBe(false);
    expect(preLeaveEditable("longLeaveOnly")).toBe(true);
    expect(preLeaveEditable("open")).toBe(true);
    expect(preLeaveEditable("closed")).toBe(false);
  });

  it("handles the year boundary for later months", () => {
    expect(monthSchedule("2027-03", "2026-12-18", leaveWindow)).toMatchObject({
      longLeaveOpen: "2026-11-01",
      generalOpen: "2026-12-16",
      deadline: "2026-12-23",
      phase: "open",
    });
  });

  it("follows a month's adjusted dates", () => {
    const settings = { ...leaveWindow, overrides: { "2027-01": { generalOpen: "2026-11-02", generalLast: "2026-11-08" } } };
    expect(monthSchedule("2027-01", "2026-11-05", settings).phase).toBe("open");
    expect(monthSchedule("2027-01", "2026-11-09", settings).phase).toBe("closed");
    expect(monthSchedule("2027-02", "2026-11-05", settings).generalOpen).toBe("2026-11-15");
  });
});

describe("pre-leave entries", () => {
  const person = "1001";
  const note = `${PRE_LEAVE_PREFIX}特休`;

  it("stores the leave type in the note and nothing else", () => {
    const [entry] = setLeave([], "2027-01-05", person, 1, note);
    expect(entry).toEqual({ id: `2027-01-05_${person}`, date: "2027-01-05", personId: person, state: "leave", updatedAt: 1, note });
    expect(isPreLeave(entry)).toBe(true);
    expect(preLeaveType(entry)).toBe("特休");
    expect(leaveTypes).toHaveLength(8);
  });

  it("keeps ordinary leave separate from pre-leave", () => {
    const [entry] = setLeave([], "2027-01-05", person, 1);
    expect(isPreLeave(entry)).toBe(false);
  });

  it("warns when a long-leave registration has only one day", () => {
    const one = setLeave([], "2027-01-05", person, 1, note);
    expect(shortLongLeaveRequests(one, "2027-01", 2)).toEqual([person]);
    const two = setLeave(one, "2027-01-06", person, 2, note);
    expect(shortLongLeaveRequests(two, "2027-01", 2)).toEqual([]);
  });

  it("is respected by the auto schedule", () => {
    const doctor: CoursePerson = { id: "doctor-x", displayName: "X", role: "doctor" };
    const assistant: CoursePerson = { id: person, displayName: "小安", role: "assistant" };
    let entries: ScheduleEntry[] = toggleShift([], "2027-01-05", doctor.id, "morning", 1);
    entries = setLeave(entries, "2027-01-05", person, 1, note);
    const shifts = [{ id: "morning", label: "早診", start: "08:25", end: "12:05" }];
    expect(planAutoSchedule(entries, [doctor, assistant], ["2027-01-05"], shifts, 2, 1)).toEqual([]);
    expect(clearCell(entries, "2027-01-05", person).some((entry) => entry.personId === person)).toBe(false);
  });
});

import { preLeaveDayStatus } from "@/domain/rules/leave-window";

describe("assistant pre-leave day status", () => {
  const person = "1001";
  const closed = new Set(["2027-01-01"]);

  it("allows a normal weekday during the open window", () => {
    expect(preLeaveDayStatus([], person, "2027-01-05", "2026-10-22", leaveWindow, closed)).toMatchObject({ editable: true });
  });

  it("blocks days outside the window, Sundays and closures", () => {
    expect(preLeaveDayStatus([], person, "2027-01-05", "2026-11-02", leaveWindow, closed).reason).toBe("不在排休申請期間");
    expect(preLeaveDayStatus([], person, "2027-01-03", "2026-10-22", leaveWindow, closed).reason).toBe("休診日不需排休");
    expect(preLeaveDayStatus([], person, "2027-01-01", "2026-10-22", leaveWindow, closed).editable).toBe(false);
  });

  it("reports an existing pre-leave and leaves admin leave alone", () => {
    const pre = setLeave([], "2027-01-05", person, 1, `${PRE_LEAVE_PREFIX}事假`);
    expect(preLeaveDayStatus(pre, person, "2027-01-05", "2026-10-22", leaveWindow, closed)).toMatchObject({ type: "事假", editable: true });
    const adminLeave = setLeave([], "2027-01-06", person, 1);
    expect(preLeaveDayStatus(adminLeave, person, "2027-01-06", "2026-10-22", leaveWindow, closed).reason).toBe("已由管理者排休");
  });

  it("warns when the day already has shifts", () => {
    const shifted = toggleShift([], "2027-01-07", person, "morning", 1);
    expect(preLeaveDayStatus(shifted, person, "2027-01-07", "2026-10-22", leaveWindow, closed)).toMatchObject({ hasShifts: true, editable: true });
  });
});
