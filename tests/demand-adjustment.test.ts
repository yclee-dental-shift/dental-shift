import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DoctorSession } from "@/config/doctors";
import { readDemandAdjustments, saveDemandAdjustments, subscribeDemandAdjustments } from "@/data/demand-adjustment-store";
import { adjustmentMap, sessionKey, setDemandAdjustment } from "@/domain/rules/assistant-demand";
import { evaluateLeaveLoad } from "@/domain/rules/leave-demand";
import type { CoursePerson } from "@/domain/types";

const key = sessionKey("2027-01-08", "afternoon");

describe("demand adjustment", () => {
  it("adds, changes and removes an adjustment", () => {
    const plusOne = setDemandAdjustment({}, key, 1, 5);
    expect(plusOne).toEqual({ [key]: 1 });
    expect(setDemandAdjustment(plusOne, key, 2, 5)).toEqual({ [key]: 2 });
    // 調回 0 就是系統人數，不保留。
    expect(setDemandAdjustment(plusOne, key, 0, 5)).toEqual({});
  });

  it("never goes below zero assistants", () => {
    expect(setDemandAdjustment({}, key, -9, 3)).toEqual({ [key]: -3 });
  });

  it("keeps other sessions untouched", () => {
    const other = sessionKey("2027-01-09", "morning");
    expect(setDemandAdjustment({ [other]: -1 }, key, 1, 4)).toEqual({ [other]: -1, [key]: 1 });
  });
});

describe("demand adjustment store", () => {
  beforeEach(() => window.localStorage.clear());

  it("saves to its own key and notifies listeners", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDemandAdjustments(listener);
    expect(saveDemandAdjustments({ [key]: 1 })).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(readDemandAdjustments()).toEqual({ [key]: 1 });
    expect(window.localStorage.getItem("clinic-schedule-workshop:demand-adjustments:v1")).toBe(JSON.stringify({ [key]: 1 }));
    unsubscribe();
  });

  it("ignores broken or zero values", () => {
    window.localStorage.setItem("clinic-schedule-workshop:demand-adjustments:v1", JSON.stringify({ [key]: 0, a: "x", b: 2 }));
    expect(readDemandAdjustments()).toEqual({ b: 2 });
    window.localStorage.setItem("clinic-schedule-workshop:demand-adjustments:v1", "{");
    expect(readDemandAdjustments()).toEqual({});
  });
});

describe("leave load with adjustments", () => {
  const sessions: DoctorSession[] = [
    { date: "2027-01-08", shiftId: "afternoon", doctors: [{ personId: "doc", limitedBooking: false }] },
  ];
  const people: CoursePerson[] = [
    { id: "doc", displayName: "醫師", role: "doctor" },
    ...["a1", "a2", "a3", "a4", "a5"].map((id) => ({ id, displayName: id, role: "assistant" as const })),
  ];
  const rules = { pediatricDoctorIds: [], defaultFloors: { doc: 1 as const } };

  it("uses the adjusted number of assistants", () => {
    const [plain] = evaluateLeaveLoad([], people, sessions, {}, rules);
    expect(plain.sessions[0].needed).toBe(3);
    expect(plain.heat).toBe("ok");
    const [adjusted] = evaluateLeaveLoad([], people, sessions, {}, rules, adjustmentMap({ [key]: 1 }));
    expect(adjusted.sessions[0].needed).toBe(4);
    expect(adjusted.heat).toBe("hot");
  });
});
