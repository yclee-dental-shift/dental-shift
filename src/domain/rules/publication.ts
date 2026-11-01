import { addDays } from "../dates";
import type { CoursePerson, ScheduleEntry, ShiftDefinition } from "../types";

/** 班表公告狀態：draft 排班中 → preannounced 預公告（助理確認中）→ published 正式公告（鎖定）；可撤回到 draft。 */
export type PublicationStatus = "draft" | "preannounced" | "published";

export const ISSUE_KINDS = ["想換班", "想休假", "其他"] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export interface ScheduleIssue {
  date: string;
  /** 沒有指定時代表整天。 */
  shiftId?: string;
  kind: IssueKind;
}

export interface AssistantResponse {
  status: "confirmed" | "issue";
  at: string;
  issues: ScheduleIssue[];
}

export interface MonthPublication {
  month: string;
  status: PublicationStatus;
  preannouncedAt?: string;
  /** 確認期限 "YYYY-MM-DDTHH:mm"。 */
  confirmDeadline?: string;
  publishedAt?: string;
  responses: Record<string, AssistantResponse>;
  /** 最近一次撤回（預公告或正式公告）回到排班中的時間與原因；舊資料沒有這些欄位。 */
  withdrawnAt?: string;
  withdrawnFrom?: "preannounced" | "published";
  withdrawReason?: string;
}

export function emptyPublication(month: string): MonthPublication {
  return { month, status: "draft", responses: {} };
}

/**
 * 確認期限：預公告「隔天起第一個有醫師看診的日子」最後一診結束時間；
 * 14 天內都沒有看診就用隔天最晚一診的結束時間。
 */
export function confirmDeadlineFor(
  preannounceDate: string,
  entries: ScheduleEntry[],
  people: CoursePerson[],
  shifts: ShiftDefinition[],
): string {
  const doctors = new Set(people.filter((person) => person.role === "doctor").map((person) => person.id));
  const endOf = new Map(shifts.map((shift) => [shift.id, shift.end]));
  const latest = [...shifts].sort((a, b) => a.end.localeCompare(b.end)).at(-1)?.end ?? "23:59";
  for (let offset = 1; offset <= 14; offset += 1) {
    const date = addDays(preannounceDate, offset);
    const ends = entries
      .filter((entry) => entry.date === date && entry.state === "shift" && doctors.has(entry.personId))
      .map((entry) => endOf.get(entry.shiftId ?? "") ?? "")
      .filter(Boolean)
      .sort();
    if (ends.length > 0) return `${date}T${ends.at(-1)}`;
  }
  return `${addDays(preannounceDate, 1)}T${latest}`;
}

export function preannounce(publication: MonthPublication, now: string, deadline: string): MonthPublication {
  return { ...publication, status: "preannounced", preannouncedAt: now, confirmDeadline: deadline, responses: {} };
}

/** 撤回預公告或正式公告，回到排班中；助理的確認與問題清掉，下次預公告時重新確認。 */
export function withdrawPublication(publication: MonthPublication, now: string, reason = ""): MonthPublication {
  if (publication.status === "draft") return publication;
  return {
    month: publication.month,
    status: "draft",
    responses: {},
    withdrawnAt: now,
    withdrawnFrom: publication.status,
    ...(reason.trim() ? { withdrawReason: reason.trim() } : {}),
  };
}

export function publish(publication: MonthPublication, now: string): MonthPublication {
  return { ...publication, status: "published", publishedAt: now };
}

export function canRespond(publication: MonthPublication, now: string): boolean {
  return publication.status === "preannounced" && !!publication.confirmDeadline && now <= publication.confirmDeadline;
}

/** 這位助理還要確認（預公告中、未過期限、還沒回覆）的月份數。 */
export function pendingConfirmCount(publications: MonthPublication[], personId: string, now: string): number {
  return publications.filter((publication) => canRespond(publication, now) && !publication.responses[personId]).length;
}

/** 助理確認或提出問題；超過期限或不在預公告階段時不變。 */
export function respond(
  publication: MonthPublication,
  personId: string,
  response: AssistantResponse,
  now: string,
): MonthPublication {
  if (!canRespond(publication, now)) return publication;
  return { ...publication, responses: { ...publication.responses, [personId]: response } };
}

export interface ResponseSummary {
  confirmed: string[];
  issues: string[];
  /** 尚未回覆、還在期限內。 */
  pending: string[];
  /** 超過期限未回覆，視同接受。 */
  expired: string[];
}

export function summarizeResponses(publication: MonthPublication, assistantIds: string[], now: string): ResponseSummary {
  const summary: ResponseSummary = { confirmed: [], issues: [], pending: [], expired: [] };
  assistantIds.forEach((id) => {
    const response = publication.responses[id];
    if (response?.status === "confirmed") summary.confirmed.push(id);
    else if (response?.status === "issue") summary.issues.push(id);
    else if (canRespond(publication, now)) summary.pending.push(id);
    else summary.expired.push(id);
  });
  return summary;
}
