import { describe, expect, it } from "vitest";
import {
  addSuggestions,
  askRecheck,
  checkReviewWrite,
  clerkApprove,
  ownerApprove,
  ownerReturn,
  replySuggestion,
  reviewTodo,
  sendToClerk,
  sendToOwner,
  snapshotChanges,
  snapshotOf,
  withdrawReview,
} from "../src/domain/rules/schedule-review";

const M = "2027-03";
const value = (review: object) => review as unknown as Record<string, unknown>;

describe("班表審核流程", () => {
  it("送檢查 → 建議 → 回覆 → 再看 → 沒問題 → 送確認 → 同意", () => {
    const sent = sendToClerk(null, M, "t1", "李佳穎");
    expect(sent.status).toBe("clerk");
    const suggested = addSuggestions(sent, [{ text: "晚診太多", personId: "1020" }, { text: "  " }], "t2", "孫雅惠");
    expect(suggested.status).toBe("revise");
    expect(suggested.suggestions).toHaveLength(1);
    expect(reviewTodo(suggested, "lead")).toBe("行政提出 1 則建議");
    const replied = replySuggestion(suggested, suggested.suggestions[0].id, { kind: "adjusted", text: "換了兩診", at: "t3", by: "李佳穎" });
    const again = askRecheck(replied, "t4", "李佳穎");
    expect(again.status).toBe("clerk");
    expect(reviewTodo(again, "clerk")).toBe("班表等你檢查");
    const ok = clerkApprove(again, "t5", "孫雅惠");
    const toOwner = sendToOwner(ok, "為了訓練林雅琪，排較多李醫師的診", ["x"], "t6", "李佳穎");
    expect(toOwner.status).toBe("owner");
    expect(reviewTodo(toOwner, "owner")).toBe("班表等你確認");
    expect(ownerApprove(toOwner, "t7", "陳美玲").status).toBe("approved");
    const back = ownerReturn(toOwner, "週六太集中", "t7", "陳美玲");
    expect(back).toMatchObject({ status: "returned", returnReason: "週六太集中" });
    expect(back.log.map((item) => item.action)).toEqual(["sendToClerk", "suggest", "recheck", "clerkOk", "sendToOwner", "return"]);
  });

  it("送確認之後改過哪幾格", () => {
    const entries = [
      { id: "a", date: "2027-03-01", personId: "1020", state: "shift", shiftId: "evening" },
      { id: "b", date: "2027-03-02", personId: "1020", state: "leave" },
      { id: "c", date: "2027-03-02", personId: "0001", state: "shift", shiftId: "morning" },
    ];
    const before = snapshotOf(entries, M, new Set(["1020"]));
    expect(before).toEqual(["2027-03-01_1020_evening", "2027-03-02_1020_休"]);
    const after = snapshotOf([{ ...entries[0], shiftId: "afternoon" }, entries[1]], M, new Set(["1020"]));
    expect(snapshotChanges(before, after)).toEqual({ added: ["2027-03-01_1020_afternoon"], removed: ["2027-03-01_1020_evening"] });
  });
});

describe("checkReviewWrite（伺服器檢查）", () => {
  const sent = sendToClerk(null, M, "t1", "李佳穎");
  const suggested = addSuggestions(sent, [{ text: "晚診太多" }], "t2", "孫雅惠");
  const id = suggested.suggestions[0].id;

  it("負責人：送審、回覆、撤回可以；同意、退回、改建議內容、改紀錄不行", () => {
    expect(checkReviewWrite(null, value(sent), "leader", true)).toBeNull();
    expect(checkReviewWrite(suggested, value(replySuggestion(suggested, id, { kind: "adjusted", text: "", at: "t", by: "x" })), "leader", true)).toBeNull();
    expect(checkReviewWrite(suggested, value(withdrawReview(suggested, "t3", "x")), "lead", true)).toBeNull();
    expect(checkReviewWrite(suggested, value({ ...suggested, status: "approved" }), "lead", true)).toMatch(/最高管理者/);
    expect(checkReviewWrite(suggested, value({ ...suggested, suggestions: [{ ...suggested.suggestions[0], text: "改掉" }] }), "lead", true)).toMatch(/不能改建議/);
    expect(checkReviewWrite(suggested, value({ ...suggested, log: [] }), "lead", true)).toMatch(/紀錄/);
    // 沒回覆不能請行政再看；沒寫說明不能送確認
    expect(checkReviewWrite(suggested, value(askRecheck(suggested, "t3", "x")), "lead", true)).toMatch(/回覆/);
    const ok = clerkApprove(sent, "t3", "孫雅惠");
    expect(checkReviewWrite(ok, value(sendToOwner(ok, " ", [], "t4", "x")), "lead", true)).toMatch(/說明/);
    expect(checkReviewWrite(ok, value(sendToOwner(ok, "說明", [], "t4", "x")), "lead", true)).toBeNull();
  });

  it("不是負責人、助理都不行", () => {
    expect(checkReviewWrite(null, value(sent), "leader", false)).not.toBeNull();
    expect(checkReviewWrite(null, value(sent), "assistant", false)).not.toBeNull();
  });

  it("行政專員：提出建議、刪自己沒回覆的、沒問題可以；回覆、送確認、改說明不行", () => {
    expect(checkReviewWrite(sent, value(suggested), "clerk", false)).toBeNull();
    expect(checkReviewWrite(suggested, value(clerkApprove(suggested, "t3", "孫雅惠")), "clerk", false)).toBeNull();
    expect(checkReviewWrite(suggested, value({ ...suggested, suggestions: [] }), "clerk", false)).toBeNull();
    const replied = replySuggestion(suggested, id, { kind: "adjusted", text: "", at: "t", by: "x" });
    expect(checkReviewWrite(replied, value({ ...replied, suggestions: [] }), "clerk", false)).toMatch(/已回覆/);
    expect(checkReviewWrite(suggested, value(replySuggestion(suggested, id, { kind: "adjusted", text: "", at: "t", by: "x" })), "clerk", false)).not.toBeNull();
    expect(checkReviewWrite(null, value(sent), "clerk", false)).toMatch(/現在不能/);
    expect(checkReviewWrite(suggested, value({ ...suggested, status: "owner" }), "clerk", false)).not.toBeNull();
    expect(checkReviewWrite(suggested, value({ ...suggested, ownerNote: "x" }), "clerk", false)).not.toBeNull();
  });
});
