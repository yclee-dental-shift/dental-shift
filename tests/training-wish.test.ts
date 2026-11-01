import { describe, expect, it } from "vitest";
import { sessionDoctorIds } from "@/domain/rules/shift-task";
import { targetDoctorsAt, targetWishImpact } from "@/domain/rules/training-wish";
import type { ShiftRequests } from "@/domain/rules/shift-request";
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
const wish = (date: string, personId: string, shiftId: string, leaveType?: string) => ({
  [`${date}_${personId}_${shiftId}`]: { date, personId, shiftId, at: "", ...(leaveType ? { leaveType } : {}) },
});

describe("培訓目標 × 希望不排", () => {
  // 醫師 0008 這個月 5 診。
  const doctor = ["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05"].map((date) => shift("0008", date, "morning"));
  const entries = [
    ...doctor,
    shift("1029", "2027-03-01", "morning", "doctor-0008"),
    shift("1029", "2027-03-02", "morning", "counter"),
  ];
  const requests: ShiftRequests = {
    ...wish("2027-03-03", "1029", "morning"),
    ...wish("2027-03-04", "1029", "morning"),
    ...wish("2027-03-05", "1029", "morning", "特休"),
  };
  const doctorsAt = (date: string, shiftId: string) => sessionDoctorIds(entries, date, shiftId);

  it("醫師看診幾診、排了幾診、希望不排幾診、請假幾診；少的診數有幾診算在希望不排", () => {
    const target = { id: "t", personId: "1029", task: "doctor-0008", minSessions: 4 };
    expect(targetWishImpact(target, entries, requests, "2027-03", doctorsAt, ["morning", "afternoon"])).toEqual({
      sessions: 5,
      done: 1,
      wished: 2,
      leave: 1,
      short: 3,
      lostToWish: 2,
    });
  });

  it("櫃台、流動的目標不算；找出某一診有沒有自己的培訓目標醫師", () => {
    expect(targetWishImpact({ id: "t", personId: "1029", task: "counter", minSessions: 4 }, entries, requests, "2027-03", doctorsAt, ["morning"])).toBeNull();
    const targets = [{ id: "t", personId: "1029", task: "doctor-0008", minSessions: 4 }];
    expect(targetDoctorsAt(targets, "1029", ["0008", "0001"])).toEqual(["0008"]);
    expect(targetDoctorsAt(targets, "1030", ["0008"])).toEqual([]);
  });
});
