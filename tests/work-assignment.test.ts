import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../src/domain/types";
import {
  assignmentIssues,
  assignmentsFromEntries,
  emptyAssignments,
  entryTaskUpdates,
  isWorkAssignments,
  sessionSlots,
  setSlot,
  slotKey,
  unassignedPeople,
} from "../src/domain/rules/work-assignment";

const shift = (date: string, personId: string, shiftId: string, task?: string): ScheduleEntry => ({
  id: `${date}_${personId}_${shiftId}`,
  date,
  personId,
  state: "shift",
  shiftId,
  ...(task ? { task } : {}),
  updatedAt: 0,
});

const D = "2026-12-01";
const entries = [shift(D, "1001", "morning"), shift(D, "1004", "morning"), shift(D, "1013", "morning", "counter")];
const base = {
  ...emptyAssignments("2026-12", "2026-10-30T10:00", "測試"),
  slots: { [slotKey(D, "morning", "doctor-0001")]: ["1001"], [slotKey(D, "morning", "counter")]: ["1027"] },
};

describe("工作分配", () => {
  it("排了但那一診沒上班＝異常（版表為準）", () => {
    expect(assignmentIssues(base, entries)).toEqual([{ kind: "notWorking", date: D, shiftId: "morning", task: "counter", personId: "1027" }]);
  });

  it("同一個人同一診排兩個崗位＝異常", () => {
    const doubled = setSlot(base, D, "morning", "float-1", ["1001"], "t", "b");
    expect(assignmentIssues(doubled, entries).some((issue) => issue.kind === "double" && issue.personId === "1001")).toBe(true);
  });

  it("有上班沒排崗位＝機動", () => {
    expect(unassignedPeople(base, entries, D, "morning", ["1001", "1004", "1013", "1027"])).toEqual(["1004", "1013"]);
  });

  it("setSlot 空陣列拿掉那一格；sessionSlots 只列有人的格子", () => {
    const removed = setSlot(base, D, "morning", "counter", [], "t", "b");
    expect(sessionSlots(removed, D, "morning")).toEqual([["doctor-0001", ["1001"]]]);
  });

  it("從班表上記的工作產生，也能回寫班表上的工作", () => {
    const made = assignmentsFromEntries(entries, "2026-12", "t", "b");
    expect(made.slots).toEqual({ [slotKey(D, "morning", "counter")]: ["1013"] });
    const updates = entryTaskUpdates(base, entries, new Set(["1001", "1004", "1013"]));
    expect(updates.map((entry) => [entry.personId, entry.task])).toEqual([
      ["1001", "doctor-0001"],
      ["1013", undefined],
    ]);
  });

  it("格式檢查", () => {
    expect(isWorkAssignments({ ...base, duties: [{ date: D, shiftId: "morning", people: ["1019"], text: "檢查病例" }] }, "2026-12")).toBe(true);
    expect(isWorkAssignments(base, "2027-01")).toBe(false);
    expect(isWorkAssignments({ ...base, slots: { [`${D}|morning|boss`]: ["1001"] } }, "2026-12")).toBe(false);
  });
});
