"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 說明小按鈕（使用者 2026-10-27：畫面上的長說明收起來，要看再打開；完整的在「使用說明」頁 /help）。
 * 電腦：滑鼠移上去 0.2 秒跳出；點一下固定打開。手機：點一下打開，點外面或再點一下收起。
 * 標了 data-view-control：已完成、只能看的步驟照樣能打開；存成圖片時不放進圖（print-only-hide）。
 */
const HOVER_DELAY_MS = 200;
const GUTTER = 16;

export function HelpTip({
  title,
  children,
  guide,
  label = "?",
}: {
  title: string;
  children: ReactNode;
  /** 使用說明頁的段落（/help#guide）；有給才顯示「看完整使用說明」。 */
  guide?: string;
  /** 按鈕上的字；預設「?」，圖例用「圖例」。 */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const canHover = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const close = () => {
    clearTimeout(timer.current);
    setOpen(false);
    setPinned(false);
  };
  const hoverOpen = () => {
    if (!canHover()) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), HOVER_DELAY_MS);
  };
  const hoverClose = () => {
    if (!canHover() || pinned) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 150);
  };

  // 放在按鈕下方，超出畫面就往左推、往上翻。
  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const anchor = button.current.getBoundingClientRect();
    const box = panel.current.getBoundingClientRect();
    const width = window.innerWidth;
    const left = Math.max(GUTTER, Math.min(anchor.left, width - box.width - GUTTER));
    const below = anchor.bottom + 6;
    const top = below + box.height > window.innerHeight - GUTTER && anchor.top - box.height - 6 > GUTTER ? anchor.top - box.height - 6 : below;
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (button.current?.contains(target) || panel.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    const onScroll = () => !pinned && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open, pinned]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span className="help-tip print-only-hide" data-view-control>
      <button
        ref={button}
        type="button"
        className={`help-tip-button ${label === "?" ? "is-round" : ""}`}
        aria-label={`說明：${title}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          clearTimeout(timer.current);
          if (open && pinned) close();
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
        onMouseEnter={hoverOpen}
        onMouseLeave={hoverClose}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={title}
            className="help-tip-panel"
            style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={hoverClose}
          >
            <strong className="help-tip-title">
              {title}
              <button type="button" className="help-tip-close" aria-label="關閉說明" onClick={close}>×</button>
            </strong>
            <div className="help-tip-body">{children}</div>
            {guide && (
              <Link className="help-tip-more" href={`/help#${guide}`} onClick={close}>
                看完整使用說明 →
              </Link>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
