"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ASSISTANT_IDS, ASSISTANT_NAMES } from "./schedule-settings";
import { isManagerViewer } from "./ManagerOnly";
import { useSchedule } from "./ScheduleProvider";
import { nowString } from "@/domain/dates";
import { pendingConfirmCount } from "@/domain/rules/publication";
import { Icon } from "./Icon";
import { MobileTabBar, type TabItem } from "./MobileTabBar";
import { ThemeToggle } from "./ThemeToggle";
import { ToastHost } from "./Toast";
import { usePublications } from "./usePublications";
import { useReviewTodos } from "./useReviewTodos";
import { useIsPhoneFrame, useViewer } from "./ViewerProvider";

// 管理者（最高管理者與排班者）與助理各自的選單（模擬身分，非正式保護）。
// shortLabel：手機底部按鈕列用的短名稱；manage：電腦版側邊欄放在「管理」小標下。
// 首頁 `/`：管理者看總覽，助理看「我的班表」。
// ownerOnly：只有最高管理者看得到（排班者不顯示）。
// self：助理長、組長自己的排休與班表確認（有登入時才會出現；自己的排休照助理的規則）。
// utility：不常用的工具頁（使用者 2026-10-30）：電腦版放進側欄最下面的頭像選單，手機照舊在「全部」。
type NavItem = TabItem & { manage?: boolean; ownerOnly?: boolean; self?: boolean; utility?: boolean };
const MANAGER_NAV: NavItem[] = [
  { href: "/", label: "總覽", shortLabel: "總覽", icon: "dashboard" },
  { href: "/workbench", label: "排班工作台", shortLabel: "工作台", icon: "planner" },
  { href: "/schedule", label: "班表", shortLabel: "班表", icon: "calendar" },
  { href: "/my-leave", label: "我的排休", shortLabel: "排休", icon: "dayOff", self: true },
  { href: "/my-confirm", label: "我的班表確認", shortLabel: "確認", icon: "check", self: true },
  { href: "/results", label: "排班結果", shortLabel: "結果", icon: "result", manage: true },
  { href: "/leads", label: "排班負責人", shortLabel: "負責人", icon: "users", manage: true },
  { href: "/abilities", label: "能力表", shortLabel: "能力", icon: "ability", manage: true },
  { href: "/people", label: "人員", shortLabel: "人員", icon: "users", manage: true },
  { href: "/rules", label: "設定", shortLabel: "設定", icon: "gear", manage: true, utility: true },
  { href: "/settings", label: "資料工具", shortLabel: "資料", icon: "data", manage: true, utility: true },
  { href: "/phone", label: "手機預覽", shortLabel: "手機", icon: "phone", manage: true, ownerOnly: true, utility: true },
  { href: "/help", label: "使用說明", shortLabel: "說明", icon: "help", manage: true, utility: true },
];
const ASSISTANT_NAV: NavItem[] = [
  { href: "/", label: "我的班表", shortLabel: "班表", icon: "calendar" },
  { href: "/my-leave", label: "排休申請", shortLabel: "排休", icon: "dayOff" },
  { href: "/my-confirm", label: "待確認", shortLabel: "確認", icon: "check" },
  { href: "/my-results", label: "排班結果", shortLabel: "結果", icon: "result" },
  { href: "/abilities", label: "我的能力", shortLabel: "能力", icon: "ability" },
  { href: "/help", label: "使用說明", shortLabel: "說明", icon: "help", utility: true },
];
// 手機底部按鈕列的預設（最多 4 個＋「全部」；每個人可以長按自訂，存在這台瀏覽器）。
const MANAGER_TABS = ["/", "/workbench", "/schedule", "/results"];
const ASSISTANT_TABS = ["/", "/my-leave", "/my-confirm", "/my-results"];

// 側邊欄收合（只留圖示）與拖拉寬度：畫面偏好，存在這台瀏覽器；不是班表資料。
const COLLAPSED_KEY = "clinic-schedule-workshop:sidebar-collapsed";
const WIDTH_KEY = "clinic-schedule-workshop:sidebar-width";
/** 收合寬度（只留圖示）＝拖拉的最小值；比 SNAP 窄放不下文字，放開時自動收合。 */
const MIN_WIDTH = 64;
const SNAP_WIDTH = 160;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 232;
const KEY_STEP = 16;
const prefListeners = new Set<() => void>();
const readPref = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writePref = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 無法儲存時只在本次畫面生效。
  }
  prefListeners.forEach((listener) => listener());
};
const subscribePrefs = (listener: () => void) => {
  prefListeners.add(listener);
  return () => prefListeners.delete(listener);
};
const readCollapsed = () => readPref(COLLAPSED_KEY) === "1";
const readWidth = () => {
  const value = Number(readPref(WIDTH_KEY));
  return value >= SNAP_WIDTH && value <= MAX_WIDTH ? value : DEFAULT_WIDTH;
};
const setCollapsed = (value: boolean) => writePref(COLLAPSED_KEY, value ? "1" : "0");
/** 放開或按鍵後的寬度：太窄就收合，否則記住寬度並展開。 */
const commitWidth = (width: number) => {
  if (width < SNAP_WIDTH) return setCollapsed(true);
  writePref(WIDTH_KEY, String(Math.round(Math.min(MAX_WIDTH, width))));
  setCollapsed(false);
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** 手機右上角頭像的字：管理者「管」、排班者「排」、助理取名字第一個字。 */
function viewerInitial(viewer: string) {
  if (viewer === "owner") return "管";
  if (viewer === "scheduler") return "排";
  if (viewer === "clerk") return "行";
  return ASSISTANT_NAMES.get(viewer)?.slice(0, 1) ?? "助";
}

function viewerName(viewer: string) {
  if (viewer === "owner") return "最高管理者";
  if (viewer === "scheduler") return "排班者";
  if (viewer === "clerk") return "行政專員";
  return ASSISTANT_NAMES.get(viewer) ?? viewer;
}

/**
 * 頁面外框：左側選單；最下面一個頭像按鈕，點開才看到畫面、模擬身分
 * 與不常用的工具頁（設定、資料工具、手機預覽、使用說明）。
 * 手機上：頂部只留品牌與右上角頭像（點了才打開模擬身分），
 * 選單變成底部毛玻璃按鈕列（`MobileTabBar`：最多 4 個常用頁面＋「全部」）。
 */
export function AppShell({ children, buildLabel }: { children: ReactNode; buildLabel: string }) {
  const pathname = usePathname();
  const { viewer, setViewer, acting } = useViewer();
  const { syncState } = useSchedule();
  const [menuOpen, setMenuOpen] = useState(false);
  const inPhoneFrame = useIsPhoneFrame();
  // 手機預覽頁裡的手機不再顯示「手機預覽」（不能一層套一層）。
  const navItems = isManagerViewer(viewer)
    ? MANAGER_NAV.filter(
        (item) =>
          (!item.ownerOnly || (viewer === "owner" && !inPhoneFrame)) &&
          (!item.self || (viewer === "scheduler" && (acting?.role === "lead" || acting?.role === "leader") && !!acting.personId)),
      )
    : ASSISTANT_NAV;
  // 助理「待確認」旁的數字：預公告中、還沒回覆的月份。
  const { publications } = usePublications();
  const confirmCount = isManagerViewer(viewer) ? 0 : pendingConfirmCount(Object.values(publications), viewer, nowString());
  // 管理者「排班工作台」旁的數字：班表審核輪到自己處理的月份。
  const reviewCount = useReviewTodos().length;
  const navCount = (href: string) => (href === "/my-confirm" ? confirmCount : href === "/workbench" ? reviewCount : 0);
  const pageItems = navItems.filter((item) => !item.utility);
  const utilityItems = navItems.filter((item) => item.utility);
  const collapsed = useSyncExternalStore(subscribePrefs, readCollapsed, () => false);
  const savedWidth = useSyncExternalStore(subscribePrefs, readWidth, () => DEFAULT_WIDTH);
  // 拖拉中的寬度（放開才存）；拖到比 SNAP 窄時先顯示收合樣子。
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const shownWidth = dragWidth ?? (collapsed ? MIN_WIDTH : savedWidth);
  const narrow = shownWidth < SNAP_WIDTH;
  const clamp = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: shownWidth };
    setDragWidth(shownWidth);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setDragWidth(clamp(drag.current.startWidth + event.clientX - drag.current.startX));
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dragWidth !== null) commitWidth(dragWidth);
    setDragWidth(null);
  };
  const resizeByKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (collapsed) setCollapsed(false);
      else commitWidth(Math.min(MAX_WIDTH, savedWidth + KEY_STEP));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (!collapsed) commitWidth(savedWidth - KEY_STEP);
    }
  };

  return (
    <div
      className={`app-shell ${narrow ? "is-collapsed" : ""} ${dragWidth !== null ? "is-resizing" : ""} ${navItems.length > 1 ? "has-bottom-nav" : ""} ${menuOpen ? "is-menu-open" : ""}`}
      style={{ "--sidebar-current": `${shownWidth}px` } as CSSProperties}
    >
      <aside className="app-sidebar print-only-hide">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">班</span>
          <span>
            <strong>診所班表</strong>
            <small>範例牙醫診所</small>
          </span>
        </Link>
        <button
          className="sidebar-toggle"
          aria-label={collapsed ? "展開側邊欄" : "收合側邊欄"}
          aria-expanded={!collapsed}
          title={collapsed ? "展開" : "收合"}
          onClick={() => setCollapsed(!collapsed)}
        >
          <Icon name={collapsed ? "panelOpen" : "panelClose"} size={20} />
        </button>
        <button
          className={`mobile-me sync-${syncState}`}
          aria-label={`目前身分：${viewerName(viewer)}（點一下切換身分）`}
          aria-expanded={menuOpen}
          aria-controls="sidebar-foot"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span aria-hidden="true">{viewerInitial(viewer)}</span>
          <i className="mobile-me-dot" aria-hidden="true" />
        </button>
        <nav className="side-nav" aria-label="主要導覽">
          {pageItems.map((item, index) => (
            <Fragment key={item.href}>
              {item.manage && !pageItems[index - 1]?.manage && <span className="side-nav-section">管理</span>}
              {item.self && !pageItems[index - 1]?.self && <span className="side-nav-section">我自己</span>}
              <Link
                href={item.href}
                className={isActive(pathname, item.href) ? "is-active" : undefined}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
              >
                <Icon name={item.icon} className="side-nav-icon" />
                <span className="side-nav-label">{item.label}</span>
                {navCount(item.href) > 0 && (
                  <span className="nav-count" aria-label={`${navCount(item.href)} 份待處理`}>{navCount(item.href)}</span>
                )}
              </Link>
            </Fragment>
          ))}
        </nav>
        {/* 電腦版：側欄最下面的頭像按鈕，點開頭像選單（手機用右上角的 .mobile-me） */}
        <button
          className={`account-button sync-${syncState}`}
          aria-expanded={menuOpen}
          aria-controls="sidebar-foot"
          aria-label={`${viewerName(viewer)}：畫面、身分、設定與其他功能`}
          title={collapsed ? viewerName(viewer) : undefined}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="account-avatar" aria-hidden="true">
            {viewerInitial(viewer)}
            <i className="mobile-me-dot" />
          </span>
          <span className="account-name">
            {viewerName(viewer)}
            <small>模擬身分</small>
          </span>
          <span className="account-caret" aria-hidden="true">⌃</span>
        </button>
        {menuOpen && <button className="mobile-menu-backdrop" aria-label="關閉身分選單" onClick={() => setMenuOpen(false)} />}
        <div className="sidebar-foot" id="sidebar-foot">
          <strong className="mobile-menu-title">
            目前身分<small>模擬，非登入</small>
          </strong>
          <ThemeToggle />
          <label className="viewer-switch">
            <span>模擬身分（非登入）</span>
            <select
              value={viewer}
              onChange={(event) => {
                setViewer(event.target.value);
                setMenuOpen(false);
              }}
            >
              <option value="owner">最高管理者</option>
              <option value="scheduler">排班者</option>
              <option value="clerk">行政專員</option>
              {ASSISTANT_IDS.map((id) => (
                <option key={id} value={id}>{ASSISTANT_NAMES.get(id)}</option>
              ))}
            </select>
          </label>
          {utilityItems.length > 0 && (
            <nav className="foot-links" aria-label="其他功能">
              {utilityItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive(pathname, item.href) ? "is-active" : undefined}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          <small className="build-label">Build {buildLabel}</small>
        </div>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拉調整側邊欄寬度（連點兩下收合／展開）"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={Math.round(shownWidth)}
          tabIndex={0}
          title="拖拉調整寬度；連點兩下收合／展開"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setCollapsed(!collapsed)}
          onKeyDown={resizeByKey}
        />
      </aside>
      {navItems.length > 1 && (
        <MobileTabBar
          key={isManagerViewer(viewer) ? "manager" : "assistant"}
          items={navItems}
          kind={isManagerViewer(viewer) ? "manager" : "assistant"}
          defaultTabs={isManagerViewer(viewer) ? MANAGER_TABS : ASSISTANT_TABS}
          pathname={pathname}
          badges={{ "/my-confirm": confirmCount, "/workbench": reviewCount }}
        />
      )}
      <div className="app-main">
        {children}
      </div>
      <ToastHost />
    </div>
  );
}
