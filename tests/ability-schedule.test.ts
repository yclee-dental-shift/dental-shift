import { describe, expect, it } from "vitest";
import { courseProfile, doctorDefaultFloors, doctorWeekdayFloors, pediatricDoctorIds } from "@/config/clinic.config";
import { doctorIdsByName } from "@/config/doctors";
import { closures2027, specialistVisits2027, weeklyTemplate2027 } from "@/config/doctor-schedule-2027";
import { laborRules, workdaysByMonth } from "@/config/labor.config";
import { schedulingPreferences } from "@/config/scheduling-preferences";
import type { AbilityGrid, AbilityLevel } from "@/domain/rules/ability";
import {
  abilityHooks,
  assignTasks,
  doctorTargets,
  isLearnerEntry,
  matchSession,
  placeAssignments,
  placeLearners,
  abilityIssueCounts,
  unableLevel,
  uncoveredKeys,
  uncoveredSessions,
} from "@/domain/rules/ability-schedule";
import { evaluateSessionDemand } from "@/domain/rules/assistant-demand";
import { breakEveningStreaks, planAutoSchedule } from "@/domain/rules/auto-schedule";
import { planDoctorScheduleImport } from "@/domain/rules/doctor-schedule-import";
import { buildMonthSessions } from "@/domain/rules/doctor-template";
import { canAssignShift, evaluateLaborIssues, summarizeMonth } from "@/domain/rules/labor-hours";
import { assignmentStatus, targetProgress, type TrainingPlan } from "@/domain/rules/training";
import type { ScheduleEntry } from "@/domain/types";

const shift = (personId: string, date: string, shiftId: string, task?: string): ScheduleEntry => ({
  id: `${date}_${personId}_${shiftId}`,
  date,
  personId,
  state: "shift",
  shiftId,
  ...(task ? { task } : {}),
  updatedAt: 1,
});

describe("一診的配對", () => {
  const levels: AbilityGrid = {
    a: { "doctor-0001": "solo", "doctor-0002": "solo" },
    b: { "doctor-0001": "solo", counter: "solo", float: "solo" },
    c: { float: "solo" },
  };

  it("找最多的組合：a 讓給 b 跟 0001，自己跟 0002", () => {
    const { tasks, uncovered } = matchSession(["0001", "0002"], [{ personId: "b" }, { personId: "a" }], levels);
    expect(uncovered).toEqual([]);
    expect(tasks.get("a")).toBe("doctor-0002");
    expect(tasks.get("b")).toBe("doctor-0001");
  });

  it("沒有可獨立的人＝列出來；多出來的人照能力記櫃台、流動", () => {
    const { tasks, uncovered } = matchSession(["0003"], [{ personId: "b" }, { personId: "c" }], levels);
    expect(uncovered).toEqual(["0003"]);
    expect(tasks.get("b")).toBe("counter");
    expect(tasks.get("c")).toBe("float-1");
  });

  it("照崗位需求排：櫃台 2、流動 1F 1，會的崗位少的人先排，排不滿的列出來（使用者 2026-10-31）", () => {
    const grid: AbilityGrid = {
      p: { counter: "solo", float: "solo" },
      q: { counter: "solo" },
      r: { float: "solo" },
      s: {},
    };
    const posts = { counter: 2, float1: 1, float2: 1 };
    const { tasks, unfilledPosts } = matchSession([], [{ personId: "p" }, { personId: "q" }, { personId: "r" }, { personId: "s" }], grid, undefined, { posts });
    expect(tasks.get("q")).toBe("counter");
    expect(tasks.get("p")).toBe("counter");
    expect(tasks.get("r")).toBe("float-1");
    expect(tasks.has("s")).toBe(false);
    expect(unfilledPosts).toEqual(["float-2"]);
  });

  it("以櫃台為主的人先拿櫃台，也先不拿去配醫師", () => {
    const grid: AbilityGrid = {
      x: { "doctor-0001": "solo", counter: "solo" },
      y: { "doctor-0001": "solo", counter: "solo" },
    };
    const options = { posts: { counter: 1, float1: 0, float2: 0 }, postRank: (id: string) => (id === "x" ? 0 : 2), holdBack: (id: string) => id === "x" };
    const { tasks } = matchSession(["0001"], [{ personId: "x" }, { personId: "y" }], grid, undefined, options);
    expect(tasks.get("x")).toBe("counter");
    expect(tasks.get("y")).toBe("doctor-0001");
    // 醫師沒有別人能跟時，還是用他。
    const alone = matchSession(["0001"], [{ personId: "x" }], grid, undefined, options);
    expect(alone.tasks.get("x")).toBe("doctor-0001");
  });

  it("已記好的工作照記的；培訓目標的人先配", () => {
    expect(matchSession(["0001"], [{ personId: "b", task: "doctor-0001" }, { personId: "a" }], levels).tasks.get("a")).toBeUndefined();
    // 記好的人不是可獨立：那位醫師還是算沒人跟，另一位可獨立的人補上。
    const notSolo = matchSession(["0001"], [{ personId: "c", task: "doctor-0001" }, { personId: "a" }], levels);
    expect(notSolo.tasks.get("c")).toBe("doctor-0001");
    expect(notSolo.tasks.get("a")).toBe("doctor-0001");
    expect(notSolo.uncovered).toEqual([]);
    const prefer = (personId: string, doctorId: string) => personId === "a" && doctorId === "0001";
    expect(matchSession(["0001"], [{ personId: "b" }, { personId: "a" }], levels, prefer).tasks.get("a")).toBe("doctor-0001");
  });
});

describe("先排指定安排與帶新手", () => {
  const context = {
    canAssign: () => true,
    leaveOff: () => false,
    requestedOff: (personId: string, date: string) => personId === "n" && date === "2027-03-02",
    doctorIds: new Set(["0001"]),
  };
  const doctor = ["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04"].map((date) => shift("0001", date, "morning"));

  it("指定安排：休假的那天排不上", () => {
    const leave: ScheduleEntry = { id: "2027-03-01_n", date: "2027-03-01", personId: "n", state: "leave", updatedAt: 1 };
    const placed = placeAssignments(
      [...doctor, leave],
      [
        { id: "x", personId: "n", date: "2027-03-01", shiftId: "morning", task: "learn-0001", purpose: "learn" },
        { id: "y", personId: "n", date: "2027-03-03", shiftId: "morning", task: "learn-0001", purpose: "learn" },
      ],
      new Set(doctor.map((entry) => entry.date)),
      context,
    );
    expect(placed.map((entry) => [entry.date, entry.task])).toEqual([["2027-03-03", "learn-0001"]]);
  });

  it("帶新手 +1：只排那位醫師看診的診、跳過希望不排、扣掉已經排過的", () => {
    const placed = placeLearners(
      [...doctor, shift("n", "2027-03-04", "morning", "learn-0001")],
      [{ personId: "n", doctorId: "0001", minSessions: 3 }],
      doctor.map((entry) => entry.date),
      ["morning", "afternoon"],
      context,
    );
    expect(placed.map((entry) => entry.date).sort()).toEqual(["2027-03-01", "2027-03-03"]);
    expect(placed.every((entry) => entry.task === "learn-0001")).toBe(true);
  });
});

/** 整個月實際跑一次（2027 年 1 月醫師班）：照能力排，比較沒照能力排。 */
describe("整月一鍵排班照能力排", () => {
  const rules = { pediatricDoctorIds, defaultFloors: doctorDefaultFloors, weekdayFloors: doctorWeekdayFloors };
  const labor = { ...laborRules, workdaysByMonth, shifts: courseProfile.shifts };
  const assistants = courseProfile.people.filter((person) => person.role === "assistant").map((person) => person.id);
  const doctorIds = new Set(courseProfile.people.filter((person) => person.role === "doctor").map((person) => person.id));
  const assistantIds = new Set(assistants);
  const days = Array.from({ length: 31 }, (_, index) => `2027-01-${String(index + 1).padStart(2, "0")}`);
  const shiftIds = courseProfile.shifts.map((item) => item.id);
  const doctors = planDoctorScheduleImport([], buildMonthSessions("2027-01", weeklyTemplate2027, specialistVisits2027, closures2027, doctorIdsByName), 1);

  // 虛構但接近實際的能力表（2026-10 試算）：陳美玲、櫃台只有 5 位核心可獨立；張雅文、劉怡萱只有其中 3 位。
  const core = new Set(["1001", "1004", "1013", "1019", "1020"]);
  const top = new Set(["1001", "1004", "1013"]);
  const hard = new Set(["0002", "0008", "0010"]);
  const solo = (personId: string, doctorId: string) =>
    doctorId === "0008" || doctorId === "0010" ? top.has(personId) : core.has(personId) || !hard.has(doctorId);
  const levels: AbilityGrid = Object.fromEntries(
    assistants.map((personId) => [
      personId,
      Object.fromEntries([
        ...Object.values(doctorIdsByName).map((doctorId): [string, AbilityLevel] => [
          `doctor-${doctorId}`,
          solo(personId, doctorId) ? "solo" : "guided",
        ]),
        ["float", "solo"],
        ["counter", core.has(personId) ? "solo" : "guided"],
      ]),
    ]),
  );
  const plan: TrainingPlan = {
    month: "2027-01",
    at: "x",
    by: "x",
    assignments: [{ id: "a1", personId: "1030", date: "2027-01-05", shiftId: "morning", task: "counter", purpose: "assess" }],
    targets: [
      { id: "t1", personId: "1029", task: "doctor-0002", minSessions: 4 },
      { id: "t2", personId: "1031", task: "doctor-0005", minSessions: 6 },
    ],
  };
  const demandFor = (date: string, shiftId: string, current: ScheduleEntry[]) =>
    evaluateSessionDemand(current, courseProfile.people, [date], courseProfile.shifts.filter((item) => item.id === shiftId), rules)[0]?.total ?? 0;
  const canAssign = (personId: string, date: string, shiftId: string, current: ScheduleEntry[]) =>
    canAssignShift(current, personId, date, shiftId, labor);
  const placement = { canAssign, leaveOff: () => false, requestedOff: () => false, doctorIds, now: 1 };

  function run(useAbility: boolean) {
    const levelsFor = () => (useAbility ? levels : null);
    const hooks = abilityHooks({ levelsFor, planFor: () => (useAbility ? plan : undefined), doctorIds, assistantIds });
    const pre = useAbility ? placeAssignments(doctors, plan.assignments, new Set(days), placement) : [];
    if (useAbility) pre.push(...placeLearners([...doctors, ...pre], doctorTargets(plan, levels).learner, days, shiftIds, placement));
    const base = [...doctors, ...pre];
    const planned = planAutoSchedule(base, courseProfile.people, days, courseProfile.shifts, demandFor, 1, 3, {
      preferences: schedulingPreferences,
      canAssign,
      loadOf: (personId, current) => summarizeMonth(current, personId, "2027-01", labor).paidMinutes,
      excludeFromDemand: isLearnerEntry,
      ...(useAbility ? { coverageOf: hooks.coverageOf, trainingOf: hooks.trainingOf } : {}),
    });
    const swapped = breakEveningStreaks(doctors, [...pre, ...planned], courseProfile.shifts, {
      assistantIds,
      eveningShiftId: schedulingPreferences.eveningShiftId,
      maxConsecutiveEvenings: schedulingPreferences.maxConsecutiveEvenings,
      ...(useAbility ? { canSwap: hooks.canSwap } : {}),
    });
    const tasked = assignTasks(doctors, swapped, () => levels, doctorIds, assistantIds, hooks.prefer);
    return [...doctors, ...tasked];
  }

  const started = performance.now();
  const withAbility = run(true);
  const elapsed = performance.now() - started;
  const without = run(false);
  const uncovered = (all: ScheduleEntry[]) => uncoveredSessions(all, days, shiftIds, () => levels, doctorIds, assistantIds).length;

  it("每診人數照樣補齊（帶新手不算）、工時沒有違規", () => {
    const demands = evaluateSessionDemand(withAbility, courseProfile.people, days, courseProfile.shifts, rules);
    expect(demands.filter((demand) => demand.scheduled < demand.total)).toEqual([]);
    expect(evaluateLaborIssues(withAbility, assistants, ["2027-01"], labor)).toEqual([]);
  });

  it("醫師沒人可獨立跟的診不比沒照能力排多", () => {
    expect(uncovered(withAbility)).toBeLessThanOrEqual(uncovered(without));
    expect(uncovered(withAbility)).toBeLessThanOrEqual(2);
    if (process.env.SHOW_ABILITY_RUN) console.log({ withAbility: uncovered(withAbility), without: uncovered(without), ms: Math.round(elapsed) });
  });

  it("指定安排排上、帶新手 +1 排滿、培訓目標達到", () => {
    expect(assignmentStatus(plan.assignments[0], withAbility)).toBe("done");
    const learn = withAbility.filter((entry) => entry.personId === "1029" && entry.task === "learn-0002");
    expect(learn).toHaveLength(4);
    // 新手那一診，陳美玲有一位可獨立的人跟。
    for (const entry of learn) {
      expect(withAbility.some((other) => other.date === entry.date && other.shiftId === entry.shiftId && other.task === "doctor-0002")).toBe(true);
    }
    expect(targetProgress(plan.targets[1], withAbility, "2027-01").short).toBe(0);
  });

  it("要人帶的工作不會排給他（記的工作都是可獨立的）", () => {
    const wrong = withAbility.filter(
      (entry) => entry.task && !entry.task.startsWith("learn-") && assistantIds.has(entry.personId) && entry.personId !== "1030" &&
        levels[entry.personId]?.[entry.task.replace(/^float-\d$/, "float")] !== "solo",
    );
    expect(wrong).toEqual([]);
  });
});

describe("能力提醒（第 6 階段）", () => {
  const levels: AbilityGrid = { a: { "doctor-0001": "solo", float: "guided" }, b: { "doctor-0001": "guided" } };
  const doctorIds = new Set(["0001"]);
  const assistantIds = new Set(["a", "b"]);

  it("記了不是可獨立的工作：流動 1F／2F 看流動；學習、預留不看", () => {
    expect(unableLevel(shift("a", "2027-03-01", "morning", "doctor-0001"), levels)).toBeNull();
    expect(unableLevel(shift("a", "2027-03-01", "morning", "float-2"), levels)).toBe("guided");
    expect(unableLevel(shift("b", "2027-03-01", "morning", "counter"), levels)).toBe("none");
    expect(unableLevel(shift("b", "2027-03-01", "morning", "learn-0001"), levels)).toBeNull();
    expect(unableLevel(shift("b", "2027-03-01", "morning", "reserve"), levels)).toBeNull();
    expect(unableLevel(shift("b", "2027-03-01", "morning", "counter"), null)).toBeNull();
  });

  it("醫師沒有可獨立的人跟的診、總覽的數字", () => {
    const all = [
      shift("0001", "2027-03-01", "morning"),
      shift("b", "2027-03-01", "morning", "doctor-0001"),
      shift("0001", "2027-03-02", "morning"),
      shift("a", "2027-03-02", "morning"),
    ];
    expect([...uncoveredKeys(all, "2027-03", levels, ["morning"], doctorIds, assistantIds)]).toEqual(["2027-03-01|morning|0001"]);
    expect(abilityIssueCounts(all, "2027-03", levels, ["morning"], doctorIds, assistantIds)).toEqual({ uncovered: 1, unable: 1 });
    expect(abilityIssueCounts(all, "2027-03", null, ["morning"], doctorIds, assistantIds)).toEqual({ uncovered: 0, unable: 0 });
  });
});
