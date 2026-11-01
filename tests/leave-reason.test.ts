import { describe, expect, it } from "vitest";
import {
  dayReasonKey,
  formatReason,
  normalizeReason,
  recentReasons,
  removeReason,
  setReason,
  shiftReasonKey,
  type LeaveReasons,
} from "@/domain/rules/leave-reason";

const date = "2027-01-04";

describe("leave reasons", () => {
  it("requires a known category and non-empty text", () => {
    expect(normalizeReason("", "顧小孩")).toBeNull();
    expect(normalizeReason("不存在", "顧小孩")).toBeNull();
    expect(normalizeReason("家庭照顧", "   ")).toBeNull();
    expect(normalizeReason("家庭照顧", "  顧小孩 ")).toEqual({ category: "家庭照顧", text: "顧小孩" });
  });

  it("caps the text length", () => {
    expect(normalizeReason("其他", "字".repeat(80))?.text).toHaveLength(50);
  });

  it("keeps day and shift reasons apart", () => {
    expect(dayReasonKey(date, "a1")).not.toBe(shiftReasonKey(date, "a1", "evening"));
  });

  it("sets and removes a reason", () => {
    const key = dayReasonKey(date, "a1");
    const set = setReason({}, key, { personId: "a1", date, category: "旅遊返鄉", text: "出國" }, "2026-10-22T10:00");
    expect(set[key]).toMatchObject({ category: "旅遊返鄉", text: "出國", at: "2026-10-22T10:00" });
    expect(formatReason(set[key])).toBe("旅遊返鄉｜出國");
    expect(removeReason(set, key)).toEqual({});
    expect(removeReason(set, "missing")).toBe(set);
  });

  it("lists a person's recent reasons without duplicates", () => {
    let reasons: LeaveReasons = {};
    reasons = setReason(reasons, dayReasonKey("2027-01-04", "a1"), { personId: "a1", date, category: "家庭照顧", text: "顧小孩" }, "2026-10-01T10:00");
    reasons = setReason(reasons, dayReasonKey("2027-01-11", "a1"), { personId: "a1", date, category: "家庭照顧", text: "顧小孩" }, "2026-10-02T10:00");
    reasons = setReason(reasons, dayReasonKey("2027-01-12", "a1"), { personId: "a1", date, category: "其他", text: "搬家" }, "2026-10-03T10:00");
    reasons = setReason(reasons, dayReasonKey("2027-01-12", "a2"), { personId: "a2", date, category: "其他", text: "別人的理由" }, "2026-10-04T10:00");
    expect(recentReasons(reasons, "a1")).toEqual([
      { category: "其他", text: "搬家" },
      { category: "家庭照顧", text: "顧小孩" },
    ]);
  });
});
