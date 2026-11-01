"use client";

import { readDemandAdjustments, saveDemandAdjustments, subscribeDemandAdjustments } from "@/data/demand-adjustment-store";
import { adjustmentMap, setDemandAdjustment, type DemandAdjustments } from "@/domain/rules/assistant-demand";
import { useMemo, useSyncExternalStore } from "react";

const EMPTY: DemandAdjustments = {};

/** 推算人數的手動調整；adjustments 是給 evaluateSessionDemand 用的 Map，record 是存的原始資料。 */
export function useDemandAdjustments() {
  const record = useSyncExternalStore(subscribeDemandAdjustments, readDemandAdjustments, () => EMPTY);
  const adjustments = useMemo(() => adjustmentMap(record), [record]);
  const setAdjustment = (key: string, adjustment: number, ruleTotal: number) => {
    if (!saveDemandAdjustments(setDemandAdjustment(readDemandAdjustments(), key, adjustment, ruleTotal))) {
      window.alert("無法儲存（瀏覽器不允許寫入）。");
    }
  };
  return { adjustments, record, setAdjustment };
}
