"use client";

import { useState, type RefObject } from "react";

/**
 * 「存成圖片」（使用者 2026-10-25：用截圖留紀錄，取代列印）：把畫面上的一塊（target）存成 PNG。
 * 存圖時暫時加上 .is-capturing：捲動框整個展開、手機也用整張表格；標了 .print-only-hide 的按鈕與流程、按鈕列（.toolbar-actions）不放進圖。
 * 手機能分享檔案的就跳出分享（可直接存到照片或傳 LINE），不能的就直接下載。只在這台裝置處理，不會上傳。
 */
export function SaveImageButton({
  target,
  fileName,
  label = "存成圖片",
  className = "button button-quiet",
}: {
  target: RefObject<HTMLElement | null>;
  fileName: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const node = target.current;
    if (!node || busy) return;
    setBusy(true);
    node.classList.add("is-capturing");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(node, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: node.scrollWidth,
        height: node.scrollHeight,
        // 按鈕列（切換月份等）與標了 print-only-hide 的不放進圖。
        filter: (element) =>
          !(element instanceof HTMLElement && (element.classList.contains("print-only-hide") || element.classList.contains("toolbar-actions"))),
      });
      if (!blob) throw new Error("沒有產生圖片");
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName }).catch(() => undefined);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch {
      window.alert("存成圖片失敗，請再試一次。");
    } finally {
      node.classList.remove("is-capturing");
      setBusy(false);
    }
  };
  return (
    <button type="button" className={`${className} print-only-hide`} disabled={busy} onClick={save}>
      {busy ? "產生中…" : label}
    </button>
  );
}
