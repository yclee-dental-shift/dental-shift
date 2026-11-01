import { describe, expect, it } from "vitest";
import { schedulingPreferences } from "@/config/scheduling-preferences";
import { addDays } from "@/domain/dates";
import { balanceSplitShifts, countShiftPatterns, isSplitDay, planAutoSchedule, planHourTopUp, splitDaysOf, type RelaxStats } from "@/domain/rules/auto-schedule";
import type { CoursePerson, ScheduleEntry, ShiftDefinition } from "@/domain/types";

const shifts: ShiftDefinition[] = [
  { id: "morning", label: "早診", start: "08:25", end: "12:05" },
  { id: "afternoon", label: "午診", start: "13:35", end: "16:45" },
  { id: "evening", label: "晚診", start: "17:35", end: "20:45" },
];
const doctor: CoursePerson = { id: "doctor-x", displayName: "醫師 X", role: "doctor" };
const assistantsOf = (count: number): CoursePerson[] =>
  Array.from({ length: count }, (_, index) => ({ id: `assistant-${index}`, displayName: `助理 ${index}`, role: "assistant" }));
const days = Array.from({ length: 14 }, (_, index) => `2026-10-${String(index + 5).padStart(2, "0")}`);
const doctorEntries: ScheduleEntry[] = days.flatMap((date) =>
  shifts.map((shift) => ({
    id: `${date}_${doctor.id}_${shift.id}`, date, personId: doctor.id, state: "shift" as const, shiftId: shift.id, updatedAt: 1,
  })),
);

function plan(assistants: CoursePerson[], demand: number) {
  const stats: RelaxStats = { triple: 0, consecutiveTriple: 0, eveningStreak: 0 };
  const planned = planAutoSchedule(doctorEntries, [doctor, ...assistants], days, shifts, demand, 1, 3, {
    preferences: schedulingPreferences,
    stats,
  });
  return { planned, stats, all: [...doctorEntries, ...planned] };
}

function longestEveningStreak(entries: ScheduleEntry[], personId: string): number {
  let longest = 0;
  let current = 0;
  for (const date of days) {
    const evening = entries.some((entry) => entry.personId === personId && entry.date === date && entry.shiftId === "evening");
    current = evening ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

describe("scheduling preferences", () => {
  it("avoids triple shifts and long evening streaks when there are enough people", () => {
    const assistants = assistantsOf(6);
    const { all, stats } = plan(assistants, 2);
    expect(stats).toEqual({ triple: 0, consecutiveTriple: 0, eveningStreak: 0 });
    for (const assistant of assistants) {
      expect(countShiftPatterns(all, assistant.id, "2026-10", "evening").tripleDays).toBe(0);
      expect(longestEveningStreak(all, assistant.id)).toBeLessThanOrEqual(2);
    }
  });

  it("relaxes only when short-staffed and spreads triple shifts evenly", () => {
    // 4 位助理、每診 3 位：不排斷開班時，有早診的 3 人＋有晚診的 3 人只能由 4 人分擔，
    // 每天至少 2 人要三診（最少可能值）
    const assistants = assistantsOf(4);
    const { all, stats, planned } = plan(assistants, 3);
    expect(planned.filter((entry) => entry.personId.startsWith("assistant"))).toHaveLength(14 * 9);
    expect(stats.triple).toBe(14 * 2);
    const triples = assistants.map((assistant) => countShiftPatterns(all, assistant.id, "2026-10", "evening").tripleDays);
    expect(Math.max(...triples) - Math.min(...triples)).toBeLessThanOrEqual(1);
    expect(stats.consecutiveTriple).toBe(0);
  });

  it("spreads evening shifts evenly", () => {
    const assistants = assistantsOf(6);
    const { all } = plan(assistants, 2);
    const evenings = assistants.map((assistant) => countShiftPatterns(all, assistant.id, "2026-10", "evening").evenings);
    expect(Math.max(...evenings) - Math.min(...evenings)).toBeLessThanOrEqual(1);
  });
});

describe("split shifts (morning + evening, no afternoon)", () => {
  const order = shifts.map((shift) => shift.id);
  // 2026-10-05 是週一；醫師只看早診和晚診，3 位助理每天要排早 2、晚 2 → 每天至少一人兩頭班。
  const week = days.slice(0, 5);
  const splitDoctorEntries = doctorEntries.filter((entry) => entry.shiftId !== "afternoon" && week.includes(entry.date));
  const prefs = { ...schedulingPreferences, maxConsecutiveEvenings: 7, shiftOrder: order };

  it("recognises a split day", () => {
    expect(isSplitDay([0, 2])).toBe(true);
    expect(isSplitDay([0, 1])).toBe(false);
    expect(isSplitDay([0, 1, 2])).toBe(false);
    expect(isSplitDay([2])).toBe(false);
  });

  it("allows split shifts when needed but spreads them evenly, never on back-to-back days for one person", () => {
    const stats: RelaxStats = { triple: 0, consecutiveTriple: 0, eveningStreak: 0, splitWeek: 0 };
    const assistants = assistantsOf(3);
    const planned = planAutoSchedule(splitDoctorEntries, [doctor, ...assistants], week, shifts, 2, 1, 3, { preferences: prefs, stats });
    const all = [...splitDoctorEntries, ...planned];
    const perPerson = assistants.map((person) => splitDaysOf(all, person.id, order));
    const counts = perPerson.map((list) => list.length);
    // 5 天、每天 1 人兩頭班：3 人分成 2、2、1，而且每人的兩頭班不在連續兩天。
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(5);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    perPerson.forEach((list) => list.forEach((date, index) => index > 0 && expect(addDays(list[index - 1], 1)).not.toBe(date)));
    // 每週上限 1 天：超過的 2 天記在放寬次數。
    expect(stats.splitWeek).toBe(2);
  });

  it("swaps afternoon and evening after planning so split shifts are not piled on one person", () => {
    // 10 個工作天、早 2 午 1 晚 2、3 位助理：每天一定有人兩頭班，挑人時容易集中在某幾個人。
    const twoWeeks = days.filter((date) => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()));
    const doctorAll = doctorEntries.filter((entry) => twoWeeks.includes(entry.date));
    const assistants = assistantsOf(3);
    const demand = (_date: string, shiftId: string) => ({ morning: 2, afternoon: 1, evening: 2 })[shiftId] ?? 0;
    const noCap = { ...prefs, maxSplitDaysPerWeek: undefined };
    const planned = planAutoSchedule(doctorAll, [doctor, ...assistants], twoWeeks, shifts, demand, 1, 3, { preferences: noCap });
    const fixed = balanceSplitShifts(doctorAll, planned, shifts, {
      assistantIds: new Set(assistants.map((person) => person.id)),
      eveningShiftId: "evening",
      maxConsecutiveEvenings: 7,
    });
    const counts = assistants.map((person) => splitDaysOf([...doctorAll, ...fixed], person.id, order).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    // 每診人數、每人的診數都不變。
    const perShift = (list: ScheduleEntry[]) => order.map((id) => list.filter((entry) => entry.shiftId === id).length);
    expect(perShift(fixed)).toEqual(perShift(planned));
    assistants.forEach((person) =>
      expect(fixed.filter((entry) => entry.personId === person.id)).toHaveLength(planned.filter((entry) => entry.personId === person.id).length),
    );
  });

  it("tops up hours with a contiguous shift first and only uses a split shift when nothing else fits", () => {
    const date = week[0];
    const doctorDay = (shiftIds: string[]): ScheduleEntry[] =>
      shiftIds.map((shiftId) => ({ id: `${date}_${doctor.id}_${shiftId}`, date, personId: doctor.id, state: "shift", shiftId, updatedAt: 1 }));
    const morning: ScheduleEntry = { id: `${date}_assistant-0_morning`, date, personId: "assistant-0", state: "shift", shiftId: "morning", updatedAt: 1 };
    const topUp = (doctorShifts: string[]) =>
      planHourTopUp([...doctorDay(doctorShifts), morning], [doctor, ...assistantsOf(1)], [date], shifts, {
        // 早診 3:40 之外再補 1 診就到目標。
        targetOf: () => ({ minMinutes: 400, maxMinutes: 440 }),
        paidOf: (personId, _month, current) =>
          current.filter((entry) => entry.personId === personId && entry.state === "shift").length * 220,
        canAssign: () => true,
        preferences: prefs,
        note: "機動",
      });
    expect(topUp(["morning", "afternoon", "evening"]).map((entry) => entry.shiftId)).toEqual(["afternoon"]);
    expect(topUp(["morning", "evening"]).map((entry) => entry.shiftId)).toEqual(["evening"]);
  });
});
