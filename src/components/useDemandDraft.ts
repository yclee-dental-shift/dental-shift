"use client";

import { saveDemandAdjustments } from "@/data/demand-adjustment-store";
import { saveDoctorSchedule } from "@/data/doctor-schedule-store";
import { setDemandAdjustment, type DemandAdjustments } from "@/domain/rules/assistant-demand";
import { describeAdjustmentChanges, describeDoctorScheduleChanges, type DraftChange } from "@/domain/rules/demand-draft";
import type { DoctorScheduleConfig } from "@/domain/rules/doctor-schedule";
import { useEffect, useMemo, useSyncExternalStore } from "react";

/**
 * 「醫師與人數」整頁草稿：醫師班表與人數手動調整先改在這裡，按「儲存」才寫入瀏覽器。
 * 草稿只在這次開著的畫面裡（換頁不會消失，重新整理或關掉會消失，離開前會提醒）。
 */
interface Draft {
  config: DoctorScheduleConfig;
  adjustments: DemandAdjustments;
}
let draft: Draft | null = null;
const listeners = new Set<() => void>();
const setDraft = (next: Draft | null) => {
  draft = next;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export interface DemandDraft {
  /** 畫面上要顯示的醫師班表與調整（有草稿就用草稿）。 */
  config: DoctorScheduleConfig;
  adjustments: DemandAdjustments;
  /** 和上次儲存不同的地方；空的＝沒有未儲存的修改。 */
  changes: DraftChange[];
  dirty: boolean;
  setConfig(config: DoctorScheduleConfig): void;
  setAdjustment(key: string, adjustment: number, ruleTotal: number): void;
  /** 寫入瀏覽器；失敗回傳 false。 */
  save(): boolean;
  discard(): void;
}

export function useDemandDraft(savedConfig: DoctorScheduleConfig, savedAdjustments: DemandAdjustments): DemandDraft {
  const current = useSyncExternalStore(subscribe, () => draft, () => null);
  const config = current?.config ?? savedConfig;
  const adjustments = current?.adjustments ?? savedAdjustments;
  const changes = useMemo(
    () => [...describeDoctorScheduleChanges(savedConfig, config), ...describeAdjustmentChanges(savedAdjustments, adjustments)],
    [savedConfig, config, savedAdjustments, adjustments],
  );
  const dirty = changes.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return {
    config,
    adjustments,
    changes,
    dirty,
    setConfig: (next) => setDraft({ config: next, adjustments }),
    setAdjustment: (key, adjustment, ruleTotal) =>
      setDraft({ config, adjustments: setDemandAdjustment(adjustments, key, adjustment, ruleTotal) }),
    save: () => {
      if (!saveDoctorSchedule(config) || !saveDemandAdjustments(adjustments)) return false;
      setDraft(null);
      return true;
    },
    discard: () => setDraft(null),
  };
}
