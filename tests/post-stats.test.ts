import { describe, expect, it } from "vitest";
import { postCounts } from "@/domain/rules/post-stats";
import type { ScheduleEntry } from "@/domain/types";

const shift = (date: string, shiftId: string, task?: string, personId = "1029"): ScheduleEntry => ({
  id: `${date}_${personId}_${shiftId}`,
  date,
  personId,
  state: "shift",
  shiftId,
  ...(task ? { task } : {}),
  updatedAt: 1,
});

describe("崗位比例", () => {
  it("跟各位醫師、櫃台、流動、學習、沒派各幾診；工作分配優先", () => {
    const entries = [
      shift("2027-03-01", "morning", "doctor-0001"),
      shift("2027-03-01", "afternoon", "learn-0002"),
      shift("2027-03-02", "morning", "counter"),
      shift("2027-03-02", "afternoon", "float-2"),
      shift("2027-03-03", "morning"),
      shift("2027-03-03", "afternoon", "doctor-0001"),
      shift("2027-04-01", "morning", "counter"),
      shift("2027-03-04", "morning", "counter", "1030"),
    ];
    // 工作分配把 3/3 午診改成櫃台。
    const assignments = { month: "2027-03", at: "", by: "", slots: { "2027-03-03|afternoon|counter": ["1029"] }, duties: [] };
    expect(postCounts(entries, "1029", "2027-03", assignments as never)).toEqual({
      worked: 6,
      doctors: { "0001": 1 },
      counter: 2,
      float: 1,
      learn: 1,
      reserve: 0,
      none: 1,
    });
  });
});
