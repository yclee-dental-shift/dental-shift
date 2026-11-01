"use client";

import { readLaborTargets, saveLaborTarget, subscribeLaborTargets, type LaborTargets } from "@/data/labor-target-store";
import type { TargetHours } from "@/domain/rules/labor-hours";
import { useSyncExternalStore } from "react";

const EMPTY: LaborTargets = {};

/** 每月目標工時的手動設定（小時）。 */
export function useLaborTargets() {
  const targets = useSyncExternalStore(subscribeLaborTargets, readLaborTargets, () => EMPTY);
  const setTarget = (month: string, target: TargetHours | undefined) => {
    if (!saveLaborTarget(month, target)) window.alert("無法儲存（瀏覽器不允許寫入）。");
  };
  return { targets, setTarget };
}
