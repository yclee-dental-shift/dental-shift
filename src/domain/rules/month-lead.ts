import { staffDirectory } from "../../config/staff-directory";

/**
 * 每月排班負責人（使用者 2026-10-27 決定，見 `docs/permissions-plan.md`）：
 * - 助理長指定這個月由誰排班：助理長自己或其中一位組長；沒指定的月份＝助理長。
 * - 負責人這個月有排班的全部權限（人數與班表仍要最高管理者確認）。
 * - 不是負責人的助理長、組長：班表只能看，自己的排休照助理的規則；助理長仍可改「誰負責」。
 * - 同事的假別與事由只有最高管理者、行政專員與這個月的負責人看得到。
 * 伺服器（`server/permissions.ts`、`server/data-api.ts`）與畫面共用這裡的判斷。
 */

/** 登入者的身分：最高管理者、助理長、組長、行政專員、助理。 */
export type StaffRole = "owner" | "lead" | "leader" | "clerk" | "assistant";

export interface MonthLead {
  /** 負責人的人員代號（助理長或組長）。 */
  personId: string;
  /** 指定時間 YYYY-MM-DDTHH:mm。 */
  at: string;
  /** 誰指定的（姓名）。 */
  by: string;
}

export type MonthLeads = Record<string, MonthLead>;

export interface RoleHolder {
  role: StaffRole;
  personId?: string;
}

/** 可以當排班負責人的人：名單上的助理長、組長（要在班表上）。 */
export const LEAD_CANDIDATES = staffDirectory
  .filter((staff) => (staff.title === "助理長" || staff.title === "組長") && staff.personId)
  .map((staff) => ({ personId: staff.personId as string, name: staff.name, title: staff.title }));

const isCandidate = (personId: string) => LEAD_CANDIDATES.some((candidate) => candidate.personId === personId);

/** 這個月實際的負責人代號：有指定（而且還是助理長或組長）用指定的；否則＝助理長（沒有助理長時 null）。 */
export function monthLeadOf(lead: MonthLead | null | undefined): string | null {
  if (lead && isCandidate(lead.personId)) return lead.personId;
  return LEAD_CANDIDATES.find((candidate) => candidate.title === "助理長")?.personId ?? null;
}

/** 是不是這個月的排班負責人。 */
export function isMonthLead(viewer: RoleHolder, lead: MonthLead | null | undefined): boolean {
  if (viewer.role !== "lead" && viewer.role !== "leader") return false;
  return !!viewer.personId && monthLeadOf(lead) === viewer.personId;
}

/** 能改這個月的排班（最高管理者或這個月的負責人）。 */
export const managesMonth = (viewer: RoleHolder, lead: MonthLead | null | undefined) =>
  viewer.role === "owner" || isMonthLead(viewer, lead);

/** 看得到這個月所有人的假別、事由與班表確認回覆。 */
export const seesAllOfMonth = (viewer: RoleHolder, lead: MonthLead | null | undefined) =>
  viewer.role === "owner" || viewer.role === "clerk" || isMonthLead(viewer, lead);

/** 能指定負責人：最高管理者、助理長。 */
export const canAssignLead = (viewer: RoleHolder) => viewer.role === "owner" || viewer.role === "lead";

export function isMonthLeadValue(value: unknown): value is MonthLead {
  if (!value || typeof value !== "object") return false;
  const { personId, at, by } = value as Record<string, unknown>;
  return typeof personId === "string" && isCandidate(personId) && typeof at === "string" && at.length <= 40 && typeof by === "string" && by.length <= 40;
}
