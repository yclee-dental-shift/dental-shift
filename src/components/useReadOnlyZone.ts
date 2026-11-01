"use client";

import { useEffect, useRef } from "react";

const CONTROLS = "button, input, select, textarea";

/**
 * 「只能看」的區塊：把裡面的按鈕、輸入框都停用（照順序走時，不是目前那一步的內容）；
 * 標了 data-view-control 的（切換檢視方式）不停用。
 * 每次畫面更新後重新套用；恢復可以操作時，只解開這裡停用過的（data-readonly-locked），原本就停用的不動。
 */
export function useReadOnlyZone<T extends HTMLElement>(readOnly: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const zone = ref.current;
    if (!zone) return;
    zone.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(CONTROLS).forEach((control) => {
      // 只切換「怎麼看」的控制（例如月曆／班表切換桿）照常可以按。
      if (control.closest("[data-view-control]")) return;
      if (readOnly) {
        if (!control.disabled) {
          control.disabled = true;
          control.dataset.readonlyLocked = "1";
        }
      } else if (control.dataset.readonlyLocked) {
        control.disabled = false;
        delete control.dataset.readonlyLocked;
      }
    });
  });
  return ref;
}
