import { describe, expect, it } from "vitest";
import type { SessionDemand } from "@/domain/rules/assistant-demand";
import { dayStatus, daysBetween, upcomingDeadlines } from "@/domain/rules/dashboard";
import { defaultTimeline, timelineStates } from "@/domain/rules/month-timeline";
import { leaveWindow } from "@/config/leave.config";

const demand = (shiftId: string, total: number) => ({ date: "2027-01-05", shiftId, total }) as SessionDemand;

describe("dayStatus", () => {
  const demands = [demand("morning", 4), demand("evening", 3)];

  it("is closed when no doctor works", () => {
    expect(dayStatus([], () => 0)).toBe("closed");
  });

  it("is empty before any assistant is placed", () => {
    expect(dayStatus(demands, () => 0)).toBe("empty");
  });

  it("is short when one session lacks people", () => {
    expect(dayStatus(demands, (item) => (item.shiftId === "morning" ? 4 : 2))).toBe("short");
  });

  it("is ok when every session is filled", () => {
    expect(dayStatus(demands, (item) => item.total)).toBe("ok");
  });
});

describe("upcomingDeadlines", () => {
  it("counts days between dates", () => {
    expect(daysBetween("2026-10-24", "2026-11-01")).toBe(8);
    expect(daysBetween("2026-11-01", "2026-10-30")).toBe(-2);
  });

  it("lists late and soon items, skipping done and ongoing ones", () => {
    const timeline = defaultTimeline("2027-01", leaveWindow);
    const done = { prepared: true, released: true, preannounced: false, published: false };
    const today = timeline.preannounce;
    const items = upcomingDeadlines([{ timeline, states: timelineStates(timeline, today, done) }], today, 14);
    expect(items.map((item) => item.key)).toEqual(["preannounce", "publish"]);
    expect(items[0]).toMatchObject({ state: "now", daysLeft: 0 });
    const after = addOne(timeline.publish);
    const late = upcomingDeadlines([{ timeline, states: timelineStates(timeline, after, done) }], after, 14);
    expect(late.map((item) => [item.key, item.state])).toEqual([["preannounce", "late"], ["publish", "late"]]);
  });
});

function addOne(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
