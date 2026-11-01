"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { reduceMotion } from "./reduce-motion";

export type TabItem = { href: string; label: string; shortLabel: string; icon: IconName };

/**
 * 手機底部毛玻璃按鈕列：最多 TAB_LIMIT 個常用頁面＋「全部」。
 * 選中的那格有一顆帶主色的玻璃膠囊，換頁時滑過去；往下捲縮成只剩圖示；打字時藏起來；
 * 按「全部」整條往上長出完整選單；長按按鈕或選單裡的功能進入「自訂下方按鈕」（打勾、拖拉、交換、拿掉）。
 * 自訂的按鈕只是畫面偏好，存在這台瀏覽器（localStorage，不含在 JSON 匯出）。
 */
const TAB_LIMIT = 4;
const TABS_KEY = "clinic-schedule-workshop:tab-bar:v1";
const GLIDE_MS = 180; // 膠囊滑動時間
const GLIDE_LEAD = 120; // 點下去後多久換頁（這時膠囊已滑了九成）

const tabListeners = new Set<() => void>();
const readTabsRaw = () => {
  try {
    return window.localStorage.getItem(TABS_KEY) ?? "";
  } catch {
    return "";
  }
};
const subscribeTabs = (listener: () => void) => {
  tabListeners.add(listener);
  return () => tabListeners.delete(listener);
};
function parseTabs(raw: string, kind: string): string[] | null {
  try {
    const value = JSON.parse(raw)?.[kind];
    return Array.isArray(value) && value.every((to) => typeof to === "string") ? value : null;
  } catch {
    return null;
  }
}
function saveTabs(kind: string, tabs: string[]) {
  try {
    const all = JSON.parse(readTabsRaw() || "{}") ?? {};
    window.localStorage.setItem(TABS_KEY, JSON.stringify({ ...all, [kind]: tabs }));
  } catch {
    // 存不了就只用這一次。
  }
  tabListeners.forEach((listener) => listener());
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** iPhone 的網頁只能在點擊當下震動：用隱藏的 switch 觸發系統觸覺回饋；Android 用 vibrate。 */
function haptic() {
  if (navigator.vibrate?.(10)) return;
  const label = document.createElement("label");
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.body.appendChild(label);
  label.click();
  label.remove();
}

type Drag = { to: string; x: number; y: number; over: number; removing: boolean };

export function MobileTabBar({
  items,
  kind,
  defaultTabs,
  pathname,
  badges,
}: {
  items: TabItem[];
  /** 管理者與助理各存一組自訂按鈕。 */
  kind: "manager" | "assistant";
  defaultTabs: string[];
  pathname: string;
  /** 按鈕旁的數字（例如待確認份數）。 */
  badges: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // 往下捲縮小：記在哪一頁縮的，換頁就恢復
  const [compactPath, setCompactPath] = useState<string | null>(null);
  const compact = compactPath === pathname;
  const [typing, setTyping] = useState(false);
  // 自訂下方按鈕：draft＝編輯中的按鈕；picked＝先點選的下方按鈕（再點另一個就互換）；drag＝拖拉中的位置
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [picked, setPicked] = useState("");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [fullNote, setFullNote] = useState(false);
  const fullTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressClick = useRef(false);
  const dragged = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const raw = useSyncExternalStore(subscribeTabs, readTabsRaw, () => "");
  const byTo = (to: string) => items.find((item) => item.href === to);
  const saved = parseTabs(raw, kind);
  const all = [...new Set(saved ?? defaultTabs)].filter((to) => byTo(to));
  const tabs = draft ?? all.slice(0, TAB_LIMIT);

  // 往下捲縮小、往上捲（或到頁面最底）恢復；換頁時恢復
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 4;
      if (y < 40 || atBottom || last - y > 6) setCompactPath(null);
      else if (y - last > 6) setCompactPath(pathname);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);
  // 打字時（手機鍵盤跳出來）先藏起來，不擋輸入框
  useEffect(() => {
    const isField = (target: EventTarget | null) =>
      target instanceof Element && target.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select, [contenteditable]");
    const onIn = (event: FocusEvent) => isField(event.target) && setTyping(true);
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  // 編輯中的晃動用程式每一格畫面直接轉（CSS 動畫在有些 iPhone 上不會動）；拖到上面的那格停住
  useEffect(() => {
    // 減少動態效果：不晃（2026-11-01）
    if (!editing || reduceMotion()) return;
    let raf = 0;
    const tick = (t: number) => {
      barRef.current?.querySelectorAll<HTMLElement>(".jig").forEach((el, i) => {
        if (el.parentElement?.matches(".over, .empty")) {
          el.style.transform = "";
          return;
        }
        const amp = el.closest(".edit-grid") ? 2.5 : 4.5;
        const period = 250 + (i % 3) * 25;
        el.style.transform = `rotate(${(amp * Math.sin((t / period) * 2 * Math.PI + i * 1.7)).toFixed(2)}deg)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [editing]);

  function finish() {
    if (draft && draft.join() !== all.slice(0, TAB_LIMIT).join()) saveTabs(kind, draft);
    setEditing(false);
    setDraft(null);
    setPicked("");
    suppressClick.current = false;
  }
  // 收起「全部」時，編輯中的也一起存好
  function close() {
    finish();
    setOpen(false);
  }
  // 把頁面放到第 i 個按鈕（i＝目前個數 → 加在最後）；已經在下方的就跟那一格交換
  function place(to: string, i: number) {
    const next = [...tabs];
    const j = next.indexOf(to);
    if (i >= next.length) {
      if (j >= 0) next.splice(j, 1);
      else if (next.length >= TAB_LIMIT) return setPicked("");
      next.push(to);
    } else {
      if (j === i) return setPicked("");
      if (j >= 0) next[j] = next[i];
      next[i] = to;
    }
    setDraft(next);
    setPicked("");
  }
  function remove(to: string) {
    setDraft(tabs.filter((t) => t !== to));
    setPicked("");
  }
  // 拖拉：放到下方按鈕上＝換掉；放到空格＝加入；把下方的按鈕拖離按鈕列＝拿掉
  function beginDrag(to: string, sx: number, sy: number, fromBar: boolean, onTap: () => void = () => {}) {
    let moved = false;
    let over = -1;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      dragged.current = true;
      ev.preventDefault();
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const slot = el?.closest<HTMLElement>("[data-slot]");
      over = slot ? Number(slot.dataset.slot) : -1;
      setDrag({ to, x: ev.clientX, y: ev.clientY, over, removing: fromBar && !el?.closest(".tab-row") });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      if (!moved) return onTap();
      if (ev.type === "pointercancel") return;
      if (over >= 0) place(to, over);
      else if (fromBar && !document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".tab-row")) remove(to);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function startDrag(event: ReactPointerEvent, to: string, onTap: () => void, fromBar = false) {
    if (event.button > 0) return;
    event.preventDefault();
    dragged.current = false;
    beginDrag(to, event.clientX, event.clientY, fromBar, onTap);
  }
  // 長按（約半秒）：震一下、進入編輯模式；手指不放開可以直接拖
  function pressStart(event: ReactPointerEvent, to: string | undefined, fromBar: boolean, el: Element | null = event.currentTarget) {
    if (editing || event.button > 0) return;
    const sx = event.clientX;
    const sy = event.clientY;
    // 按住時圖示慢慢放大（CSS .pressing）
    el?.classList.add("pressing");
    const cancel = () => {
      el?.classList.remove("pressing");
      clearTimeout(timer);
      window.removeEventListener("pointermove", check);
      window.removeEventListener("pointerup", cancel);
      window.removeEventListener("pointercancel", cancel);
    };
    const check = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) cancel();
    };
    const timer = setTimeout(() => {
      cancel();
      suppressClick.current = true;
      // Android 這時就會震；iPhone 等手指放開後的那一下 click 再震
      if (!navigator.vibrate?.(15)) {
        const once = () => {
          window.removeEventListener("click", once, true);
          haptic();
        };
        window.addEventListener("click", once, true);
        setTimeout(() => window.removeEventListener("click", once, true), 3000);
      }
      setOpen(true);
      setEditing(true);
      if (to) beginDrag(to, sx, sy, fromBar);
    }, 480);
    window.addEventListener("pointermove", check);
    window.addEventListener("pointerup", cancel);
    window.addEventListener("pointercancel", cancel);
  }
  // 把手往下拉：整個選單跟著手指往下，拉超過一點點（或往下甩）就收回，不然彈回原位；沒拉動＝點一下，也收回
  function grabStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button > 0 || !barRef.current) return;
    const bar = barRef.current;
    const handle = event.currentTarget;
    const sy = event.clientY;
    let dy = 0;
    let last = { y: sy, t: event.timeStamp };
    let speed = 0;
    handle.setPointerCapture?.(event.pointerId);
    bar.style.transition = "none";
    const move = (ev: PointerEvent) => {
      dy = Math.max(0, ev.clientY - sy);
      speed = (ev.clientY - last.y) / Math.max(1, ev.timeStamp - last.t);
      last = { y: ev.clientY, t: ev.timeStamp };
      bar.style.transform = `translate(-50%, ${dy}px)`;
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      bar.style.transition = "";
      bar.style.transform = "";
      if (dy < 6 || dy > 60 || speed > 0.5) close();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }
  // 長按後放開的那一下不要當成點擊（不換頁）
  const eatClick = (event: ReactMouseEvent) => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    event.preventDefault();
    return true;
  };
  const noMenu = (event: ReactMouseEvent) => event.preventDefault();
  // 鍵盤操作（Enter／空白鍵）時沒有 pointer 事件，用 click 補上
  const keyTap = (onTap: () => void) => (event: ReactMouseEvent) => {
    if (event.detail === 0) onTap();
  };
  // 點功能方塊：已在下方的取消打勾（拿掉）；還沒在的打勾加到最後；下方滿了就提示。在 click 裡做，iPhone 才會震
  const toggleTile = (to: string) => () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setPicked("");
    if (tabs.includes(to)) remove(to);
    else if (tabs.length < TAB_LIMIT) setDraft([...tabs, to]);
    else {
      setFullNote(true);
      clearTimeout(fullTimer.current);
      fullTimer.current = setTimeout(() => setFullNote(false), 2500);
      return;
    }
    setFullNote(false);
    haptic();
  };
  const tapSlot = (to: string, i: number) => () => (picked && picked !== to ? place(picked, i) : setPicked((p) => (p === to ? "" : to)));
  const tapEmpty = () => picked && place(picked, tabs.length);

  const inTabs = tabs.some((to) => isActive(pathname, to));
  const showEmpty = editing && tabs.length < TAB_LIMIT;
  const cols = tabs.length + (showEmpty ? 1 : 0) + 1;
  // 玻璃膠囊在第幾格：點下去就先滑過去（target），不等新頁面畫好；不在下方的頁面或「全部」打開時停在「全部」
  const [target, setTarget] = useState<{ to: string; from: string } | null>(null);
  const pendingTo = target?.from === pathname ? target.to : null;
  const matchIdx = tabs.findIndex((to) => isActive(pathname, to));
  const targetIdx = pendingTo ? tabs.indexOf(pendingTo) : -1;
  const glideIdx = open ? cols - 1 : targetIdx >= 0 ? targetIdx : matchIdx >= 0 ? matchIdx : cols - 1;
  const gliderRef = useRef<HTMLSpanElement>(null);
  const glideFromRef = useRef<number | null>(null);
  useGlide(gliderRef, glideIdx, glideFromRef, editing);
  const badge = (to: string) => (badges[to] ? <span className="nav-count" aria-label={`${badges[to]} 份待處理`}>{badges[to]}</span> : null);

  return (
    <>
      {open && <button className="tabbar-backdrop" aria-label="關閉全部功能" onClick={close} />}
      <div
        ref={barRef}
        className={`tabbar ${open ? "open" : ""} ${editing ? "editing" : ""} ${compact && !open ? "compact" : ""} ${typing ? "typing" : ""}`}
        style={{ "--tabs": cols } as CSSProperties}
      >
        {/* 「全部」打開時，按鈕列往上長出完整選單 */}
        <div className="dock-more" inert={!open}>
          <div className="dock-more-inner">
            {/* 上緣的把手：點一下，或按住往下拉，收回成一行 */}
            <div
              className="dock-grabber"
              role="button"
              tabIndex={0}
              aria-label="收起全部功能"
              onPointerDown={grabStart}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  close();
                }
              }}
            >
              <span />
            </div>
            <div className="dock-head">
              {editing ? (
                <>
                  <span className="hint">
                    {fullNote ? (
                      <b className="full-note">下方已經滿了（最多 {TAB_LIMIT} 個），先取消一個打勾。</b>
                    ) : (
                      <>點功能<b>打勾</b>就加到下面、再點一次取消；也可以把功能<b>拖到下面的按鈕</b>上換掉。最多 {TAB_LIMIT} 個。</>
                    )}
                  </span>
                  <span className="dock-head-actions">
                    <button
                      className="link-button is-quiet"
                      onClick={() => {
                        setDraft(defaultTabs.filter((to) => byTo(to)).slice(0, TAB_LIMIT));
                        setPicked("");
                      }}
                    >
                      恢復預設
                    </button>
                    <button className="button" onClick={finish}>完成</button>
                  </span>
                </>
              ) : (
                <>
                  <b>全部功能</b>
                  <button className="link-button is-quiet" onClick={() => setEditing(true)}>
                    <Icon name="edit" size={15} />自訂下方按鈕
                  </button>
                </>
              )}
            </div>
            {editing ? (
              <nav className="edit-grid" aria-label="選擇要放在下方的功能">
                {items.map((item) => (
                  <button
                    key={item.href}
                    className={tabs.includes(item.href) ? "in-bar" : tabs.length >= TAB_LIMIT ? "bar-full" : ""}
                    aria-pressed={tabs.includes(item.href)}
                    onPointerDown={(event) => startDrag(event, item.href, () => {})}
                    onClick={toggleTile(item.href)}
                    onContextMenu={noMenu}
                  >
                    <span className="jig">
                      <Icon name={item.icon} size={22} />
                      {item.label}
                      <span className="in-bar-mark" aria-hidden="true">{tabs.includes(item.href) ? "✓" : ""}</span>
                    </span>
                  </button>
                ))}
              </nav>
            ) : (
              // 長按選單裡的功能也能進入編輯
              <div
                className="press-zone"
                onContextMenu={noMenu}
                onClickCapture={(event) => eatClick(event) && event.stopPropagation()}
                onPointerDown={(event) => {
                  const link = (event.target as Element).closest("nav a");
                  if (link) pressStart(event, items.find((item) => link.getAttribute("href") === item.href)?.href, false, link);
                }}
              >
                <nav className="dock-grid" aria-label="全部功能">
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={isActive(pathname, item.href) ? "active" : undefined}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                      onClick={() => setOpen(false)}
                    >
                      <Icon name={item.icon} size={22} />
                      {item.label}
                      {badge(item.href)}
                    </Link>
                  ))}
                </nav>
              </div>
            )}
          </div>
        </div>
        <nav className="tab-row" aria-label="主要導覽">
          {!editing && <span ref={gliderRef} className="tab-glider" style={{ "--i": glideIdx } as CSSProperties} aria-hidden="true" />}
          {tabs.map((to, i) => {
            const item = byTo(to)!;
            const inner = (
              <>
                <span className="tab-icon"><Icon name={item.icon} size={22} /></span>
                <span className="tab-label">{item.shortLabel}</span>
                {badge(to)}
              </>
            );
            const active = (pendingTo ? pendingTo === to : isActive(pathname, to)) && !open;
            return editing ? (
              <button
                key={to}
                data-slot={i}
                className={`slot ${drag?.over === i ? "over" : ""} ${picked === to ? "picked" : ""} ${drag?.to === to && drag.removing ? "leaving" : ""}`}
                aria-label={`第 ${i + 1} 個按鈕：${item.label}`}
                onContextMenu={noMenu}
                onPointerDown={(event) => startDrag(event, to, tapSlot(to, i), true)}
                onClick={keyTap(tapSlot(to, i))}
              >
                {/* 晃動放在裡面這層：iPhone 的 Safari 直接轉 <button> 不會動 */}
                <span className="jig">
                  {inner}
                  <span
                    className="slot-remove"
                    role="button"
                    aria-label={`拿掉${item.label}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      remove(to);
                    }}
                  >
                    −
                  </span>
                </span>
              </button>
            ) : (
              <Link
                key={to}
                href={to}
                className={active ? "active" : undefined}
                aria-current={isActive(pathname, to) ? "page" : undefined}
                onContextMenu={noMenu}
                onPointerDown={(event) => pressStart(event, to, true)}
                onClick={(event) => {
                  if (eatClick(event)) return;
                  setOpen(false);
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
                  // 膠囊先滑到快到位（GLIDE_LEAD）才換頁：新頁面載入時手機騰不出手畫動畫，同時換頁的話膠囊會等頁面畫好才動
                  event.preventDefault();
                  if (isActive(pathname, to) && pathname === to) return;
                  flushSync(() => setTarget({ to, from: pathname }));
                  setTimeout(() => router.push(to), GLIDE_LEAD);
                }}
              >
                {inner}
              </Link>
            );
          })}
          {showEmpty && (
            <button
              data-slot={tabs.length}
              className={`slot empty ${drag?.over === tabs.length ? "over" : ""}`}
              aria-label="空格：加入一個功能"
              onClick={tapEmpty}
            >
              <span className="tab-icon"><Icon name="plus" size={20} /></span>
              <span className="tab-label">加入</span>
            </button>
          )}
          <button
            className={open || !inTabs ? "active" : undefined}
            onClick={() => (open ? close() : setOpen(true))}
            aria-expanded={open}
            aria-label={open ? "關閉全部功能" : "全部功能"}
          >
            <span className="tab-icon"><Icon name={open ? "close" : "apps"} size={22} /></span>
            <span className="tab-label">全部</span>
            {!open && tabs.every((to) => !badges[to]) && Object.values(badges).some(Boolean) && <span className="nav-dot" aria-hidden="true" />}
          </button>
        </nav>
        {drag &&
          createPortal(
            <div className={`drag-ghost ${drag.removing ? "removing" : ""}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
              <Icon name={byTo(drag.to)!.icon} size={22} />
              {drag.removing ? "放開拿掉" : byTo(drag.to)!.shortLabel}
            </div>,
            document.body,
          )}
      </div>
    </>
  );
}

// 玻璃膠囊：換格時從原本的位置平滑地滑過去（不拉長、不回彈）；只動 transform，換頁時頁面還在載入也不會卡
function useGlide(gliderRef: RefObject<HTMLSpanElement | null>, idx: number, prevRef: RefObject<number | null>, editing: boolean) {
  useLayoutEffect(() => {
    const el = gliderRef.current;
    const from = prevRef.current;
    prevRef.current = idx;
    if (!el || editing || from == null || from === idx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !el.animate) return;
    const w = parseFloat(getComputedStyle(el).width);
    // 上一段還沒滑完就又點：從現在看得到的位置接著滑
    const running = el.getAnimations?.() ?? [];
    let x0 = from * w;
    if (running.length) {
      x0 = new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
      running.forEach((animation) => animation.cancel());
    }
    el.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${idx * w}px)` }], {
      duration: GLIDE_MS,
      easing: "cubic-bezier(0.25, 0.8, 0.25, 1)",
    });
  }, [gliderRef, idx, prevRef, editing]);
}
