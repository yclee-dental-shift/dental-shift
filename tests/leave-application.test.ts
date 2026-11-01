import { describe, expect, it } from "vitest";
import {
  applicationStatus,
  applicationsOf,
  isApplicationPlaced,
  leaveApplicationKey,
  removeApplication,
  setApplication,
  setApplicationRest,
  withLegacyApplications,
} from "@/domain/rules/leave-application";
import type { ScheduleEntry } from "@/domain/types";

const date = "2027-01-05";
const preLeave: ScheduleEntry = { id: `${date}_a1`, date, personId: "a1", state: "leave", note: "預假｜特休", updatedAt: 1 };
const shift: ScheduleEntry = { id: `${date}_a1_evening`, date, personId: "a1", state: "shift", shiftId: "evening", updatedAt: 2 };

describe("leave applications", () => {
  it("keeps the application when the manager replaces the pre-leave with a shift", () => {
    const applications = setApplication({}, date, "a1", "特休", "2026-10-24T10:00");
    expect(isApplicationPlaced(applications[leaveApplicationKey(date, "a1")], [preLeave])).toBe(true);
    expect(isApplicationPlaced(applications[leaveApplicationKey(date, "a1")], [shift])).toBe(false);
    expect(applicationsOf(applications, "a1", "2027-01")).toHaveLength(1);
  });

  it("treats old pre-leave entries without a record as applications", () => {
    const merged = withLegacyApplications({}, [preLeave, shift]);
    expect(merged[leaveApplicationKey(date, "a1")]).toMatchObject({ leaveType: "特休", personId: "a1" });
    // 已有紀錄時以紀錄為準，也不重新建立物件。
    const stored = setApplication({}, date, "a1", "事假", "x");
    expect(withLegacyApplications(stored, [preLeave])).toBe(stored);
  });

  it("removes an application", () => {
    const applications = setApplication({}, date, "a1", "特休", "x");
    expect(removeApplication(applications, date, "a1")).toEqual({});
    expect(removeApplication({}, date, "a1")).toEqual({});
  });
});

describe("application status", () => {
  const rest: ScheduleEntry = { id: `${date}_a1`, date, personId: "a1", state: "leave", updatedAt: 3 };
  it("tells placed, rest-instead and unplaced apart", () => {
    const applications = setApplication({}, date, "a1", "特休", "x");
    const application = applications[leaveApplicationKey(date, "a1")];
    expect(applicationStatus(application, [preLeave])).toBe("placed");
    expect(applicationStatus(application, [rest])).toBe("unplaced");
    const converted = setApplicationRest(applications, application, true)[leaveApplicationKey(date, "a1")];
    expect(applicationStatus(converted, [rest])).toBe("rest");
    expect(applicationStatus(converted, [shift])).toBe("unplaced");
    expect(setApplicationRest({}, converted, false)[leaveApplicationKey(date, "a1")].restInstead).toBeUndefined();
  });
});
