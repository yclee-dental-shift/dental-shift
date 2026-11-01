import { describe, expect, it } from "vitest";
import type { ScheduleReview } from "../src/domain/rules/schedule-review";
import {
  approveAndRelease,
  approveDemand,
  assistantLeavePhase,
  currentStep,
  stepAccess,
  demandMismatches,
  isStepDone,
  normalizeApproval,
  releaseDemand,
  returnDemand,
  submitDemand,
  withdrawDemand,
  revokeRelease,
  pauseLeave,
  closeLeaveEarly,
  reopenLeave,
  closedEarlyMonths,
  resumeLeave,
  needsReconfirm,
  confirmPreLeaves,
  scheduleRelease,
  effectiveReleasedAt,
  phaseOf,
  stepTitle,
  WORKFLOW_PHASES,
  WORKFLOW_STEPS,
  type WorkflowInput,
} from "@/domain/rules/workflow";

const base: WorkflowInput = {
  demandStatus: "approved",
  demandReleased: true,
  demandMismatchCount: 0,
  leavePhase: "closed",
  publication: "draft",
};

describe("demand review", () => {
  const demands = [
    { date: "2027-03-01", shiftId: "morning", total: 4 },
    { date: "2027-03-01", shiftId: "afternoon", total: 5 },
    { date: "2027-04-01", shiftId: "morning", total: 3 },
  ];

  it("keeps only the month's sessions when submitting", () => {
    const submitted = submitDemand("2027-03", demands, "2026-12-01T10:00");
    expect(submitted.status).toBe("submitted");
    expect(submitted.totals).toEqual({ "2027-03-01_morning": 4, "2027-03-01_afternoon": 5 });
  });

  it("has no mismatch right after submitting", () => {
    const submitted = submitDemand("2027-03", demands, "2026-12-01T10:00");
    expect(demandMismatches(submitted, demands)).toEqual([]);
  });

  it("lists changed, added and removed sessions", () => {
    const submitted = submitDemand("2027-03", demands, "2026-12-01T10:00");
    const after = [
      { date: "2027-03-01", shiftId: "morning", total: 5 },
      { date: "2027-03-02", shiftId: "evening", total: 2 },
    ];
    expect(demandMismatches(submitted, after)).toEqual([
      { date: "2027-03-01", shiftId: "afternoon", approved: 5, current: undefined },
      { date: "2027-03-01", shiftId: "morning", approved: 4, current: 5 },
      { date: "2027-03-02", shiftId: "evening", approved: undefined, current: 2 },
    ]);
  });

  it("returns with a reason, then approves and clears the reason", () => {
    const submitted = submitDemand("2027-03", demands, "2026-12-01T10:00");
    const returned = returnDemand(submitted, "  週六人太多 ", "2026-12-02T09:00");
    expect(returned).toMatchObject({ status: "returned", returnReason: "週六人太多" });
    const approved = approveDemand(submitDemand("2027-03", demands, "2026-12-03T09:00", returned), "2026-12-03T10:00");
    expect(approved.status).toBe("approved");
    expect(approved.returnReason).toBeUndefined();
  });

  it("returns with per-day notes and clears them on approval", () => {
    const submitted = submitDemand("2027-03", demands, "t1");
    const returned = returnDemand(submitted, "", "t2", [
      { date: "2027-03-05", text: " 早診太多 " },
      { date: "2027-03-01", text: "  " },
    ]);
    expect(returned.returnNotes).toEqual([{ date: "2027-03-05", text: "早診太多" }]);
    expect(approveDemand(returned, "t3").returnNotes).toBeUndefined();
  });

  it("approves with the owner's current totals when given", () => {
    const submitted = submitDemand("2027-03", demands, "t1");
    const edited = [{ date: "2027-03-01", shiftId: "morning", total: 3 }];
    const approved = approveDemand(submitted, "t2", edited);
    expect(approved.totals).toEqual({ "2027-03-01_morning": 3 });
    expect(demandMismatches(approved, edited)).toEqual([]);
  });

  it("keeps the release time when resubmitting", () => {
    const released = releaseDemand(approveDemand(submitDemand("2027-03", demands, "t1"), "t2"), "t3");
    expect(released.releasedAt).toBe("t3");
    expect(releaseDemand(released, "t9").releasedAt).toBe("t3");
    expect(submitDemand("2027-03", demands, "t4", released)).toMatchObject({ status: "submitted", releasedAt: "t3" });
  });

  it("lets the owner approve and release directly", () => {
    const direct = approveAndRelease("2027-03", demands, "t1");
    expect(direct).toMatchObject({ status: "approved", approvedAt: "t1", releasedAt: "t1" });
  });

  it("treats old records without a status as approved but not released", () => {
    const old = normalizeApproval({ month: "2027-03", approvedAt: "t1", totals: {} });
    expect(old.status).toBe("approved");
    expect(old.releasedAt).toBeUndefined();
  });
});

describe("assistant leave phase", () => {
  it("stays closed to assistants until the demand is released", () => {
    expect(assistantLeavePhase("open", false)).toBe("notOpen");
    expect(assistantLeavePhase("longLeaveOnly", false)).toBe("notOpen");
    expect(assistantLeavePhase("closed", false)).toBe("closed");
    expect(assistantLeavePhase("open", true)).toBe("open");
    expect(assistantLeavePhase("open", true, true)).toBe("notOpen");
    expect(assistantLeavePhase("closed", true, true)).toBe("closed");
  });
});

describe("workflow steps", () => {
  it("starts at the demand step (doctor shifts follow the doctor schedule automatically)", () => {
    expect(WORKFLOW_STEPS[0].id).toBe("demand");
    expect(WORKFLOW_STEPS).toHaveLength(9);
  });

  it("needs a fresh submission for the demand step", () => {
    expect(currentStep({ ...base, demandStatus: undefined, demandReleased: false })).toBe("demand");
    expect(currentStep({ ...base, demandStatus: "returned", demandReleased: false })).toBe("demand");
    expect(currentStep({ ...base, demandMismatchCount: 2 })).toBe("demand");
  });

  it("waits for review, then release", () => {
    expect(currentStep({ ...base, demandStatus: "submitted", demandReleased: false })).toBe("review");
    expect(currentStep({ ...base, demandReleased: false })).toBe("release");
  });

  it("moves on to the leave deadline once released", () => {
    expect(isStepDone("release", { ...base, leavePhase: "open", demandReleased: false })).toBe(false);
    expect(currentStep({ ...base, leavePhase: "notOpen" })).toBe("leaveClosed");
    expect(currentStep({ ...base, leavePhase: "longLeaveOnly" })).toBe("leaveClosed");
    expect(currentStep({ ...base, leavePhase: "open" })).toBe("leaveClosed");
  });

  it("follows the publication status", () => {
    expect(currentStep(base)).toBe("schedule");
    expect(currentStep({ ...base, publication: "preannounced" })).toBe("confirm");
    expect(currentStep({ ...base, publication: "published" })).toBe("publish");
    expect(isStepDone("publish", { ...base, publication: "published" })).toBe(true);
  });

  it("行政檢查、確認班表：照班表審核的狀態走；已預公告的月份照舊算完成", () => {
    const review = (status: ScheduleReview["status"]): ScheduleReview => ({ month: "2027-03", status, suggestions: [], log: [] });
    expect(currentStep({ ...base, review: review("editing") })).toBe("schedule");
    expect(currentStep({ ...base, review: review("returned") })).toBe("schedule");
    expect(currentStep({ ...base, review: review("clerk") })).toBe("clerkCheck");
    expect(currentStep({ ...base, review: review("revise") })).toBe("clerkCheck");
    expect(currentStep({ ...base, review: review("clerkOk") })).toBe("ownerCheck");
    expect(currentStep({ ...base, review: review("owner") })).toBe("ownerCheck");
    expect(currentStep({ ...base, review: review("approved") })).toBe("confirm");
    expect(currentStep({ ...base, review: null, publication: "preannounced" })).toBe("confirm");
  });
});

describe("going back in the demand flow", () => {
  const demands = [{ date: "2027-03-01", shiftId: "morning", total: 4 }];

  it("lets the scheduler withdraw a submission and resubmit", () => {
    const submitted = submitDemand("2027-03", demands, "2026-10-01T09:00");
    const withdrawn = withdrawDemand(submitted, "2026-10-01T10:00");
    expect(withdrawn).toMatchObject({ status: "returned", withdrawn: true, returnedAt: "2026-10-01T10:00" });
    expect(currentStep({ ...base, demandStatus: withdrawn.status, demandReleased: false })).toBe("demand");
    const again = submitDemand("2027-03", demands, "2026-10-01T11:00", withdrawn);
    expect(again.status).toBe("submitted");
    expect(again.withdrawn).toBeUndefined();
  });

  it("only withdraws a submission that is still waiting", () => {
    const approved = approveDemand(submitDemand("2027-03", demands, "2026-10-01T09:00"), "2026-10-02T09:00");
    expect(withdrawDemand(approved, "2026-10-03T09:00")).toBe(approved);
  });

  it("lets the owner revoke an approval but keeps the release", () => {
    const released = releaseDemand(approveDemand(submitDemand("2027-03", demands, "2026-10-01T09:00"), "2026-10-02T09:00"), "2026-10-02T10:00");
    const reopened = returnDemand(released, "醫師班有變動", "2026-10-05T09:00");
    expect(reopened).toMatchObject({ status: "returned", returnReason: "醫師班有變動", releasedAt: "2026-10-02T10:00" });
    expect(reopened.approvedAt).toBeUndefined();
    expect(currentStep({ ...base, demandStatus: reopened.status, demandReleased: true })).toBe("demand");
    // 原因可以不填。
    expect(returnDemand(released, "", "2026-10-05T09:00")).toMatchObject({ status: "returned", returnReason: "" });
    // 已發布：助理仍可排休。
    expect(assistantLeavePhase("open", true)).toBe("open");
  });
});

describe("release and leave can be taken back", () => {
  const demands = [{ date: "2027-03-01", shiftId: "morning", total: 4 }];
  const released = releaseDemand(approveDemand(submitDemand("2027-03", demands, "2026-10-01T09:00"), "2026-10-02T09:00"), "2026-10-02T10:00");

  it("revokes and re-releases, keeping the earlier leave by default", () => {
    const revoked = revokeRelease(released, "2026-10-05T09:00", "人數要重算");
    expect(revoked.releasedAt).toBeUndefined();
    expect(revoked).toMatchObject({ releaseRevokedAt: "2026-10-05T09:00", releaseRevokeReason: "人數要重算" });
    expect(currentStep({ ...base, demandReleased: !!revoked.releasedAt })).toBe("release");
    const again = releaseDemand(revoked, "2026-10-06T09:00");
    expect(again.releasedAt).toBe("2026-10-06T09:00");
    expect(again.releaseRevokedAt).toBeUndefined();
    expect(again.reconfirm).toBeUndefined();
  });

  it("asks assistants to reconfirm when re-released that way", () => {
    const again = releaseDemand(revokeRelease(released, "2026-10-05T09:00"), "2026-10-06T09:00", "reconfirm");
    expect(again.reconfirm).toEqual({ requestedAt: "2026-10-06T09:00", confirmed: [] });
    expect(needsReconfirm(again, "a1")).toBe(true);
    const confirmed = confirmPreLeaves(again, "a1");
    expect(needsReconfirm(confirmed, "a1")).toBe(false);
    expect(needsReconfirm(confirmed, "a2")).toBe(true);
  });

  it("does not ask to reconfirm on the first release", () => {
    expect(released.reconfirm).toBeUndefined();
  });

  it("pauses and resumes leave", () => {
    const paused = pauseLeave(released, "2026-10-07T09:00", "人數有誤");
    expect(paused).toMatchObject({ leavePausedAt: "2026-10-07T09:00", leavePauseReason: "人數有誤" });
    const resumed = resumeLeave(paused, "2026-10-08T09:00", "reconfirm");
    expect(resumed.leavePausedAt).toBeUndefined();
    expect(resumed.reconfirm?.requestedAt).toBe("2026-10-08T09:00");
  });

  it("closes leave early and reopens it", () => {
    const closed = closeLeaveEarly(released, "2026-10-20T09:00");
    expect(closed.leaveClosedAt).toBe("2026-10-20T09:00");
    expect(closedEarlyMonths({ "2027-03": closed })).toEqual({ "2027-03": "2026-10-20T09:00" });
    const reopened = reopenLeave(closed);
    expect(reopened.leaveClosedAt).toBeUndefined();
    expect(closedEarlyMonths({ "2027-03": reopened })).toEqual({});
    const again = submitDemand("2027-03", demands, "2026-10-21T09:00", closed);
    expect(again.leaveClosedAt).toBe("2026-10-20T09:00");
  });

  it("keeps the release state when the demand is resubmitted", () => {
    const paused = pauseLeave(released, "2026-10-07T09:00");
    const again = submitDemand("2027-03", demands, "2026-10-09T09:00", paused);
    expect(again).toMatchObject({ releasedAt: "2026-10-02T10:00", leavePausedAt: "2026-10-07T09:00" });
  });
});

describe("scheduled release", () => {
  const demands = [{ date: "2027-03-01", shiftId: "morning", total: 4 }];
  const approved = approveDemand(submitDemand("2027-03", demands, "2026-10-01T09:00"), "2026-10-02T09:00");

  it("releases on the planned day once approved", () => {
    const scheduled = scheduleRelease(approved, true);
    expect(effectiveReleasedAt(scheduled, "2026-10-31", "2026-11-01")).toBeUndefined();
    expect(effectiveReleasedAt(scheduled, "2026-11-01", "2026-11-01")).toBe("2026-11-01T00:00");
    expect(effectiveReleasedAt(scheduleRelease(scheduled, false), "2026-11-02", "2026-11-01")).toBeUndefined();
  });

  it("does not release when the approval was revoked", () => {
    const reopened = returnDemand(scheduleRelease(approved, true), "", "2026-10-20T09:00");
    expect(effectiveReleasedAt(reopened, "2026-11-02", "2026-11-01")).toBeUndefined();
  });

  it("clears the schedule when released by hand or revoked", () => {
    const released = releaseDemand(scheduleRelease(approved, true), "2026-10-20T09:00");
    expect(released.releaseScheduled).toBeUndefined();
    expect(revokeRelease(released, "2026-10-21T09:00").releaseScheduled).toBeUndefined();
  });
});

describe("step access (in order)", () => {
  it("only the current step is workable; earlier steps are view-only and later ones are locked", () => {
    const input = { ...base, leavePhase: "notOpen" as const };
    expect(currentStep(input)).toBe("leaveClosed");
    expect(stepAccess("leaveClosed", input)).toBe("current");
    expect(stepAccess("demand", input)).toBe("done");
    expect(stepAccess("release", input)).toBe("done");
    expect(stepAccess("schedule", input)).toBe("locked");
    expect(stepAccess("publish", input)).toBe("locked");
  });

  it("keeps later finished steps viewable when an earlier step reopens", () => {
    // 人數和送出時不同 → 回到第 1 步，但已發布的第 3 步仍可檢視。
    const input = { ...base, demandMismatchCount: 1 };
    expect(currentStep(input)).toBe("demand");
    expect(stepAccess("release", input)).toBe("done");
    expect(stepAccess("review", input)).toBe("locked");
  });
});

describe("畫面上的 5 段（WORKFLOW_PHASES）", () => {
  it("5 段照順序涵蓋全部 9 步，每一步只在一段", () => {
    expect(WORKFLOW_PHASES.flatMap((phase) => phase.steps)).toEqual(WORKFLOW_STEPS.map((step) => step.id));
  });

  it("每一步找得到自己那一段", () => {
    expect(phaseOf("review").label).toBe("人數");
    expect(phaseOf("leaveClosed").label).toBe("排休");
    expect(phaseOf("clerkCheck").label).toBe("排班");
    expect(phaseOf("confirm").label).toBe("助理確認");
  });

  it("步驟名稱：段名＋步驟；一段只有一步或同名時只寫一次", () => {
    expect(stepTitle("clerkCheck")).toBe("排班・行政檢查");
    expect(stepTitle("ownerCheck")).toBe("排班・管理者核准");
    expect(stepTitle("review")).toBe("人數・管理者核准");
    expect(stepTitle("confirm")).toBe("助理確認");
    expect(stepTitle("publish")).toBe("正式公告");
    expect(stepTitle("schedule")).toBe("排班");
  });
});
