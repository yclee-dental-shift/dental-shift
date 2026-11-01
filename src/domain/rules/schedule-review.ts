/**
 * 班表審核（使用者 2026-10-27 決定，見 `docs/permissions-plan.md` 第二段）：
 * 排班 → 行政檢查 → 最高管理者確認班表 → 才能預公告。
 *
 * - 負責人「送行政檢查」→ clerk（等行政專員看）。
 * - 行政專員「提出建議」→ revise（不是退回、不鎖班表，只是通知負責人）；或「檢查沒問題」→ clerkOk。
 * - 負責人每則建議都要回覆（已調整／說明原因），回覆完「請行政再看一次」→ clerk，可以來回多次。
 * - 行政沒問題後，負責人寫「說明」（必填）「送最高管理者確認」→ owner；同時記下當時的助理班表（snapshot），之後改過哪幾格看得出來。
 * - 最高管理者「同意」→ approved（才能預公告），或「退回」（原因必填）→ returned（重新經過行政檢查）。
 * - 負責人隨時可以「撤回送審」→ editing（回到排班）。
 * 伺服器（`server/permissions.ts` 的 `checkReviewWrite`）與畫面共用這裡的規則。
 */

export type ReviewStatus = "editing" | "clerk" | "revise" | "clerkOk" | "owner" | "approved" | "returned";

export interface ReviewReply {
  kind: "adjusted" | "explained";
  text: string;
  at: string;
  by: string;
}

export interface ReviewSuggestion {
  id: string;
  at: string;
  by: string;
  text: string;
  /** 指出哪一天（選填）。 */
  date?: string;
  /** 指出哪一位（選填）。 */
  personId?: string;
  reply?: ReviewReply;
}

export interface ReviewLogItem {
  at: string;
  by: string;
  action: ReviewAction;
  text?: string;
}

export type ReviewAction = "sendToClerk" | "suggest" | "clerkOk" | "recheck" | "sendToOwner" | "approve" | "return" | "withdraw";

export interface ScheduleReview {
  month: string;
  status: ReviewStatus;
  suggestions: ReviewSuggestion[];
  /** 給最高管理者的說明（送確認時必填）。 */
  ownerNote?: string;
  /** 送最高管理者確認時的助理班表（`snapshotOf`）。 */
  snapshot?: string[];
  returnReason?: string;
  /** 每一次動作（只會往後加）。 */
  log: ReviewLogItem[];
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  editing: "排班中",
  clerk: "等行政檢查",
  revise: "行政提出建議",
  clerkOk: "行政檢查沒問題",
  owner: "等最高管理者確認",
  approved: "最高管理者已同意",
  returned: "最高管理者退回",
};

export const MAX_SUGGESTION_TEXT = 300;
export const MAX_NOTE_TEXT = 1000;

/** 已經送出審核（排班這一步算完成）。 */
export const reviewSubmitted = (review: ScheduleReview | null | undefined) =>
  !!review && review.status !== "editing" && review.status !== "returned";
/** 行政檢查這一步算完成。 */
export const clerkDone = (review: ScheduleReview | null | undefined) =>
  !!review && (review.status === "clerkOk" || review.status === "owner" || review.status === "approved");
export const reviewApproved = (review: ScheduleReview | null | undefined) => review?.status === "approved";
export const allReplied = (review: ScheduleReview | null | undefined) => (review?.suggestions ?? []).every((item) => !!item.reply);

const empty = (month: string): ScheduleReview => ({ month, status: "editing", suggestions: [], log: [] });
const step = (review: ScheduleReview, status: ReviewStatus, item: ReviewLogItem, patch: Partial<ScheduleReview> = {}): ScheduleReview => ({
  ...review,
  ...patch,
  status,
  log: [...review.log, item],
});

/** 負責人送行政檢查（第一次、撤回或被退回之後）。 */
export function sendToClerk(review: ScheduleReview | null, month: string, now: string, by: string): ScheduleReview {
  return step(review ?? empty(month), "clerk", { at: now, by, action: "sendToClerk" });
}

/** 行政專員提出建議（可以一次好幾則）。 */
export function addSuggestions(
  review: ScheduleReview,
  items: Array<Pick<ReviewSuggestion, "text" | "date" | "personId">>,
  now: string,
  by: string,
): ScheduleReview {
  const added = items
    .map((item, index) => ({
      id: `${now}-${review.suggestions.length + index + 1}`,
      at: now,
      by,
      text: item.text.trim().slice(0, MAX_SUGGESTION_TEXT),
      ...(item.date ? { date: item.date } : {}),
      ...(item.personId ? { personId: item.personId } : {}),
    }))
    .filter((item) => item.text);
  return step(review, "revise", { at: now, by, action: "suggest", text: `${added.length} 則` }, { suggestions: [...review.suggestions, ...added] });
}

/** 行政專員刪掉還沒被回覆的建議（寫錯時）。 */
export function removeSuggestion(review: ScheduleReview, id: string): ScheduleReview {
  return { ...review, suggestions: review.suggestions.filter((item) => item.id !== id || !!item.reply) };
}

export function clerkApprove(review: ScheduleReview, now: string, by: string): ScheduleReview {
  return step(review, "clerkOk", { at: now, by, action: "clerkOk" });
}

/** 負責人回覆一則建議（可以改回覆）。 */
export function replySuggestion(review: ScheduleReview, id: string, reply: Omit<ReviewReply, "text"> & { text: string }): ScheduleReview {
  return {
    ...review,
    suggestions: review.suggestions.map((item) =>
      item.id === id ? { ...item, reply: { ...reply, text: reply.text.trim().slice(0, MAX_SUGGESTION_TEXT) } } : item,
    ),
  };
}

/** 回覆完，請行政再看一次。 */
export function askRecheck(review: ScheduleReview, now: string, by: string): ScheduleReview {
  return step(review, "clerk", { at: now, by, action: "recheck" });
}

export function sendToOwner(review: ScheduleReview, note: string, snapshot: string[], now: string, by: string): ScheduleReview {
  return step(review, "owner", { at: now, by, action: "sendToOwner" }, { ownerNote: note.trim().slice(0, MAX_NOTE_TEXT), snapshot });
}

export function ownerApprove(review: ScheduleReview, now: string, by: string): ScheduleReview {
  return step(review, "approved", { at: now, by, action: "approve" });
}

export function ownerReturn(review: ScheduleReview, reason: string, now: string, by: string): ScheduleReview {
  const text = reason.trim().slice(0, MAX_NOTE_TEXT);
  return step(review, "returned", { at: now, by, action: "return", text }, { returnReason: text });
}

export function withdrawReview(review: ScheduleReview, now: string, by: string): ScheduleReview {
  return step(review, "editing", { at: now, by, action: "withdraw" });
}

/** 一個月的助理班表（排班與休假），用來比對送確認之後改了哪幾格。 */
export function snapshotOf(
  entries: Array<{ id: string; date: string; personId: string; state: string; shiftId?: string }>,
  month: string,
  assistantIds: Set<string>,
): string[] {
  return entries
    .filter((entry) => entry.date.startsWith(month) && assistantIds.has(entry.personId))
    .map((entry) => `${entry.date}_${entry.personId}_${entry.state === "leave" ? "休" : (entry.shiftId ?? "")}`)
    .sort();
}

/** 送確認之後新增、拿掉的格子（`日期_人員_班別或休`）。 */
export function snapshotChanges(before: string[] | undefined, now: string[]): { added: string[]; removed: string[] } {
  if (!before) return { added: [], removed: [] };
  const old = new Set(before);
  const current = new Set(now);
  return { added: now.filter((key) => !old.has(key)), removed: before.filter((key) => !current.has(key)) };
}

/** 動作的名稱（紀錄用）。 */
export const ACTION_LABELS: Record<ReviewAction, string> = {
  sendToClerk: "送行政檢查",
  suggest: "行政提出建議",
  clerkOk: "行政檢查沒問題",
  recheck: "請行政再看一次",
  sendToOwner: "送最高管理者確認",
  approve: "最高管理者同意",
  return: "最高管理者退回",
  withdraw: "撤回送審",
};

/** 誰的待辦：負責人、行政專員、最高管理者各自要處理的月份。 */
export function reviewTodo(review: ScheduleReview | null | undefined, who: "lead" | "clerk" | "owner"): string | null {
  if (!review) return null;
  if (who === "clerk" && review.status === "clerk") return "班表等你檢查";
  if (who === "owner" && review.status === "owner") return "班表等你確認";
  if (who === "lead") {
    if (review.status === "revise") return `行政提出 ${review.suggestions.filter((item) => !item.reply).length || review.suggestions.length} 則建議`;
    if (review.status === "clerkOk") return "行政檢查沒問題，可以送最高管理者確認";
    if (review.status === "returned") return "最高管理者退回班表";
  }
  return null;
}

type Role = "owner" | "lead" | "leader" | "clerk" | "assistant";

/** 不分欄位順序的比較用字串。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const LEAD_MOVES: Record<string, ReviewStatus[]> = {
  none: ["clerk"],
  editing: ["clerk"],
  returned: ["clerk", "editing"],
  clerk: ["clerk", "editing"],
  revise: ["revise", "clerk", "editing"],
  clerkOk: ["clerkOk", "owner", "editing"],
  owner: ["editing"],
  approved: ["editing"],
};
const CLERK_MOVES: Record<string, ReviewStatus[]> = {
  clerk: ["revise", "clerkOk"],
  revise: ["revise", "clerkOk"],
};

/**
 * 伺服器檢查一筆班表審核的修改（最高管理者不檢查）。lead＝這個月的排班負責人。
 * 回傳錯誤訊息，或 null＝可以。
 */
export function checkReviewWrite(before: ScheduleReview | null, after: Record<string, unknown>, role: Role, isLead: boolean): string | null {
  const next = after as unknown as ScheduleReview;
  const from = before?.status ?? "none";
  const prior = before ?? empty(next.month);
  // 紀錄只能往後加。
  if (!Array.isArray(next.log) || canonical(next.log.slice(0, prior.log.length)) !== canonical(prior.log)) return "審核紀錄不能改";
  if (!Array.isArray(next.suggestions)) return "建議格式不對";
  const withoutReply = (item: ReviewSuggestion) => ({ ...item, reply: undefined });
  if (role === "clerk") {
    if (!(CLERK_MOVES[from] ?? []).includes(next.status)) return "現在不能檢查這份班表";
    const kept = new Map(next.suggestions.map((item) => [item.id, item]));
    // 已回覆的不能刪、不能改；沒回覆的可以刪；新的不能帶回覆。
    for (const item of prior.suggestions) {
      const now = kept.get(item.id);
      if (!now) {
        if (item.reply) return "已回覆的建議不能刪";
      } else if (canonical(now) !== canonical(item)) return "建議送出後不能改";
    }
    if (next.suggestions.some((item) => !prior.suggestions.some((old) => old.id === item.id) && item.reply)) return "行政專員不能回覆建議";
    if (canonical({ ...next, status: null, suggestions: null, log: null }) !== canonical({ ...prior, status: null, suggestions: null, log: null })) {
      return "行政專員只能提出建議或確認沒問題";
    }
    return null;
  }
  if ((role === "lead" || role === "leader") && isLead) {
    if (!(LEAD_MOVES[from] ?? []).includes(next.status)) return next.status === "approved" || next.status === "returned" ? "班表要由最高管理者確認" : "現在不能這樣送審";
    if (canonical(next.suggestions.map(withoutReply)) !== canonical(prior.suggestions.map(withoutReply))) return "負責人只能回覆建議，不能改建議內容";
    if ((next.status === "owner" || (next.status === "clerk" && from === "revise")) && !allReplied(next)) return "每則建議都要先回覆";
    if (next.status === "owner" && !next.ownerNote?.trim()) return "送最高管理者確認要寫說明";
    if ((next.returnReason ?? null) !== (prior.returnReason ?? null)) return "退回原因只有最高管理者能寫";
    return null;
  }
  return "只有排班負責人、行政專員與最高管理者能處理班表審核";
}
