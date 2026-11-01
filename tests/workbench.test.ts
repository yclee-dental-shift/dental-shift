import { describe, expect, it } from "vitest";
import { courseProfile } from "@/config/clinic.config";
import { laborRules, workdaysByMonth } from "@/config/labor.config";
import { setLeave, toggleShift } from "@/domain/schedule";
import { monthLeaveRequests, sessionCandidates, canPlace } from "@/domain/rules/workbench";
import type { ShiftRequests } from "@/domain/rules/shift-request";
import type { LeaveApplications } from "@/domain/rules/leave-application";

const settings = { ...laborRules, workdaysByMonth: { ...workdaysByMonth, "2027-01": 20 }, shifts: courseProfile.shifts };
const date = "2027-01-06";
const ids = ["a-busy", "a-leave", "a-session", "a-wish", "a-free"];

describe("sessionCandidates", () => {
  let entries = toggleShift([], date, "a-busy", "morning", 1);
  entries = toggleShift(entries, "2027-01-05", "a-free", "morning", 1);
  entries = setLeave(entries, date, "a-leave", 1, "預假｜特休");
  const requests: ShiftRequests = {
    [`${date}_a-session_morning`]: { date, personId: "a-session", shiftId: "morning", at: "x", leaveType: "事假" },
    [`${date}_a-wish_morning`]: { date, personId: "a-wish", shiftId: "morning", at: "x" },
  };

  it("labels each assistant and puts placeable people first, fewest hours first", () => {
    const result = sessionCandidates(entries, ids, date, "morning", settings, requests);
    expect(result.map((item) => [item.personId, item.status])).toEqual([
      ["a-free", "available"],
      ["a-wish", "wish"],
      ["a-busy", "scheduled"],
      ["a-leave", "leave"],
      ["a-session", "sessionLeave"],
    ]);
    expect(result.filter((item) => canPlace(item.status)).map((item) => item.personId)).toEqual(["a-free", "a-wish"]);
  });

  it("warns about a day with an unplaced leave application", () => {
    const applications: LeaveApplications = { [`${date}_a-free`]: { date, personId: "a-free", leaveType: "特休", at: "x" } };
    const result = sessionCandidates(entries, ["a-free"], date, "evening", settings, {}, applications);
    expect(result[0].status).toBe("applied");
    expect(canPlace("applied")).toBe(true);
  });

  it("sorts available people by hours this month", () => {
    const result = sessionCandidates(entries, ["a-free", "a-other"], date, "evening", settings, {});
    expect(result.map((item) => item.personId)).toEqual(["a-other", "a-free"]);
  });
});

describe("monthLeaveRequests", () => {
  it("lists whole-day applications and session leaves with their status, without wishes", () => {
    let entries = setLeave([], "2027-01-04", "a1", 1, "預假｜特休");
    entries = toggleShift(entries, "2027-01-07", "a2", "evening", 1);
    const applications: LeaveApplications = {
      "2027-01-04_a1": { date: "2027-01-04", personId: "a1", leaveType: "特休", at: "x" },
      "2027-01-05_a2": { date: "2027-01-05", personId: "a2", leaveType: "事假", at: "x" },
      "2027-02-01_a1": { date: "2027-02-01", personId: "a1", leaveType: "特休", at: "x" },
    };
    const requests: ShiftRequests = {
      "2027-01-07_a2_evening": { date: "2027-01-07", personId: "a2", shiftId: "evening", at: "x", leaveType: "事假" },
      "2027-01-08_a3_morning": { date: "2027-01-08", personId: "a3", shiftId: "morning", at: "x", leaveType: "特休", restInstead: true },
      "2027-01-09_a3_morning": { date: "2027-01-09", personId: "a3", shiftId: "morning", at: "x" },
    };
    expect(monthLeaveRequests(applications, requests, entries, "2027-01")).toEqual([
      { date: "2027-01-04", personId: "a1", status: "placed" },
      { date: "2027-01-05", personId: "a2", status: "unplaced" },
      { date: "2027-01-07", personId: "a2", shiftId: "evening", status: "unplaced" },
      { date: "2027-01-08", personId: "a3", shiftId: "morning", status: "rest" },
    ]);
  });
});
