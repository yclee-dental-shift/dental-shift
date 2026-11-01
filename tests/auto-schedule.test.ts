import { describe, expect, it } from "vitest";
import { evaluateAssistantCoverage } from "@/domain/rules/assistant-coverage";
import { breakEveningStreaks, eveningStreakExcess, planAutoSchedule } from "@/domain/rules/auto-schedule";
import type { CoursePerson, ScheduleEntry, ShiftDefinition } from "@/domain/types";

const weekdays = [1, 2, 3, 4, 5];
const shifts: ShiftDefinition[] = [
  { id: "morning", label: "早診", start: "09:00", end: "12:00" },
  { id: "afternoon", label: "午診", start: "14:00", end: "17:00" },
  { id: "evening", label: "晚診", start: "18:00", end: "21:00" },
];
const people: CoursePerson[] = [
  { id: "doctor-a", displayName: "醫師 A（虛構）", role: "doctor", availability: weekdays.map((weekday) => ({ weekday, shiftId: "morning" })) },
  { id: "doctor-b", displayName: "醫師 B（虛構）", role: "doctor", availability: weekdays.map((weekday) => ({ weekday, shiftId: "afternoon" })) },
  { id: "doctor-c", displayName: "醫師 C（虛構）", role: "doctor", availability: weekdays.map((weekday) => ({ weekday, shiftId: "evening" })) },
  ...["1", "2", "3", "4", "5", "6"].map((key): CoursePerson => ({
    id: `assistant-${key}`,
    displayName: `助理 ${key}（虛構）`,
    role: "assistant",
  })),
];
// 2026-07-20 是週一。
const week = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"];

describe("auto schedule demo draft", () => {
  it("gives each doctor their fixed shift on weekdays and nothing on weekends", () => {
    const planned = planAutoSchedule([], people, week, shifts, 2, 1);
    const doctorEntries = planned.filter((entry) => entry.personId.startsWith("doctor"));
    expect(doctorEntries).toHaveLength(15);
    expect(doctorEntries.filter((entry) => entry.personId === "doctor-a").every((entry) => entry.shiftId === "morning")).toBe(true);
    expect(planned.some((entry) => entry.date === "2026-07-25" || entry.date === "2026-07-26")).toBe(false);
  });

  it("covers every weekday shift with two assistants", () => {
    const planned = planAutoSchedule([], people, week, shifts, 2, 1);
    const assistantEntries = planned.filter((entry) => entry.personId.startsWith("assistant"));
    expect(assistantEntries.every((entry) => entry.id === `${entry.date}_${entry.personId}_${entry.shiftId}`)).toBe(true);
    const issues = evaluateAssistantCoverage(planned, people, week.slice(0, 5), shifts, 2);
    expect(issues).toEqual([]);
  });

  it("rotates assistants across shifts on different days", () => {
    const planned = planAutoSchedule([], people, week, shifts, 2, 1);
    const shiftsOfFirst = new Set(
      planned.filter((entry) => entry.personId === "assistant-1").map((entry) => entry.shiftId),
    );
    expect(shiftsOfFirst.size).toBe(3);
  });

  it("never overwrites existing entries and never duplicates a shift", () => {
    const existing: ScheduleEntry[] = [
      { id: "2026-07-20_doctor-a", date: "2026-07-20", personId: "doctor-a", state: "leave", updatedAt: 1 },
      { id: "2026-07-20_assistant-1", date: "2026-07-20", personId: "assistant-1", state: "leave", updatedAt: 1 },
      { id: "2026-07-21_assistant-2", date: "2026-07-21", personId: "assistant-2", state: "shift", shiftId: "evening", updatedAt: 1 },
    ];
    const planned = planAutoSchedule(existing, people, week, shifts, 2, 1);
    const existingIds = new Set(existing.map((entry) => entry.id));
    expect(planned.some((entry) => existingIds.has(entry.id))).toBe(false);
    expect(new Set(planned.map((entry) => entry.id)).size).toBe(planned.length);
    expect(planned.every((entry) => entry.state === "shift" && typeof entry.shiftId === "string")).toBe(true);
  });

  it("skips an assistant on leave and lets others cover the gap", () => {
    const existing: ScheduleEntry[] = [
      { id: "2026-07-21_assistant-1", date: "2026-07-21", personId: "assistant-1", state: "leave", updatedAt: 1 },
    ];
    const planned = planAutoSchedule(existing, people, ["2026-07-21"], shifts, 2, 1);
    expect(planned.some((entry) => entry.personId === "assistant-1")).toBe(false);
    expect(evaluateAssistantCoverage([...existing, ...planned], people, ["2026-07-21"], shifts, 2)).toEqual([]);
  });

  it("returns nothing when the week is already filled", () => {
    const first = planAutoSchedule([], people, week, shifts, 2, 1);
    expect(planAutoSchedule(first, people, week, shifts, 2, 2)).toEqual([]);
  });

  it("schedules doctors with several fixed shifts on the same day", () => {
    const multi: CoursePerson[] = [
      { id: "doctor-m", displayName: "醫師 M（虛構）", role: "doctor", availability: [
        { weekday: 1, shiftId: "morning" },
        { weekday: 1, shiftId: "afternoon" },
        { weekday: 1, shiftId: "evening" },
      ] },
      ...people.filter((person) => person.role === "assistant"),
    ];
    const planned = planAutoSchedule([], multi, ["2026-07-20"], shifts, 2, 1);
    const doctorShifts = planned.filter((entry) => entry.personId === "doctor-m");
    expect(doctorShifts.map((entry) => entry.shiftId).sort()).toEqual(["afternoon", "evening", "morning"]);
    expect(evaluateAssistantCoverage(planned, multi, ["2026-07-20"], shifts, 2)).toEqual([]);
  });

  it("skips a doctor's whole day when they are on leave and keeps their existing shifts", () => {
    const multi: CoursePerson[] = [
      { id: "doctor-m", displayName: "醫師 M（虛構）", role: "doctor", availability: [
        { weekday: 1, shiftId: "morning" },
        { weekday: 1, shiftId: "evening" },
        { weekday: 2, shiftId: "morning" },
        { weekday: 2, shiftId: "evening" },
      ] },
    ];
    const existing: ScheduleEntry[] = [
      { id: "2026-07-20_doctor-m", date: "2026-07-20", personId: "doctor-m", state: "leave", updatedAt: 1 },
      { id: "2026-07-21_doctor-m_morning", date: "2026-07-21", personId: "doctor-m", state: "shift", shiftId: "morning", updatedAt: 1 },
    ];
    const planned = planAutoSchedule(existing, multi, ["2026-07-20", "2026-07-21"], shifts, 2, 1);
    expect(planned.map((entry) => entry.id)).toEqual(["2026-07-21_doctor-m_evening"]);
  });

  it("rotates which assistants work when there are more assistants than slots", () => {
    const many: CoursePerson[] = [
      ...people.filter((person) => person.role === "doctor"),
      ...Array.from({ length: 12 }, (_, index): CoursePerson => ({
        id: `assistant-x${index}`,
        displayName: `助理 X${index}（虛構）`,
        role: "assistant",
      })),
    ];
    const planned = planAutoSchedule([], many, week, shifts, 2, 1);
    const worked = new Set(planned.filter((entry) => entry.personId.startsWith("assistant")).map((entry) => entry.personId));
    expect(worked.size).toBe(12);
  });

  const monday = "2026-07-20";
  const assistantsOn = (planned: ScheduleEntry[], shiftId: string) =>
    planned.filter((entry) => entry.personId.startsWith("assistant") && entry.shiftId === shiftId).length;

  it("fills each shift up to the demand returned for that shift", () => {
    const demand = (_date: string, shiftId: string) => ({ morning: 3, afternoon: 5, evening: 4 })[shiftId] ?? 0;
    const planned = planAutoSchedule([], people, [monday], shifts, demand, 1);
    expect([assistantsOn(planned, "morning"), assistantsOn(planned, "afternoon"), assistantsOn(planned, "evening")]).toEqual([3, 5, 4]);
  });

  it("lets assistants work several shifts but never more than three or the same shift twice", () => {
    const planned = planAutoSchedule([], people, [monday], shifts, 6, 1);
    expect([assistantsOn(planned, "morning"), assistantsOn(planned, "afternoon"), assistantsOn(planned, "evening")]).toEqual([6, 6, 6]);
    const perPerson = new Map<string, number>();
    planned.filter((entry) => entry.personId.startsWith("assistant")).forEach((entry) => {
      perPerson.set(entry.personId, (perPerson.get(entry.personId) ?? 0) + 1);
    });
    expect(Math.max(...perPerson.values())).toBe(3);
    expect(new Set(planned.map((entry) => entry.id)).size).toBe(planned.length);
  });

  it("stops at the staff limit and leaves the rest short", () => {
    const planned = planAutoSchedule([], people, [monday], shifts, 7, 1);
    // 6 位助理、每人最多 3 診 = 18 人次，需求 21
    expect(planned.filter((entry) => entry.personId.startsWith("assistant"))).toHaveLength(18);
  });

  it("prefers continuing from the previous shift and avoids split shifts", () => {
    const demand = (_date: string, shiftId: string) => ({ morning: 2, afternoon: 2, evening: 2 })[shiftId] ?? 0;
    const planned = planAutoSchedule([], people, [monday], shifts, demand, 1);
    const byPerson = new Map<string, string[]>();
    planned.filter((entry) => entry.personId.startsWith("assistant")).forEach((entry) => {
      byPerson.set(entry.personId, [...(byPerson.get(entry.personId) ?? []), entry.shiftId!]);
    });
    const patterns = [...byPerson.values()].map((list) => list.join("+"));
    expect(patterns).not.toContain("morning+evening");
    expect(patterns.filter((pattern) => pattern === "morning+afternoon")).toHaveLength(2);
  });

  it("balances the weekly load across assistants", () => {
    const planned = planAutoSchedule([], people, week, shifts, 2, 1);
    const counts = new Map<string, number>();
    planned.filter((entry) => entry.personId.startsWith("assistant")).forEach((entry) => {
      counts.set(entry.personId, (counts.get(entry.personId) ?? 0) + 1);
    });
    const values = [...counts.values()];
    expect(values).toHaveLength(6);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2);
  });
});

describe("break evening streaks", () => {
  const entry = (date: string, personId: string, shiftId: string): ScheduleEntry => ({
    id: `${date}_${personId}_${shiftId}`,
    date,
    personId,
    state: "shift",
    shiftId,
    updatedAt: 1,
  });
  // 助理 1 連續三天晚診；助理 2 這三天都上午診。
  const planned = [0, 1, 2].flatMap((day) => [entry(week[day], "assistant-1", "evening"), entry(week[day], "assistant-2", "afternoon")]);
  const options = { assistantIds: new Set(["assistant-1", "assistant-2"]), eveningShiftId: "evening", maxConsecutiveEvenings: 2 };

  it("swaps a same-length afternoon and evening on the same day so nobody works 3 evenings in a row", () => {
    expect(eveningStreakExcess(planned, "assistant-1", "evening", 2)).toBe(1);
    const fixed = breakEveningStreaks([], planned, shifts, options);
    expect(eveningStreakExcess(fixed, "assistant-1", "evening", 2)).toBe(0);
    expect(eveningStreakExcess(fixed, "assistant-2", "evening", 2)).toBe(0);
    // 每天每診的人數、每人的診數都不變。
    expect(fixed.filter((item) => item.personId === "assistant-1")).toHaveLength(3);
    expect(fixed.filter((item) => item.shiftId === "evening")).toHaveLength(3);
    expect(new Set(fixed.map((item) => item.id)).size).toBe(fixed.length);
  });

  it("does not swap into a blocked shift or touch existing entries", () => {
    const blocked = () => true;
    expect(breakEveningStreaks([], planned, shifts, { ...options, blocked })).toEqual(planned);
    // 已存在的班（不是這次排的）不交換。
    expect(breakEveningStreaks(planned, [], shifts, options)).toEqual([]);
  });
});
