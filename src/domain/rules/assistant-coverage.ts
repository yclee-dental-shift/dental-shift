import type { CoursePerson, ScheduleEntry, ShiftDefinition } from "../types";

export interface CoverageIssue {
  date: string;
  shiftId: string;
  shiftLabel: string;
  assistantCount: number;
  minimumAssistants: number;
  message: "人力不足";
}

/**
 * 對每個可見日期與班別計算助理人數。
 * 這是純顯示警示，不會自動替任何人排班。
 */
export function evaluateAssistantCoverage(
  entries: ScheduleEntry[],
  people: CoursePerson[],
  dates: string[],
  shifts: ShiftDefinition[],
  minimumAssistants = 2,
): CoverageIssue[] {
  const assistants = new Set(
    people.filter((person) => person.role === "assistant").map((person) => person.id),
  );

  return dates.flatMap((date) =>
    shifts.flatMap((shift) => {
      const assistantCount = entries.filter(
        (entry) =>
          entry.date === date &&
          entry.state === "shift" &&
          entry.shiftId === shift.id &&
          assistants.has(entry.personId),
      ).length;
      return assistantCount < minimumAssistants
        ? [{
            date,
            shiftId: shift.id,
            shiftLabel: shift.label,
            assistantCount,
            minimumAssistants,
            message: "人力不足" as const,
          }]
        : [];
    }),
  );
}
