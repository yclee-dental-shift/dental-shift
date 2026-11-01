import { REASON_MAX_LENGTH, reasonCategories } from "@/config/leave-reason.config";

/**
 * 排休（整天）與「指定診次不排」的理由：大項目＋文字理由。
 * 與班表文件分開存放，不改變班表資料格式。
 */
export interface LeaveReason {
  personId: string;
  date: string;
  category: string;
  text: string;
  /** 填寫時間（ISO 字串）。 */
  at: string;
}

export type LeaveReasons = Record<string, LeaveReason>;

export const dayReasonKey = (date: string, personId: string) => `day:${date}_${personId}`;
export const shiftReasonKey = (date: string, personId: string, shiftId: string) => `shift:${date}_${personId}_${shiftId}`;

/** 檢查並整理輸入；大項目不在清單或文字空白時回傳 null。 */
export function normalizeReason(category: string, text: string): { category: string; text: string } | null {
  const trimmed = text.trim().slice(0, REASON_MAX_LENGTH);
  if (!reasonCategories.some((item) => item.id === category) || trimmed.length === 0) return null;
  return { category, text: trimmed };
}

export function setReason(
  reasons: LeaveReasons,
  key: string,
  reason: { personId: string; date: string; category: string; text: string },
  at: string,
): LeaveReasons {
  return { ...reasons, [key]: { ...reason, at } };
}

export function removeReason(reasons: LeaveReasons, key: string): LeaveReasons {
  if (!(key in reasons)) return reasons;
  const next = { ...reasons };
  delete next[key];
  return next;
}

export function formatReason(reason: Pick<LeaveReason, "category" | "text">): string {
  return `${reason.category}｜${reason.text}`;
}

/** 某人最近填過的理由（同樣的文字只列一次），讓助理下次直接點選。 */
export function recentReasons(reasons: LeaveReasons, personId: string, limit = 5): Array<Pick<LeaveReason, "category" | "text">> {
  const seen = new Set<string>();
  const result: Array<Pick<LeaveReason, "category" | "text">> = [];
  Object.values(reasons)
    .filter((reason) => reason.personId === personId)
    .sort((a, b) => b.at.localeCompare(a.at))
    .forEach((reason) => {
      const id = formatReason(reason);
      if (seen.has(id) || result.length >= limit) return;
      seen.add(id);
      result.push({ category: reason.category, text: reason.text });
    });
  return result;
}
