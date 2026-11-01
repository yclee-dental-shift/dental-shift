import { describe, expect, it } from "vitest";
import { laborRules, workdaysByMonth } from "@/config/labor.config";
import { personScheduleStats, statsAverage, statsFlags } from "@/domain/rules/schedule-stats";
import { setShiftRequest } from "@/domain/rules/shift-request";
import type { ScheduleEntry, ShiftDefinition } from "@/domain/types";

const shifts: ShiftDefinition[] = [
  { id: "morning", label: "早診", start: "08:25", end: "12:05" },
  { id: "afternoon", label: "午診", start: "13:35", end: "16:45" },
  { id: "evening", label: "晚診", start: "17:35", end: "20:45" },
];
const settings = { ...laborRules, workdaysByMonth, shifts };
const options = { flexNote: "機動", eveningShiftId: "evening" };
let id = 0;
const shift = (date: string, personId: string, shiftId: string, note?: string): ScheduleEntry => ({
  id: `${(id += 1)}`,
  date,
  personId,
  state: "shift",
  shiftId,
  updatedAt: 1,
  ...(note ? { note } : {}),
});

describe("schedule stats", () => {
  const entries: ScheduleEntry[] = [
    // 1/4～1/6 連續三天晚診，1/4 三診。
    shift("2027-01-04", "a1", "morning"),
    shift("2027-01-04", "a1", "afternoon"),
    shift("2027-01-04", "a1", "evening"),
    shift("2027-01-05", "a1", "evening"),
    shift("2027-01-06", "a1", "evening"),
    shift("2027-01-07", "a1", "morning", "機動"),
    // 週六：1/23 本月，2026 年 12 月不算進 2027 年。
    shift("2027-01-23", "a1", "morning"),
    { id: "leave", date: "2027-01-08", personId: "a1", state: "leave", note: "預假｜特休", updatedAt: 1 },
    shift("2027-01-04", "a2", "morning"),
  ];

  it("counts sessions, flex, leave, triple days, evening streak and Saturdays", () => {
    const requests = setShiftRequest({}, "2027-01-11", "a1", "evening", "x", "事假");
    const stats = personScheduleStats(entries, "a1", "2027-01", settings, { ...options, requests });
    expect(stats.sessions.morning).toEqual({ count: 2, minutes: 440 });
    expect(stats.sessions.evening).toEqual({ count: 3, minutes: 570 });
    expect(stats.flex).toEqual({ count: 1, minutes: 220 });
    expect(stats.annualLeave).toEqual({ count: 1, minutes: 480 });
    expect(stats.otherLeave).toEqual({ count: 1, minutes: 190 });
    expect(stats.tripleDays).toBe(1);
    expect(stats.evenings).toBe(3);
    expect(stats.maxEveningStreak).toBe(3);
    expect(stats.saturdays).toBe(1);
    expect(stats.totalMinutes).toBe(440 + 190 + 570 + 220 + 480 + 190);
  });

  it("adds Saturdays from January of the same year", () => {
    const feb = [...entries, shift("2027-02-20", "a1", "morning")];
    expect(personScheduleStats(feb, "a1", "2027-02", settings, options)).toMatchObject({ saturdays: 1, saturdaysYear: 2 });
  });

  it("flags values far above average and rule breaks", () => {
    // 2 月：a1 今年第 2 次週六，a2 一次都沒有。
    const feb = [...entries, shift("2027-02-20", "a1", "morning"), shift("2027-02-22", "a1", "evening"), shift("2027-02-23", "a1", "evening"), shift("2027-02-24", "a1", "evening"), shift("2027-02-22", "a2", "morning")];
    const rows = ["a1", "a2", "a3"].map((personId) => personScheduleStats(feb, personId, "2027-02", settings, options));
    const average = statsAverage(rows, shifts.map((item) => item.id));
    // a3 沒有排班，不算進平均。
    expect(average.count).toBe(2);
    const flags = statsFlags(rows[0], average, { maxConsecutiveEvenings: 2 });
    expect(flags.get("maxEveningStreak")).toBe("alert");
    expect(flags.get("saturdaysYear")).toBe("warn");
    expect(statsFlags(rows[2], average, { maxConsecutiveEvenings: 2 }).size).toBe(0);
  });
});
