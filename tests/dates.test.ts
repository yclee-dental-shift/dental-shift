import { describe, expect, it } from "vitest";
import { addDays, formatWeekRange, startOfWeek, weekDates } from "@/domain/dates";

describe("week date helpers", () => {
  it("uses Monday as the first day of the week", () => {
    expect(startOfWeek("2026-07-20")).toBe("2026-07-20");
    expect(startOfWeek("2026-07-26")).toBe("2026-07-20");
  });

  it("moves across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekDates("2026-07-27")).toHaveLength(7);
    expect(formatWeekRange("2026-07-27")).toBe("2026/07/27－2026/08/02");
  });
});
