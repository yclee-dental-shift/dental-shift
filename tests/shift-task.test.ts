import { describe, expect, it } from "vitest";
import { isScheduleEntry } from "@/domain/schedule";
import { isShiftTask, isStaleTask, taskLabel, taskOptions, taskShort, withTask } from "@/domain/rules/shift-task";
import type { ScheduleEntry } from "@/domain/types";

const entry = (personId: string, shiftId: string, task?: string): ScheduleEntry => ({
  id: `2027-03-03_${personId}_${shiftId}`,
  date: "2027-03-03",
  personId,
  state: "shift",
  shiftId,
  ...(task ? { task } : {}),
  updatedAt: 1,
});

describe("班表記工作", () => {
  it("代號與名稱", () => {
    expect(isShiftTask("doctor-0001")).toBe(true);
    expect(isShiftTask("learn-0002")).toBe(true);
    expect(isShiftTask("float-3")).toBe(false);
    expect(taskLabel("doctor-0001")).toBe("跟林志明醫師");
    expect(taskLabel("learn-0002")).toBe("跟陳美玲醫師（學習）");
    expect(taskLabel("float-1")).toBe("流動 1F");
    expect(taskShort("doctor-0001")).toBe("志明");
    expect(taskShort("learn-0002")).toBe("美玲");
    expect(taskShort("counter")).toBe("櫃");
  });

  it("可選的工作只列那一診的醫師", () => {
    const ids = taskOptions(["0001", "0010"]).map((option) => option.id);
    expect(ids).toEqual(["doctor-0001", "doctor-0010", "learn-0001", "learn-0010", "float-1", "float-2", "counter", "reserve"]);
  });

  it("醫師這一診不看了，標提醒", () => {
    const entries = [entry("0001", "morning"), entry("1001", "morning", "doctor-0001"), entry("1004", "morning", "doctor-0010"), entry("1013", "morning", "counter")];
    expect(isStaleTask(entries[1], entries)).toBe(false);
    expect(isStaleTask(entries[2], entries)).toBe(true);
    expect(isStaleTask(entries[3], entries)).toBe(false);
  });

  it("改工作；休假不能有工作；舊資料沒有工作照讀", () => {
    const changed = withTask(entry("1001", "morning"), "float-2", 5);
    expect(changed).toMatchObject({ task: "float-2", updatedAt: 5 });
    expect("task" in withTask(changed, undefined)).toBe(false);
    expect(isScheduleEntry(changed)).toBe(true);
    expect(isScheduleEntry(entry("1001", "morning"))).toBe(true);
    expect(isScheduleEntry({ id: "2027-03-03_1001", date: "2027-03-03", personId: "1001", state: "leave", task: "counter", updatedAt: 1 })).toBe(false);
  });
});
