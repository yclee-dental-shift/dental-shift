import { describe, expect, it } from "vitest";
import { isDutySupervisors, supervisorIssues, supervisorOf, type DutySupervisors } from "@/domain/rules/duty-supervisor";
import type { ScheduleEntry } from "@/domain/types";

const shift = (personId: string, date: string, shiftId: string, extra: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  id: `${date}_${personId}_${shiftId}`,
  date,
  personId,
  state: "shift",
  shiftId,
  updatedAt: 1,
  ...extra,
});

const assistants = new Set(["1001", "1004", "1013", "1029", "1030"]);
const doctors = new Set(["0001"]);

describe("值班主管", () => {
  it("自動帶出助理長，沒有再找組長；指定的優先", () => {
    const entries = [shift("1029", "2027-03-01", "morning"), shift("1004", "2027-03-01", "morning"), shift("1001", "2027-03-01", "morning")];
    expect(supervisorOf(entries, "2027-03-01", "morning", {}, assistants)).toEqual({ personId: "1001", source: "auto" });
    expect(supervisorOf(entries.slice(0, 2), "2027-03-01", "morning", {}, assistants)).toEqual({ personId: "1004", source: "auto" });
    expect(supervisorOf(entries, "2027-03-01", "morning", { "2027-03-01|morning": "1029" }, assistants)).toEqual({ personId: "1029", source: "pick" });
  });

  it("機動、帶新手 +1 不能當主管", () => {
    const entries = [shift("1001", "2027-03-01", "morning", { note: "機動" }), shift("1004", "2027-03-01", "morning", { task: "learn-0001" })];
    expect(supervisorOf(entries, "2027-03-01", "morning", {}, assistants).personId).toBeNull();
  });

  it("要處理的：沒有主管、指定的人沒上班（臨時請假）；還沒排助理的診不列", () => {
    const entries = [
      shift("0001", "2027-03-01", "morning"),
      shift("1029", "2027-03-01", "morning"),
      shift("0001", "2027-03-02", "morning"),
      shift("1030", "2027-03-02", "morning"),
      shift("1004", "2027-03-02", "morning"),
      { id: "2027-03-02_1029", date: "2027-03-02", personId: "1029", state: "leave" as const, updatedAt: 1 },
      shift("0001", "2027-03-03", "morning"),
    ];
    const issues = supervisorIssues(entries, "2027-03", ["morning"], { "2027-03-02|morning": "1029" }, doctors, assistants);
    expect(issues).toEqual([
      { date: "2027-03-01", shiftId: "morning", reason: "none" },
      { date: "2027-03-02", shiftId: "morning", reason: "pickAway", pickAway: "1029" },
    ]);
  });

  it("格式檢查", () => {
    const value: DutySupervisors = { month: "2027-03", at: "x", by: "x", picks: { "2027-03-01|morning": "1029" } };
    expect(isDutySupervisors(value, "2027-03")).toBe(true);
    expect(isDutySupervisors(value, "2027-04")).toBe(false);
    expect(isDutySupervisors({ ...value, picks: { "2027-04-01|morning": "1029" } }, "2027-03")).toBe(false);
  });
});

