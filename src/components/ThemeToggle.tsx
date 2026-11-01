"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Segmented } from "./Segmented";

/**
 * 白天／夜間模式（使用者 2026-10-27）：預設「自動」＝跟著手機或電腦的設定；也可固定白天或夜間。
 * 選擇記在這台裝置（畫面偏好，不含在 JSON 匯出），放在 html 的 data-theme；顏色在 globals.css。
 * 開網頁時 layout.tsx 的小段程式先套用，避免一打開閃一下白畫面；同一台裝置的分頁（含手機預覽）一起換。
 */
export type ThemeChoice = "auto" | "light" | "dark";

export const THEME_KEY = "clinic-schedule-workshop:theme:v1";

const OPTIONS = [
  ["auto", "自動"],
  ["light", "白天"],
  ["dark", "夜間"],
] as const;

/** 開網頁時（React 之前）執行；內容要和 applyTheme 一致。 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

function applyTheme(choice: ThemeChoice) {
  if (choice === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "auto") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // 存不了（例如無痕模式）：這次照樣換，重新整理後回到自動。
  }
  applyTheme(choice);
  listeners.forEach((listener) => listener());
}

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, read, () => "auto" as ThemeChoice);
  // 別的分頁或手機預覽改了模式：這一頁跟著換。
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_KEY && event.key !== null) return;
      applyTheme(read());
      listeners.forEach((listener) => listener());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return (
    <div className="theme-toggle">
      <span>畫面</span>
      <Segmented options={OPTIONS} value={choice} onChange={setTheme} label="白天或夜間模式" />
    </div>
  );
}
