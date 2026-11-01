import { describe, expect, it } from "vitest";
import { courseProfile } from "@/config/clinic.config";
import { FLEX_SHIFT_NOTE, laborRules, workdaysByMonth } from "@/config/labor.config";
import { scheduleResultOf } from "@/domain/rules/schedule-result";
import type { ScheduleEntry } from "@/domain/types";

const settings = { ...laborRules, workdaysByMonth: { ...workdaysByMonth, "2026-10": 20 }, shifts: courseProfile.shifts };
const person = "1001";
const shift = (date: string, shiftId: string, note?: string): ScheduleEntry => ({
  id: `${date}_${person}_${shiftId}`, date, personId: person, state: "shift", shiftId, note, updatedAt: 1,
});
const leave = (date: string, note?: string): ScheduleEntry => ({ id: `${date}_${person}`, date, personId: person, state: "leave", note, updatedAt: 1 });

describe("schedule result", () => {
  const entries: ScheduleEntry[] = [
    shift("2026-10-01", "morning"),
    shift("2026-10-01", "afternoon", FLEX_SHIFT_NOTE),
    leave("2026-10-02", "預假｜特休"), // 已排入
    leave("2026-10-03"), // 改成休息日
    shift("2026-10-04", "morning"), // 申請沒排入
    shift("2026-10-05", "evening"), // 希望不排卻排了
  ];
  const applications = {
    "2026-10-02_x": { date: "2026-10-02", personId: person, leaveType: "特休", at: "" },
    "2026-10-03_x": { date: "2026-10-03", personId: person, leaveType: "事假", at: "", restInstead: true },
    "2026-10-04_x": { date: "2026-10-04", personId: person, leaveType: "特休", at: "" },
  };
  const requests = {
    a: { date: "2026-10-05", personId: person, shiftId: "evening", at: "" },
    b: { date: "2026-10-06", personId: person, shiftId: "morning", at: "", leaveType: "病假" },
    c: { date: "2026-10-07", personId: person, shiftId: "afternoon", at: "", leaveType: "事假", restInstead: true },
  };
  const result = scheduleResultOf({ entries, applications, requests, personId: person, month: "2026-10", settings, flexNote: FLEX_SHIFT_NOTE });

  it("marks each whole-day application", () => {
    expect(result.wholeDay.map((item) => item.status)).toEqual(["placed", "rest", "unplaced"]);
  });

  it("marks each session request", () => {
    expect(result.sessions.map((item) => item.status)).toEqual(["scheduled", "placed", "rest"]);
  });

  it("splits hours into follow, flex and leave", () => {
    expect(result.followMinutes).toBe(220 + 220 + 190);
    expect(result.flexMinutes).toBe(190);
    // 特休 1 天 8 小時＋病假早診 220 分鐘（改成休息的不算）。
    expect(result.leaveMinutes).toBe(480 + 220);
    expect(result.paidMinutes).toBe(result.followMinutes + result.flexMinutes + result.leaveMinutes);
    expect(result.normalMinutes).toBe(160 * 60);
    expect(result.belowNormalMinutes).toBe(160 * 60 - result.paidMinutes);
  });

  it("counts leave saved by switching to rest days", () => {
    expect(result.restDays).toBe(1);
    expect(result.restMinutes).toBe(480 + 190);
  });
});
