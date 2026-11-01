import { describe, expect, it } from "vitest";
import { leaveWindow } from "@/config/leave.config";
import { changedOverrides, defaultTimeline, timelineFor, timelineProblems, timelineStates } from "@/domain/rules/month-timeline";

describe("monthly schedule timeline", () => {
  it("follows the general rule for March 2027", () => {
    expect(defaultTimeline("2027-03", leaveWindow)).toEqual({
      month: "2027-03",
      prepare: "2026-10-17",
      release: "2026-11-01",
      longLeaveOpen: "2026-11-01",
      generalOpen: "2026-12-16",
      generalLast: "2026-12-22",
      preannounce: "2026-12-30",
      publish: "2027-01-01",
    });
  });

  it("applies a month's own dates and keeps only the changed ones", () => {
    const settings = { ...leaveWindow, overrides: { "2027-04": { publish: "2027-02-02" } } };
    const april = timelineFor("2027-04", settings);
    expect(april.publish).toBe("2027-02-02");
    expect(april.preannounce).toBe("2027-01-30");
    expect(changedOverrides("2027-04", april, leaveWindow)).toEqual({ publish: "2027-02-02" });
  });

  it("flags dates out of order", () => {
    const march = defaultTimeline("2027-03", leaveWindow);
    expect(timelineProblems(march)).toEqual([]);
    expect(timelineProblems({ ...march, generalLast: "2026-12-31" })).toContain("預公告要在排休結束之後");
  });

  it("marks late steps", () => {
    const march = defaultTimeline("2027-03", leaveWindow);
    const states = timelineStates(march, "2026-11-03", { prepared: true, released: false, preannounced: false, published: false });
    expect(states.release).toBe("late");
    expect(states.prepare).toBe("done");
    expect(states.generalOpen).toBe("upcoming");
    expect(timelineStates(march, "2026-12-18", { prepared: true, released: true, preannounced: false, published: false }).generalOpen).toBe("now");
  });
});
