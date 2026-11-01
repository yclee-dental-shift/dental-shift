import { describe, expect, it } from "vitest";
import {
  clearCell,
  findEntries,
  findEntry,
  removeEntry,
  setLeave,
  setShift,
  toggleShift,
} from "@/domain/schedule";
import type { ScheduleEntry } from "@/domain/types";

const date = "2026-07-20";
const personId = "doctor-wang-demo";

describe("schedule entry transitions", () => {
  it("creates one shift entry for an empty cell", () => {
    const entries = setShift([], date, personId, "morning", 1);
    expect(entries).toEqual([
      {
        id: `${date}_${personId}`,
        date,
        personId,
        state: "shift",
        shiftId: "morning",
        updatedAt: 1,
      },
    ]);
  });

  it("changes the same cell without creating a duplicate", () => {
    const morning = setShift([], date, personId, "morning", 1);
    const afternoon = setShift(morning, date, personId, "afternoon", 2);
    expect(afternoon).toHaveLength(1);
    expect(findEntry(afternoon, date, personId)?.shiftId).toBe("afternoon");
  });

  it("replaces a shift with leave and removes shiftId", () => {
    const shift = setShift([], date, personId, "morning", 1);
    const leave = setLeave(shift, date, personId, 2);
    expect(leave).toHaveLength(1);
    expect(leave[0]).toMatchObject({ state: "leave" });
    expect(leave[0]).not.toHaveProperty("shiftId");
  });

  it("clears exactly one selected cell", () => {
    const entries: ScheduleEntry[] = [
      ...setShift([], date, personId, "morning", 1),
      ...setShift([], "2026-07-21", personId, "evening", 2),
    ];
    expect(removeEntry(entries, `${date}_${personId}`)).toHaveLength(1);
  });
});

describe("doctor multi-shift transitions", () => {
  const doctorId = "doctor-lin-demo";

  it("lets a doctor work all three shifts on the same day without duplicates", () => {
    let entries = toggleShift([], date, doctorId, "morning", 1);
    entries = toggleShift(entries, date, doctorId, "afternoon", 2);
    entries = toggleShift(entries, date, doctorId, "evening", 3);
    const day = findEntries(entries, date, doctorId);
    expect(day.map((entry) => entry.shiftId).sort()).toEqual(["afternoon", "evening", "morning"]);
    expect(new Set(day.map((entry) => entry.id)).size).toBe(3);
    expect(day.map((entry) => entry.id)).toContain(`${date}_${doctorId}_morning`);
  });

  it("removes only the toggled shift and keeps the others", () => {
    let entries = toggleShift([], date, doctorId, "morning", 1);
    entries = toggleShift(entries, date, doctorId, "evening", 2);
    entries = toggleShift(entries, date, doctorId, "morning", 3);
    expect(findEntries(entries, date, doctorId).map((entry) => entry.shiftId)).toEqual(["evening"]);
  });

  it("replaces every shift of the day with a single leave", () => {
    let entries = toggleShift([], date, doctorId, "morning", 1);
    entries = toggleShift(entries, date, doctorId, "afternoon", 2);
    entries = setLeave(entries, date, doctorId, 3);
    const day = findEntries(entries, date, doctorId);
    expect(day).toHaveLength(1);
    expect(day[0]).toMatchObject({ id: `${date}_${doctorId}`, state: "leave" });
    expect(day[0]).not.toHaveProperty("shiftId");
  });

  it("drops the leave when a shift is toggled on again", () => {
    const leave = setLeave([], date, doctorId, 1);
    const entries = toggleShift(leave, date, doctorId, "afternoon", 2);
    expect(findEntries(entries, date, doctorId)).toMatchObject([{ state: "shift", shiftId: "afternoon" }]);
  });

  it("clears every shift of one doctor on one day only", () => {
    let entries = toggleShift([], date, doctorId, "morning", 1);
    entries = toggleShift(entries, date, doctorId, "evening", 2);
    entries = toggleShift(entries, "2026-07-21", doctorId, "morning", 3);
    expect(clearCell(entries, date, doctorId)).toHaveLength(1);
  });
});

describe("assistant multi-shift transitions", () => {
  const assistantId = "1001";

  it("lets an assistant work three shifts on one day without duplicates", () => {
    let entries = toggleShift([], date, assistantId, "morning", 1);
    entries = toggleShift(entries, date, assistantId, "afternoon", 2);
    entries = toggleShift(entries, date, assistantId, "evening", 3);
    entries = toggleShift(entries, date, assistantId, "evening", 4);
    entries = toggleShift(entries, date, assistantId, "evening", 5);
    const day = findEntries(entries, date, assistantId);
    expect(day.map((entry) => entry.id).sort()).toEqual([
      `${date}_${assistantId}_afternoon`,
      `${date}_${assistantId}_evening`,
      `${date}_${assistantId}_morning`,
    ]);
  });

  it("keeps an old single-entry assistant shift and adds new shifts beside it", () => {
    const legacy = setShift([], date, assistantId, "morning", 1);
    const entries = toggleShift(legacy, date, assistantId, "afternoon", 2);
    expect(findEntries(entries, date, assistantId).map((entry) => entry.shiftId).sort()).toEqual(["afternoon", "morning"]);
    const removed = toggleShift(entries, date, assistantId, "morning", 3);
    expect(findEntries(removed, date, assistantId).map((entry) => entry.id)).toEqual([`${date}_${assistantId}_afternoon`]);
  });

  it("clears all assistant shifts when leave is set", () => {
    let entries = toggleShift([], date, assistantId, "morning", 1);
    entries = toggleShift(entries, date, assistantId, "evening", 2);
    entries = setLeave(entries, date, assistantId, 3);
    expect(findEntries(entries, date, assistantId)).toMatchObject([{ id: `${date}_${assistantId}`, state: "leave" }]);
  });
});
