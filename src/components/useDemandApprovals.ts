"use client";

import {
  readDemandApprovals,
  removeDemandApprovals,
  saveDemandApproval,
  subscribeDemandApprovals,
} from "@/data/demand-approval-store";
import type { DemandApproval } from "@/domain/rules/workflow";
import { useSyncExternalStore } from "react";

const EMPTY: Record<string, DemandApproval> = {};

export function useDemandApprovals() {
  const approvals = useSyncExternalStore(subscribeDemandApprovals, readDemandApprovals, () => EMPTY);
  return { approvals, saveDemandApproval, removeDemandApprovals };
}
