import { describe, expect, it } from "vitest";
import { courseProfile } from "@/config/clinic.config";
import {
  canRespond,
  confirmDeadlineFor,
  emptyPublication,
  pendingConfirmCount,
  preannounce,
  publish,
  respond,
  summarizeResponses,
  withdrawPublication,
} from "@/domain/rules/publication";
import { toggleShift } from "@/domain/schedule";
import type { ScheduleEntry } from "@/domain/types";

const doctor = "0001";
const shiftsOn = (date: string, shiftIds: string[]): ScheduleEntry[] =>
  shiftIds.reduce<ScheduleEntry[]>((entries, shiftId) => toggleShift(entries, date, doctor, shiftId, 1), []);

describe("confirm deadline", () => {
  it("is the end of the last session on the next open day", () => {
    const entries = shiftsOn("2026-11-09", ["morning", "afternoon", "evening"]);
    expect(confirmDeadlineFor("2026-11-08", entries, courseProfile.people, courseProfile.shifts)).toBe("2026-11-09T20:45");
  });

  it("uses the afternoon end when the next day has no evening session", () => {
    const entries = shiftsOn("2026-11-09", ["morning", "afternoon"]);
    expect(confirmDeadlineFor("2026-11-08", entries, courseProfile.people, courseProfile.shifts)).toBe("2026-11-09T16:45");
  });

  it("skips closed days to the next open day", () => {
    const entries = shiftsOn("2026-11-10", ["morning"]);
    expect(confirmDeadlineFor("2026-11-08", entries, courseProfile.people, courseProfile.shifts)).toBe("2026-11-10T12:05");
  });

  it("falls back to the next day's latest shift when nothing is scheduled", () => {
    expect(confirmDeadlineFor("2026-11-08", [], courseProfile.people, courseProfile.shifts)).toBe("2026-11-09T20:45");
  });
});

describe("publication flow", () => {
  const assistants = ["assistant-a", "assistant-b", "assistant-c"];
  const pre = preannounce(emptyPublication("2027-01"), "2026-11-08T09:00", "2026-11-09T20:45");

  it("starts as draft and moves to preannounced", () => {
    expect(emptyPublication("2027-01").status).toBe("draft");
    expect(pre).toMatchObject({ status: "preannounced", confirmDeadline: "2026-11-09T20:45", responses: {} });
  });

  it("accepts confirmations and issues only before the deadline", () => {
    let current = respond(pre, "assistant-a", { status: "confirmed", at: "2026-11-08T10:00", issues: [] }, "2026-11-08T10:00");
    current = respond(
      current,
      "assistant-b",
      { status: "issue", at: "2026-11-09T12:00", issues: [{ date: "2027-01-12", shiftId: "evening", kind: "想換班" }] },
      "2026-11-09T12:00",
    );
    const late = respond(current, "assistant-c", { status: "confirmed", at: "2026-11-09T21:00", issues: [] }, "2026-11-09T21:00");
    expect(late).toBe(current);
    expect(canRespond(current, "2026-11-09T20:45")).toBe(true);
    expect(canRespond(current, "2026-11-09T20:46")).toBe(false);
    expect(summarizeResponses(current, assistants, "2026-11-09T12:00")).toEqual({
      confirmed: ["assistant-a"], issues: ["assistant-b"], pending: ["assistant-c"], expired: [],
    });
    expect(summarizeResponses(current, assistants, "2026-11-10T08:00").expired).toEqual(["assistant-c"]);
  });

  it("counts months an assistant still has to confirm", () => {
    const answered = respond(pre, "assistant-a", { status: "confirmed", at: "2026-11-08T10:00", issues: [] }, "2026-11-08T10:00");
    const other = preannounce(emptyPublication("2027-02"), "2026-11-08T09:00", "2026-11-09T20:45");
    expect(pendingConfirmCount([answered, other], "assistant-a", "2026-11-08T12:00")).toBe(1);
    expect(pendingConfirmCount([answered, other], "assistant-b", "2026-11-08T12:00")).toBe(2);
    expect(pendingConfirmCount([answered, other], "assistant-b", "2026-11-10T08:00")).toBe(0);
    expect(pendingConfirmCount([emptyPublication("2027-03")], "assistant-b", "2026-11-08T12:00")).toBe(0);
  });

  it("locks responses once published", () => {
    const published = publish(pre, "2026-11-10T09:00");
    expect(published.status).toBe("published");
    expect(canRespond(published, "2026-11-08T10:00")).toBe(false);
  });
});

describe("withdrawing a publication", () => {
  const preannounced = preannounce(emptyPublication("2027-03"), "2027-01-20T09:00", "2027-01-21T20:45");
  const answered = respond(preannounced, "1001", { status: "confirmed", at: "2027-01-20T10:00", issues: [] }, "2027-01-20T10:00");

  it("takes a pre-announcement back to draft and clears the answers", () => {
    const back = withdrawPublication(answered, "2027-01-20T12:00");
    expect(back).toEqual({
      month: "2027-03",
      status: "draft",
      responses: {},
      withdrawnAt: "2027-01-20T12:00",
      withdrawnFrom: "preannounced",
    });
  });

  it("takes an official publication back to draft with the reason", () => {
    const back = withdrawPublication(publish(answered, "2027-01-22T09:00"), "2027-02-01T09:00", " 醫師異動 ");
    expect(back).toMatchObject({ status: "draft", withdrawnFrom: "published", withdrawReason: "醫師異動", responses: {} });
    expect(back.publishedAt).toBeUndefined();
  });

  it("does nothing to a draft", () => {
    const draft = emptyPublication("2027-03");
    expect(withdrawPublication(draft, "2027-01-20T12:00")).toBe(draft);
  });
});
