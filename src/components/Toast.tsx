"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * 存好了的小提示（使用者 2026-11-01，照 Apple HIG：操作完要有回饋）：畫面下方出現一行字，幾秒後自己消失。
 * 例：助理存好排休「已登記 6/12 排休」、送出班表確認「已確認 12 月班表」、管理者按了往前一步的按鈕。
 * 不在畫面元件裡也能叫：`showToast("已送出")`；`<ToastHost />` 放在 AppShell，整個網站只有一個。
 */
type ToastState = { message: string; key: number } | null;

const SHOW_MS = 3500;
let current: ToastState = null;
const listeners = new Set<() => void>();

export function showToast(message: string) {
  current = { message, key: Date.now() };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => current, () => null);
  const [hidden, setHidden] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setHidden(toast.key), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);
  if (!toast || hidden === toast.key) return null;
  return (
    <div key={toast.key} className="app-toast" role="status" aria-live="polite">
      {toast.message}
    </div>
  );
}
