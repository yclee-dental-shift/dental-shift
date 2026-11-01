"use client";

import { useEffect, useRef, type RefObject } from "react";

const MOBILE = "(max-width: 760px)";
const CLOSE_DISTANCE = 100;
const CLOSE_SPEED = 0.5; // px／毫秒，快速往下撥
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * 手機下方視窗（使用者 2026-10-30，照 iPhone）：按住往下拉，視窗跟著手指走；拉超過 100px 或快速往下撥就收起來，
 * 拉不夠就彈回去；點變暗的地方也會關（那一下不會點到後面的東西）。
 * 視窗內容還沒捲到最上面時，往下滑是捲內容。只在手機寬度生效，電腦版不變。
 * `target`：要移動的元素（預設 ref 本身）。放在 FloatingPanel 裡的（例如 DemandDayEditor）由 FloatingPanel 處理，這裡略過。
 */
export function useSheetDrag(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { enabled = true, target }: { enabled?: boolean; target?: (host: HTMLElement) => HTMLElement | null } = {},
) {
  // onClose 每次畫面更新都是新的函式；放在 ref 裡，拉到一半畫面更新也不會重設。
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const host = ref.current;
    if (!enabled || !host || !window.matchMedia(MOBILE).matches) return;
    // 放在 FloatingPanel 裡的由 FloatingPanel 處理（子元件的 effect 先跑，所以看位置不看標記）。
    if (host.parentElement?.closest(".floating-shell")) return;
    const sheet = () => (target ? target(host) : host);
    let startY = 0;
    let startTime = 0;
    let lastY = 0;
    let lastTime = 0;
    let atTop = false;
    let dragging = false;
    let closing = false;

    const reset = (element: HTMLElement) => {
      element.style.transition = "";
      element.style.transform = "";
    };
    const close = () => {
      const element = sheet();
      if (closing || !element) return;
      closing = true;
      element.style.transition = `transform 0.25s ${EASE}`;
      element.style.transform = "translateY(100%)";
      window.setTimeout(() => closeRef.current(), 220);
    };
    // 捲動的是視窗本身或裡面的捲動框；都在最上面才算可以往下拉。
    const scrolledToTop = (from: EventTarget | null) => {
      for (let node = from instanceof Element ? from : null; node && node !== host.parentElement; node = node.parentElement) {
        if (node instanceof HTMLElement && node.scrollTop > 0 && node.scrollHeight > node.clientHeight) return false;
      }
      return true;
    };
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || closing) return;
      startY = lastY = event.touches[0].clientY;
      startTime = lastTime = event.timeStamp;
      atTop = scrolledToTop(event.target);
      dragging = false;
    };
    const onMove = (event: TouchEvent) => {
      const element = sheet();
      if (!element || closing) return;
      const y = event.touches[0].clientY;
      const dy = y - startY;
      if (!dragging) {
        if (!atTop || dy < 6) return;
        dragging = true;
        element.style.transition = "none";
      }
      event.preventDefault();
      lastY = y;
      lastTime = event.timeStamp;
      element.style.transform = `translateY(${Math.max(0, dy - 6)}px)`;
    };
    const onEnd = (event: TouchEvent) => {
      const element = sheet();
      if (!dragging || !element) return;
      dragging = false;
      const dy = lastY - startY;
      const speed = (lastY - startY) / Math.max(1, lastTime - startTime);
      const recent = event.timeStamp - lastTime < 100;
      if (dy > CLOSE_DISTANCE || (speed > CLOSE_SPEED && dy > 30 && recent)) {
        close();
        return;
      }
      element.style.transition = `transform 0.3s ${EASE}`;
      element.style.transform = "translateY(0)";
      window.setTimeout(() => !closing && reset(element), 320);
    };
    // 點變暗的地方：關掉，並吃掉這一下，不讓它點到後面的格子。
    const onOutside = (event: PointerEvent) => {
      const element = sheet();
      const hit = event.target instanceof Node ? event.target : null;
      if (!element || !hit || element.contains(hit) || closing) return;
      event.preventDefault();
      event.stopPropagation();
      const swallow = (click: Event) => {
        click.preventDefault();
        click.stopPropagation();
      };
      document.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 600);
      close();
    };
    host.addEventListener("touchstart", onStart, { passive: true });
    host.addEventListener("touchmove", onMove, { passive: false });
    host.addEventListener("touchend", onEnd);
    host.addEventListener("touchcancel", onEnd);
    document.addEventListener("pointerdown", onOutside, true);
    return () => {
      host.removeEventListener("touchstart", onStart);
      host.removeEventListener("touchmove", onMove);
      host.removeEventListener("touchend", onEnd);
      host.removeEventListener("touchcancel", onEnd);
      document.removeEventListener("pointerdown", onOutside, true);
      const element = sheet();
      if (element) reset(element);
    };
  }, [ref, enabled, target]);
}
