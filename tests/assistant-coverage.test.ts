import { describe, expect, it } from "vitest";
import { evaluateAssistantCoverage } from "@/domain/rules/assistant-coverage";
import type { CoursePerson, ScheduleEntry, ShiftDefinition } from "@/domain/types";

const people: CoursePerson[] = [
  { id: "doctor-demo", displayName: "醫師（虛構）", role: "doctor" },
  { id: "assistant-a", displayName: "助理 A（虛構）", role: "assistant" },
  { id: "assistant-b", displayName: "助理 B（虛構）", role: "assistant" },
];
const shifts: ShiftDefinition[] = [
  { id: "morning", label: "早診", start: "09:00", end: "12:00" },
];
const date = "2026-07-20";

function assistantEntry(personId: string): ScheduleEntry {
  return {
    id: `${date}_${personId}`,
    date,
    personId,
    state: "shift",
    shiftId: "morning",
    updatedAt: 1,
  };
}

describe("minimum assistant coverage rule", () => {
  it("warns when a shift has zero assistants", () => {
    const issues = evaluateAssistantCoverage([], people, [date], shifts, 2);
    expect(issues[0]).toMatchObject({ assistantCount: 0, message: "人力不足" });
  });

  it("warns when a shift has one assistant", () => {
    const issues = evaluateAssistantCoverage(
      [assistantEntry("assistant-a")],
      people,
      [date],
      shifts,
      2,
    );
    expect(issues[0]).toMatchObject({ assistantCount: 1, message: "人力不足" });
  });

  it("clears the warning when a shift has two assistants", () => {
    const issues = evaluateAssistantCoverage(
      [assistantEntry("assistant-a"), assistantEntry("assistant-b")],
      people,
      [date],
      shifts,
      2,
    );
    expect(issues).toEqual([]);
  });

  it("ignores doctors and leave entries when counting assistants", () => {
    const issues = evaluateAssistantCoverage(
      [
        assistantEntry("doctor-demo"),
        { ...assistantEntry("assistant-a"), state: "leave", shiftId: undefined },
      ],
      people,
      [date],
      shifts,
      2,
    );
    expect(issues[0].assistantCount).toBe(0);
  });
});
