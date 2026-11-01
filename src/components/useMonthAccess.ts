"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readMonthLeads, saveMonthLead, subscribeMonthLeads } from "@/data/month-lead-store";
import { nowString } from "@/domain/dates";
import { canAssignLead, managesMonth, monthLeadOf, type MonthLeads } from "@/domain/rules/month-lead";
import { useViewer } from "./ViewerProvider";

const EMPTY: MonthLeads = {};

/**
 * 每月排班負責人與「這個月能不能改」。
 * 模擬身分不分月份：最高管理者、排班者都當作負責人；行政專員不能改。
 */
export function useMonthAccess() {
  const { member, viewer, acting } = useViewer();
  const leads = useSyncExternalStore(subscribeMonthLeads, readMonthLeads, () => EMPTY);
  // 「用某人的身分看」時照被看的人算（畫面本來就只能看，伺服器照樣只認登入者）。
  const role = acting?.role;
  const personId = acting?.personId;
  const canManage = useCallback(
    (month: string) => (role ? managesMonth({ role, personId }, leads[month]) : viewer !== "clerk"),
    [role, personId, leads, viewer],
  );
  const canAssign = role ? canAssignLead({ role }) : viewer === "owner" || viewer === "scheduler";
  const setLead = (month: string, personId: string | null) => {
    const lead = personId ? { personId, at: nowString(), by: member?.name ?? "模擬身分" } : undefined;
    if (!saveMonthLead(month, lead)) window.alert("無法儲存（瀏覽器不允許寫入）。");
  };
  return { leads, leadOf: (month: string) => monthLeadOf(leads[month]), canManage, canAssign, setLead };
}
