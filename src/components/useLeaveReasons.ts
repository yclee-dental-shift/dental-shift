"use client";

import { readLeaveReasons, saveLeaveReasons, subscribeLeaveReasons } from "@/data/leave-reason-store";
import type { LeaveReasons } from "@/domain/rules/leave-reason";
import { useSyncExternalStore } from "react";

const EMPTY: LeaveReasons = {};

/** 事由功能開關。改存雲端之前，要先做好登入與權限（事由只給本人與管理者看）。 */
export const leaveReasonsEnabled = true;

export function useLeaveReasons() {
  const reasons = useSyncExternalStore(subscribeLeaveReasons, readLeaveReasons, () => EMPTY);
  return { reasons, saveLeaveReasons, enabled: leaveReasonsEnabled };
}
