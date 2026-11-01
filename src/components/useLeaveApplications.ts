"use client";

import { readLeaveApplications, saveLeaveApplications, subscribeLeaveApplications } from "@/data/leave-application-store";
import type { LeaveApplications } from "@/domain/rules/leave-application";
import { useSyncExternalStore } from "react";

const EMPTY: LeaveApplications = {};

export function useLeaveApplications() {
  const stored = useSyncExternalStore(subscribeLeaveApplications, readLeaveApplications, () => EMPTY);
  return { stored, saveLeaveApplications };
}
