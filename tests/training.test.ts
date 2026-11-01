import { describe, expect, it } from "vitest";
import { assignmentStatus, countsForTarget, isTrainingPlan, targetProgress, type TrainingPlan } from "@/domain/rules/training";
import type { ScheduleEntry } from "@/domain/types";

const plan = (month = "2027-03"): TrainingPlan => ({
  month,
  at: "2027-02-20T10:00",
  by: "王小華",
  assignments: [
    { id: "a1", personId: "1029", date: `${month}-03`, shiftId: "morning", task: "learn-0003", purpose: "learn" },
    { id: "a2", personId: "1030", date: `${month}-04`, shiftId: "evening", task: "counter", purpose: "assess", note: "櫃台考核" },
  ],
  targets: [
    { id: "t1", personId: "1029", task: "doctor-0003", minSessions: 8 },
    { id: "t2", personId: "1030", task: "float", minSessions: 2, reason: "人力緊繃" },
  ],
});

const shift = (personId: string, date: string, shiftId: string, task?: string): ScheduleEntry => ({
  id: `${date}_${personId}_${shiftId}`,
  date,
  personId,
  state: "shift",
  shiftId,
  ...(task ? { task } : {}),
  updatedAt: 1,
});

describe("培訓清單", () => {
  it("格式檢查：月份要對、代號要對、最少 1 診", () => {
    expect(isTrainingPlan(plan(), "2027-03")).toBe(true);
    expect(isTrainingPlan(plan(), "2027-04")).toBe(false);
    const bad = plan();
    expect(isTrainingPlan({ ...bad, targets: [{ ...bad.targets[0], minSessions: 0 }] }, "2027-03")).toBe(false);
    // 「為主」的目標不設診數（0）。
    expect(isTrainingPlan({ ...bad, targets: [{ ...bad.targets[0], task: "counter", main: true, minSessions: 0 }] }, "2027-03")).toBe(true);
    expect(isTrainingPlan({ ...bad, targets: [{ ...bad.targets[0], task: "learn-0003" }] }, "2027-03")).toBe(false);
    expect(isTrainingPlan({ ...bad, assignments: [{ ...bad.assignments[0], task: "doctor-x" }] }, "2027-03")).toBe(false);
    expect(isTrainingPlan({ ...bad, assignments: [{ ...bad.assignments[0], date: "2027-04-01" }] }, "2027-03")).toBe(false);
  });

  it("目標：跟診、學習都算；流動 1F、2F 都算流動", () => {
    expect(countsForTarget("doctor-0003", "doctor-0003")).toBe(true);
    expect(countsForTarget("doctor-0003", "learn-0003")).toBe(true);
    expect(countsForTarget("doctor-0003", "doctor-0004")).toBe(false);
    expect(countsForTarget("float", "float-2")).toBe(true);
    expect(countsForTarget("counter", undefined)).toBe(false);
  });

  it("排了幾診、少幾診；少很多標紅", () => {
    const target = plan().targets[0];
    const entries = [
      shift("1029", "2027-03-03", "morning", "learn-0003"),
      shift("1029", "2027-03-04", "morning", "doctor-0003"),
      shift("1029", "2027-03-05", "morning", "counter"),
      shift("1029", "2027-04-01", "morning", "doctor-0003"),
    ];
    expect(targetProgress(target, entries, "2027-03")).toEqual({ done: 2, short: 6, tone: "bad", worked: 3 });
    expect(targetProgress({ ...target, minSessions: 3 }, entries, "2027-03")).toMatchObject({ done: 2, short: 1, tone: "warn" });
    expect(targetProgress({ ...target, minSessions: 2 }, entries, "2027-03").tone).toBe("ok");
  });

  it("指定安排：照排、工作不同、那天休、還沒排", () => {
    const item = plan().assignments[0];
    expect(assignmentStatus(item, [shift("1029", "2027-03-03", "morning", "learn-0003")])).toBe("done");
    expect(assignmentStatus(item, [shift("1029", "2027-03-03", "morning")])).toBe("otherTask");
    expect(assignmentStatus(item, [{ id: "2027-03-03_1029", date: "2027-03-03", personId: "1029", state: "leave", updatedAt: 1 }])).toBe("off");
    expect(assignmentStatus(item, [])).toBe("notScheduled");
  });
});

