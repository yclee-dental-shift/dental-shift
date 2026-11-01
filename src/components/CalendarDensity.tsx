"use client";

import { useSyncExternalStore } from "react";

/**
 * 月曆的 3 種顯示密度（使用者 2026-10-26，照 iPhone 行事曆）：
 * 堆疊＝每一診一條色條；詳細＝色條上寫字；清單＝每天一條小彩條。
 * 使用者 2026-11-01：拿掉「精簡」（和清單幾乎一樣），色條改叫堆疊、文字改叫詳細；三種都是點日期在月曆下面列出那天，不跳到單日。
 * 右上角按鈕一次換下一種；選擇記在這台裝置（畫面偏好，不含在 JSON 匯出；以前選精簡的回到預設）。
 */
export type CalendarDensity = "bars" | "text" | "list";

export const DENSITIES: { id: CalendarDensity; label: string }[] = [
  { id: "bars", label: "堆疊" },
  { id: "text", label: "詳細" },
  { id: "list", label: "清單" },
];

/** 助理月曆、管理者手機月曆各記各的。 */
export type DensityScope = "assistant" | "board";

const KEY = "clinic-schedule-workshop:calendar-density:v1";
const DEFAULT: CalendarDensity = "text";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cached: Partial<Record<DensityScope, CalendarDensity>> = {};

function read(): Partial<Record<DensityScope, CalendarDensity>> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cached = parsed && typeof parsed === "object" ? (parsed as Partial<Record<DensityScope, CalendarDensity>>) : {};
    } catch {
      cached = {};
    }
  }
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCalendarDensity(scope: DensityScope): [CalendarDensity, () => void] {
  const stored = useSyncExternalStore(subscribe, () => read()[scope], () => undefined);
  const density = DENSITIES.some((item) => item.id === stored) ? stored! : DEFAULT;
  const next = () => {
    const index = DENSITIES.findIndex((item) => item.id === density);
    const value = DENSITIES[(index + 1) % DENSITIES.length].id;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...read(), [scope]: value }));
    } catch {
      // 無法記住也沒關係，這次照樣切換；下次打開回到預設。
      cached = { ...cached, [scope]: value };
    }
    listeners.forEach((listener) => listener());
  };
  return [density, next];
}

/** 每種密度的小圖示（線條，跟著文字顏色）。 */
function DensityIcon({ density }: { density: CalendarDensity }) {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      {density === "bars" && (
        <>
          <rect x="2" y="2.5" width="18" height="4.5" rx="2.25" />
          <rect x="2" y="9" width="18" height="4.5" rx="2.25" />
        </>
      )}
      {density === "text" && (
        <>
          <rect x="2" y="1.5" width="18" height="13" rx="2.5" />
          <path d="M5.5 6h11M5.5 10h7" />
        </>
      )}
      {density === "list" && (
        <>
          <rect x="2" y="1.5" width="18" height="6" rx="2" />
          <path d="M3 11h16M3 14.5h11" />
        </>
      )}
    </svg>
  );
}

export function DensityButton({ density, onNext }: { density: CalendarDensity; onNext(): void }) {
  const label = DENSITIES.find((item) => item.id === density)?.label;
  return (
    <button
      type="button"
      className="density-button"
      data-view-control
      aria-label={`月曆顯示：${label}（點一下換下一種）`}
      title="換月曆顯示方式"
      onClick={onNext}
    >
      <DensityIcon density={density} />
      <span>{label}</span>
    </button>
  );
}
