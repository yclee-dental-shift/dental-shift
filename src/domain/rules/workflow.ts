import { sessionKey } from "./assistant-demand";
import type { MonthPhase } from "./leave-window";
import type { PublicationStatus } from "./publication";
import { clerkDone, reviewApproved, reviewSubmitted, type ScheduleReview } from "./schedule-review";

/**
 * 每月排班流程：醫師與人數（排醫師＋推算助理人數）→ 管理者確認 → 發布與排休 → 排休截止 → 排班 →
 * 行政檢查 → 最高管理者確認班表（2026-10-27 加，`schedule-review.ts`）→ 班表確認（預公告）→ 公告。
 * 醫師班不在流程裡：班表上的醫師班一律依「醫師班表」自動同步。
 * 各步是否完成都由既有資料推算；人數的送出、確認、發布紀錄存在 demand-approval-store。
 * 畫面上（使用者 2026-10-30，照 Apple HIG 先看大段落再看細節）把 9 步分成 5 段（WORKFLOW_PHASES）；
 * 內部仍是這 9 步，判斷、權限、網址 ?step= 都照舊。actor＝這一步誰做。
 */
export const WORKFLOW_STEPS = [
  { id: "demand", label: "醫師與人數", actor: "排班負責人" },
  { id: "review", label: "管理者核准", actor: "最高管理者" },
  { id: "release", label: "發布與排休", actor: "排班負責人" },
  { id: "leaveClosed", label: "排休截止", actor: "日期到了自動截止" },
  { id: "schedule", label: "排班", actor: "排班負責人" },
  { id: "clerkCheck", label: "行政檢查", actor: "行政專員" },
  { id: "ownerCheck", label: "管理者核准", actor: "最高管理者" },
  { id: "confirm", label: "助理確認", actor: "助理" },
  { id: "publish", label: "正式公告", actor: "排班負責人" },
] as const;

export type WorkflowStepId = (typeof WORKFLOW_STEPS)[number]["id"];

/** 畫面上的 5 段：人數 → 排休 → 排班 → 助理確認 → 公告；每段包含的步驟照順序。 */
export const WORKFLOW_PHASES = [
  { id: "demand", label: "人數", steps: ["demand", "review"] },
  { id: "leave", label: "排休", steps: ["release", "leaveClosed"] },
  { id: "schedule", label: "排班", steps: ["schedule", "clerkCheck", "ownerCheck"] },
  { id: "confirm", label: "助理確認", steps: ["confirm"] },
  { id: "publish", label: "公告", steps: ["publish"] },
] as const satisfies ReadonlyArray<{ id: string; label: string; steps: readonly WorkflowStepId[] }>;

export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

export function phaseOf(step: WorkflowStepId): WorkflowPhase {
  return WORKFLOW_PHASES.find((phase) => (phase.steps as readonly WorkflowStepId[]).includes(step))!;
}

export function stepLabel(step: WorkflowStepId): string {
  return WORKFLOW_STEPS.find((item) => item.id === step)?.label ?? "";
}

/** 畫面上的步驟名稱：「排班・行政檢查」；一段只有一步、或步驟和段同名時只寫一次（「助理確認」「正式公告」「排班」）。 */
export function stepTitle(step: WorkflowStepId): string {
  const phase = phaseOf(step);
  const label = stepLabel(step);
  return phase.steps.length === 1 || label === phase.label ? label : `${phase.label}・${label}`;
}

/** submitted 排班者已送出 → returned 管理者退回（或排班者撤回）／approved 管理者同意；同意後仍可撤銷，回到 returned。 */
export type DemandStatus = "submitted" | "returned" | "approved";

/** 某月助理人數的送審紀錄：狀態、時間與當時每一診的人數。 */
export interface DemandApproval {
  month: string;
  status: DemandStatus;
  /** key 為 `日期_班別ID`。 */
  totals: Record<string, number>;
  submittedAt?: string;
  returnedAt?: string;
  returnReason?: string;
  /** 退回時管理者對某幾天的意見；舊資料沒有這個欄位。 */
  returnNotes?: DemandNote[];
  /** true＝排班者（或管理者）自己撤回送出，不是管理者退回；舊資料沒有這個欄位。 */
  withdrawn?: boolean;
  approvedAt?: string;
  /** 發布到助理排休頁的時間；發布後即使重新送審，助理仍可繼續申請排休。 */
  releasedAt?: string;
  /** 預約發布：管理者已同意時，到排班日程的「人數發布」日自動視為發布；舊資料沒有。 */
  releaseScheduled?: boolean;
  /** 最近一次收回發布的時間與原因（選填）；舊資料沒有。 */
  releaseRevokedAt?: string;
  releaseRevokeReason?: string;
  /** 暫停排休的時間與原因（選填）；暫停中助理不能新增或取消排休申請。 */
  leavePausedAt?: string;
  leavePauseReason?: string;
  /** 提早截止排休的時間（使用者 2026-10-25：大家都確認過時可以比日程提早完成第 4 步）；舊資料沒有。 */
  leaveClosedAt?: string;
  /** 重新發布或恢復排休時選「請助理重新確認」：已確認保留原本排休的助理。 */
  reconfirm?: { requestedAt: string; confirmed: string[] };
}

/** 重新發布或恢復排休時，原本已登記的排休：keep 保留照常有效；reconfirm 請助理重新確認。 */
export type PreLeaveHandling = "keep" | "reconfirm";

/** 管理者退回時對某一天的意見。 */
export interface DemandNote {
  date: string;
  text: string;
}

export interface DemandMismatch {
  date: string;
  shiftId: string;
  /** 送出時的人數；新出現的診為 undefined。 */
  approved: number | undefined;
  /** 現在系統算的人數；已沒有醫師的診為 undefined。 */
  current: number | undefined;
}

type DemandList = Array<{ date: string; shiftId: string; total: number }>;

function totalsOf(month: string, demands: DemandList): Record<string, number> {
  const totals: Record<string, number> = {};
  demands
    .filter((demand) => demand.date.startsWith(month))
    .forEach((demand) => {
      totals[sessionKey(demand.date, demand.shiftId)] = demand.total;
    });
  return totals;
}

/** 舊版紀錄只有 approvedAt（管理者已同意）；讀取時補上狀態。 */
export function normalizeApproval(raw: Partial<DemandApproval> & { month: string }): DemandApproval {
  return { ...raw, totals: raw.totals ?? {}, status: raw.status ?? "approved" };
}

/** 發布與排休的狀態：重新送審、核定時都要保留。 */
function releaseState(previous?: DemandApproval): Partial<DemandApproval> {
  if (!previous) return {};
  const { releasedAt, releaseScheduled, releaseRevokedAt, releaseRevokeReason, leavePausedAt, leavePauseReason, leaveClosedAt, reconfirm } = previous;
  return Object.fromEntries(
    Object.entries({ releasedAt, releaseScheduled, releaseRevokedAt, releaseRevokeReason, leavePausedAt, leavePauseReason, leaveClosedAt, reconfirm }).filter(
      ([, value]) => value !== undefined,
    ),
  );
}

/** 排班者送出（或重新送出）人數給管理者確認；保留原本的發布與排休狀態。 */
export function submitDemand(month: string, demands: DemandList, now: string, previous?: DemandApproval): DemandApproval {
  return {
    month,
    status: "submitted",
    totals: totalsOf(month, demands),
    submittedAt: now,
    ...releaseState(previous),
  };
}

/** 退回：整體原因和逐日意見至少要有一項；空白的意見不保留。 */
export function returnDemand(approval: DemandApproval, reason: string, now: string, notes: DemandNote[] = []): DemandApproval {
  const kept = notes
    .map((note) => ({ date: note.date, text: note.text.trim() }))
    .filter((note) => note.text)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next: DemandApproval = { ...approval, status: "returned", returnedAt: now, returnReason: reason.trim() };
  if (kept.length > 0) next.returnNotes = kept;
  else delete next.returnNotes;
  delete next.withdrawn;
  delete next.approvedAt;
  return next;
}

/** 送出後、管理者還沒處理前撤回，回到編輯；已發布的時間保留（助理仍可排休）。 */
export function withdrawDemand(approval: DemandApproval, now: string): DemandApproval {
  if (approval.status !== "submitted") return approval;
  const next: DemandApproval = { ...approval, status: "returned", returnedAt: now, withdrawn: true };
  delete next.returnReason;
  delete next.returnNotes;
  return next;
}

/**
 * 管理者同意。傳入 demands 時改用目前的人數（管理者自己改過醫師或人數後直接同意）。
 */
export function approveDemand(approval: DemandApproval, now: string, demands?: DemandList): DemandApproval {
  const next: DemandApproval = {
    ...approval,
    status: "approved",
    approvedAt: now,
    ...(demands ? { totals: totalsOf(approval.month, demands) } : {}),
  };
  delete next.returnedAt;
  delete next.returnReason;
  delete next.returnNotes;
  delete next.withdrawn;
  return next;
}

function applyHandling(approval: DemandApproval, now: string, handling: PreLeaveHandling): DemandApproval {
  const next = { ...approval };
  if (handling === "reconfirm") next.reconfirm = { requestedAt: now, confirmed: [] };
  else delete next.reconfirm;
  return next;
}

/** 發布到助理排休頁；收回後重新發布時，選擇原本的排休保留或請助理重新確認。 */
export function releaseDemand(approval: DemandApproval, now: string, handling: PreLeaveHandling = "keep"): DemandApproval {
  if (approval.releasedAt) return approval;
  const next = applyHandling({ ...approval, releasedAt: now }, now, approval.releaseRevokedAt ? handling : "keep");
  delete next.releaseRevokedAt;
  delete next.releaseRevokeReason;
  delete next.releaseScheduled;
  return next;
}

/** 預約發布（或取消預約）：到「人數發布」日自動發布，期間仍可立即發布。 */
export function scheduleRelease(approval: DemandApproval, scheduled: boolean): DemandApproval {
  const next: DemandApproval = { ...approval, releaseScheduled: true };
  if (!scheduled) delete next.releaseScheduled;
  return next;
}

/**
 * 實際的發布時間：按過發布就是那個時間；預約發布且管理者已同意、日期已到，就是預約的日期。
 * 網站沒有伺服器，所以由打開畫面的人依日期判斷。
 */
export function effectiveReleasedAt(approval: DemandApproval | undefined, today: string, releaseDate: string): string | undefined {
  if (!approval) return undefined;
  if (approval.releasedAt) return approval.releasedAt;
  return approval.releaseScheduled && approval.status === "approved" && today >= releaseDate ? `${releaseDate}T00:00` : undefined;
}

/** 收回發布：助理頁回到「尚未開放」，已登記的排休先保留，重新發布時再決定。 */
export function revokeRelease(approval: DemandApproval, now: string, reason = ""): DemandApproval {
  const next: DemandApproval = { ...approval, releaseRevokedAt: now };
  delete next.releasedAt;
  delete next.releaseScheduled;
  if (reason.trim()) next.releaseRevokeReason = reason.trim();
  else delete next.releaseRevokeReason;
  return next;
}

/** 暫停排休：助理不能新增或取消排休申請（已登記的先保留）。 */
export function pauseLeave(approval: DemandApproval, now: string, reason = ""): DemandApproval {
  const next: DemandApproval = { ...approval, leavePausedAt: now };
  if (reason.trim()) next.leavePauseReason = reason.trim();
  else delete next.leavePauseReason;
  return next;
}

/** 恢復排休，並選擇原本的排休保留或請助理重新確認。 */
export function resumeLeave(approval: DemandApproval, now: string, handling: PreLeaveHandling = "keep"): DemandApproval {
  if (!approval.leavePausedAt) return approval;
  const next = applyHandling(approval, now, handling);
  delete next.leavePausedAt;
  delete next.leavePauseReason;
  return next;
}

/** 提早截止排休：不必改日程，第 4 步直接完成，助理不能再新增、修改或取消排休申請。 */
export function closeLeaveEarly(approval: DemandApproval, now: string): DemandApproval {
  return { ...approval, leaveClosedAt: now };
}

/** 重新開放排休（取消提早截止）：回到日程原本的截止日。 */
export function reopenLeave(approval: DemandApproval): DemandApproval {
  if (!approval.leaveClosedAt) return approval;
  const next = { ...approval };
  delete next.leaveClosedAt;
  return next;
}

/** 每月提早截止排休的時間（給 LeaveWindowSettings.closedEarly）。 */
export function closedEarlyMonths(approvals: Record<string, DemandApproval>): Record<string, string> {
  return Object.fromEntries(
    Object.values(approvals)
      .filter((approval) => approval.leaveClosedAt)
      .map((approval) => [approval.month, approval.leaveClosedAt!]),
  );
}

/** 這位助理是否還要重新確認原本的排休。 */
export function needsReconfirm(approval: DemandApproval | undefined, personId: string): boolean {
  return !!approval?.reconfirm && !approval.reconfirm.confirmed.includes(personId);
}

/** 助理確認保留（或已改好）原本的排休。 */
export function confirmPreLeaves(approval: DemandApproval, personId: string): DemandApproval {
  if (!approval.reconfirm || approval.reconfirm.confirmed.includes(personId)) return approval;
  return { ...approval, reconfirm: { ...approval.reconfirm, confirmed: [...approval.reconfirm.confirmed, personId] } };
}

/** 最高管理者直接用系統目前算的人數核定並發布，不經排班者送審（收回過的話，原本的排休照常有效）。 */
export function approveAndRelease(month: string, demands: DemandList, now: string, previous?: DemandApproval): DemandApproval {
  const next: DemandApproval = {
    month,
    status: "approved",
    totals: totalsOf(month, demands),
    approvedAt: now,
    ...releaseState(previous),
    releasedAt: previous?.releasedAt ?? now,
  };
  delete next.releaseRevokedAt;
  delete next.releaseRevokeReason;
  return next;
}

/** 送出後人數有變動的診（新增、移除或人數不同），依日期與班別排序。 */
export function demandMismatches(approval: DemandApproval, demands: DemandList): DemandMismatch[] {
  const current = new Map(
    demands
      .filter((demand) => demand.date.startsWith(approval.month))
      .map((demand) => [sessionKey(demand.date, demand.shiftId), demand]),
  );
  const keys = new Set([...Object.keys(approval.totals), ...current.keys()]);
  return [...keys]
    .sort()
    .flatMap((key) => {
      const approved = approval.totals[key];
      const now = current.get(key)?.total;
      if (approved === now) return [];
      const [date, shiftId] = [key.slice(0, 10), key.slice(11)];
      return [{ date, shiftId, approved, current: now }];
    });
}

/** 助理看到的排休階段：人數還沒發布或暫停排休時不開放；日期已過截止就是截止。 */
export function assistantLeavePhase(phase: MonthPhase, released: boolean, paused = false): MonthPhase {
  if (phase === "closed") return phase;
  return released && !paused ? phase : "notOpen";
}

export interface WorkflowInput {
  demandStatus: DemandStatus | undefined;
  demandReleased: boolean;
  demandMismatchCount: number;
  /** 依日期算的排休階段（尚未考慮人數是否發布）。 */
  leavePhase: MonthPhase;
  publication: PublicationStatus;
  /** 班表審核；沒有＝還沒送審。 */
  review?: ScheduleReview | null;
}

export function isStepDone(step: WorkflowStepId, input: WorkflowInput): boolean {
  const fresh = input.demandMismatchCount === 0;
  switch (step) {
    case "demand":
      return (input.demandStatus === "submitted" || input.demandStatus === "approved") && fresh;
    case "review":
      return input.demandStatus === "approved" && fresh;
    case "release":
      return input.demandReleased;
    case "leaveClosed":
      return input.leavePhase === "closed";
    // 已經預公告過的月份（含加這兩步之前的）照舊算完成。
    case "schedule":
      return input.publication !== "draft" || reviewSubmitted(input.review);
    case "clerkCheck":
      return input.publication !== "draft" || clerkDone(input.review);
    case "ownerCheck":
      return input.publication !== "draft" || reviewApproved(input.review);
    case "confirm":
    case "publish":
      return input.publication === "published";
  }
}

/**
 * 照順序走（使用者 2026-10-25 決定）：目前那一步（current）可以做；
 * 已完成的步驟（done）只能看，要改先「退回到這一步」；還沒輪到的（locked）不能點，最高管理者可以預覽、只能看。
 */
export type StepAccess = "current" | "done" | "locked";

export function stepAccess(step: WorkflowStepId, input: WorkflowInput): StepAccess {
  const current = currentStep(input);
  if (step === current) return "current";
  const index = WORKFLOW_STEPS.findIndex((item) => item.id === step);
  const currentIndex = WORKFLOW_STEPS.findIndex((item) => item.id === current);
  return index < currentIndex || isStepDone(step, input) ? "done" : "locked";
}

/** 目前該做的步驟：第一個未完成的；全部完成時停在「公告」。 */
export function currentStep(input: WorkflowInput): WorkflowStepId {
  return WORKFLOW_STEPS.find((step) => !isStepDone(step.id, input))?.id ?? "publish";
}
