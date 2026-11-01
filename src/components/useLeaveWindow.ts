"use client";

import { leaveWindow } from "@/config/leave.config";
import { readTimelineOverrides, saveTimelineOverrides, subscribeTimelineOverrides } from "@/data/month-timeline-store";
import type { TimelineOverrides } from "@/domain/rules/month-timeline";
import { closedEarlyMonths } from "@/domain/rules/workflow";
import { useMemo, useSyncExternalStore } from "react";
import { useDemandApprovals } from "./useDemandApprovals";

const EMPTY: Record<string, TimelineOverrides> = {};

/** 排休時程設定＝通則＋每月排班日程的手動調整＋提早截止的月份；所有算排休階段的地方都用這個。 */
export function useLeaveWindow() {
  const overrides = useSyncExternalStore(subscribeTimelineOverrides, readTimelineOverrides, () => EMPTY);
  const { approvals } = useDemandApprovals();
  const closedEarly = useMemo(() => closedEarlyMonths(approvals), [approvals]);
  const settings = useMemo(() => ({ ...leaveWindow, overrides, closedEarly }), [overrides, closedEarly]);
  const saveMonth = (month: string, next: TimelineOverrides) => {
    if (!saveTimelineOverrides(month, next)) window.alert("無法儲存（瀏覽器不允許寫入）。");
  };
  return { settings, saveMonth };
}
