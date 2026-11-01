/**
 * 手機或電腦設定「減少動態效果」時（使用者 2026-11-01，照 Apple HIG）：程式裡的捲動、晃動也一起停。
 * CSS 的動畫在 globals.css 最後一段統一關掉；這裡給程式用。
 */
export function reduceMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** 捲動到某處：一般平滑捲過去，減少動態時直接跳過去。 */
export const scrollBehavior = (): ScrollBehavior => (reduceMotion() ? "auto" : "smooth");
