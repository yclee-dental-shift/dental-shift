import { describe, expect, it } from "vitest";
import { courseProfile, doctorDefaultFloors, doctorWeekdayFloors, pediatricDoctorIds } from "@/config/clinic.config";
import { doctorSessions2026_10 } from "./fixtures/doctor-schedule-2026-10";
import {
  calibrationFromTable,
  computeDemand,
  describeDemand,
  evaluateSessionDemand,
} from "@/domain/rules/assistant-demand";
import { planDoctorScheduleImport } from "@/domain/rules/doctor-schedule-import";
import type { ScheduleEntry } from "@/domain/types";

const rules = { pediatricDoctorIds, defaultFloors: doctorDefaultFloors, weekdayFloors: doctorWeekdayFloors };
const 林志明 = "0001";
const 陳美玲 = "0002";
const 吳宗翰 = "0009";
const 黃建宏 = "0005";
const 張雅文 = "0008";
const 劉怡萱 = "0010";

describe("assistant demand rule", () => {
  it("needs 3 for a single doctor on the first floor", () => {
    const demand = computeDemand([林志明], rules);
    expect(demand).toMatchObject({ follow: 1, floats: { 1: 1, 2: 0 }, counter: 1, reserve: 0, ruleTotal: 3 });
  });

  it("splits floors when doctors sit on different floors", () => {
    const demand = computeDemand([林志明, 陳美玲], rules);
    expect(demand.floors).toEqual({ 1: [林志明], 2: [陳美玲] });
    expect(demand.ruleTotal).toBe(6);
  });

  it("applies weekday floor exceptions", () => {
    // 2027-01-05 週二、2027-01-07 週四、2027-01-06 週三
    expect(computeDemand([林志明, 陳美玲], rules, "2027-01-05").floors).toEqual({ 1: [林志明, 陳美玲], 2: [] });
    expect(computeDemand([林志明, 陳美玲], rules, "2027-01-07").floors).toEqual({ 1: [陳美玲], 2: [林志明] });
    expect(computeDemand([林志明, 陳美玲], rules, "2027-01-06").floors).toEqual({ 1: [林志明], 2: [陳美玲] });
  });

  it("keeps the pediatric floor rule on weekday exceptions", () => {
    expect(computeDemand([陳美玲, 吳宗翰], rules, "2027-01-05").floors).toEqual({ 1: [吳宗翰], 2: [陳美玲] });
  });

  it("moves everyone else to the second floor when a pediatric doctor is in", () => {
    const demand = computeDemand([林志明, 黃建宏, 吳宗翰], rules);
    expect(demand.floors).toEqual({ 1: [吳宗翰], 2: [林志明, 黃建宏] });
    // 跟診 3 + 1F 流動 1 + 2F 流動 1 + 櫃檯 2 + 兒牙預留 1
    expect(demand.ruleTotal).toBe(8);
  });

  it("uses two floaters when a floor has three or more doctors", () => {
    const demand = computeDemand([張雅文, 吳宗翰, 劉怡萱, 陳美玲], rules);
    expect(demand.floats).toEqual({ 1: 1, 2: 2 });
    expect(demand.ruleTotal).toBe(10);
  });

  it("needs nothing when no doctor is working", () => {
    expect(computeDemand([], rules).ruleTotal).toBe(0);
  });
});

describe("October calibration", () => {
  const adjustments = calibrationFromTable(doctorSessions2026_10, rules);
  const doctors = planDoctorScheduleImport([], doctorSessions2026_10, 1);
  const octoberDates = [...new Set(doctorSessions2026_10.map((session) => session.date))];
  const demands = evaluateSessionDemand(doctors, courseProfile.people, octoberDates, courseProfile.shifts, rules, adjustments);

  it("matches the configuration table for every October session", () => {
    expect(demands).toHaveLength(doctorSessions2026_10.length);
    for (const session of doctorSessions2026_10) {
      const demand = demands.find((item) => item.date === session.date && item.shiftId === session.shiftId);
      expect(demand?.total, `${session.date} ${session.shiftId}`).toBe(session.assistantsNeeded);
    }
  });

  it("shows the manual adjustment in the breakdown", () => {
    const wednesday = demands.find((item) => item.date === "2026-10-07" && item.shiftId === "afternoon")!;
    expect(wednesday.adjustment).toBe(1);
    expect(describeDemand(wednesday)).toBe("跟診 4・1F 流動 1・2F 流動 2・櫃檯 2・兒牙預留 1・調整 +1");
  });

  it("counts scheduled assistants against the demand", () => {
    const assistant: ScheduleEntry = {
      id: "2026-10-05_1001",
      date: "2026-10-05",
      personId: "1001",
      state: "shift",
      shiftId: "morning",
      updatedAt: 1,
    };
    const [monday] = evaluateSessionDemand(
      [...doctors, assistant], courseProfile.people, ["2026-10-05"], courseProfile.shifts, rules, adjustments,
    );
    expect(monday).toMatchObject({ shiftId: "morning", scheduled: 1, total: 3 });
  });

  it("counts an assistant once in every shift they work", () => {
    const shift = (shiftId: string): ScheduleEntry => ({
      id: `2026-10-05_1001_${shiftId}`,
      date: "2026-10-05",
      personId: "1001",
      state: "shift",
      shiftId,
      updatedAt: 1,
    });
    const monday = evaluateSessionDemand(
      [...doctors, shift("morning"), shift("afternoon")], courseProfile.people, ["2026-10-05"], courseProfile.shifts, rules, adjustments,
    );
    expect(monday.map((demand) => demand.scheduled)).toEqual([1, 1, 0]);
  });
});

describe("assigned floor for one session", () => {
  const rules = { pediatricDoctorIds, defaultFloors: doctorDefaultFloors, weekdayFloors: doctorWeekdayFloors };

  it("puts the doctor on the assigned floor before any floor rule", () => {
    const doctors = ["0001", "0010"];
    const plain = computeDemand(doctors, rules, "2027-01-06", "morning");
    expect(plain.floors[1]).toEqual(["0001"]);
    const assigned = computeDemand(
      doctors,
      { ...rules, sessionFloors: new Map([["2027-01-06_morning_0001", 2 as const]]) },
      "2027-01-06",
      "morning",
    );
    expect(assigned.floors[1]).toEqual([]);
    expect(assigned.floors[2]).toEqual(doctors);
    expect(assigned.floats).toEqual({ 1: 0, 2: 1 });
    // 其他診不受影響。
    const sessionFloors = new Map([["2027-01-06_morning_0001", 2 as const]]);
    expect(computeDemand(doctors, { ...rules, sessionFloors }, "2027-01-06", "afternoon").floors[1]).toEqual(["0001"]);
  });
});
