"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { staffDirectory } from "@/config/staff-directory";
import type { RoleHolder, StaffRole } from "@/domain/rules/month-lead";
import { ASSISTANT_IDS } from "./schedule-settings";

/** 模擬身分：owner（最高管理者）、scheduler（排班者）、clerk（行政專員）或助理 ID。不是真正的登入。 */
const VIEWER_KEY = "clinic-schedule-workshop:viewer";

/**
 * 登入者。這個版本沒有登入，一律是 null（畫面用模擬身分）。
 * 之後加上正式登入時，在 ViewerProvider 填入登入者，畫面上「已登入」的部分就會出現。
 */
export interface SignedInMember {
  name: string;
  role: StaffRole;
  personId?: string;
}
const listeners = new Set<() => void>();

/**
 * 手機預覽頁（`/phone`）裡的「手機」：iframe 的 name＝`phone-preview:身分`（window.name 只屬於那個 iframe），
 * 那支手機就用這個身分看，不寫進 localStorage／sessionStorage，不影響同一個瀏覽器的其他畫面。
 * `phone-preview:self`＝用自己的身分。
 */
export const PHONE_FRAME_PREFIX = "phone-preview:";
function frameViewer(): string | null {
  try {
    return typeof window !== "undefined" && window.name.startsWith(PHONE_FRAME_PREFIX) ? window.name.slice(PHONE_FRAME_PREFIX.length) : null;
  } catch {
    return null;
  }
}
const noopSubscribe = () => () => {};
/** 這個畫面是不是手機預覽頁裡的手機（建置時一律 false，避免畫面對不上）。 */
export function useIsPhoneFrame(): boolean {
  return useSyncExternalStore(noopSubscribe, () => frameViewer() !== null, () => false);
}

function readViewer(): string {
  try {
    const saved = window.localStorage.getItem(VIEWER_KEY);
    // 舊版的「管理者」改稱最高管理者。
    if (saved === "admin") return "owner";
    return saved && (saved === "owner" || saved === "scheduler" || saved === "clerk" || ASSISTANT_IDS.includes(saved)) ? saved : "owner";
  } catch {
    return "owner";
  }
}

let current: string | null = null;

function getSnapshot(): string {
  current ??= readViewer();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setViewer(next: string) {
  current = next;
  try {
    window.localStorage.setItem(VIEWER_KEY, next);
  } catch {
    // 無法儲存時只在本次畫面生效。
  }
  listeners.forEach((listener) => listener());
}

interface ViewerContextValue {
  viewer: string;
  setViewer: (next: string) => void;
  /** 登入者（這個版本沒有登入，一律 null）。 */
  member: SignedInMember | null;
  /** 只能看：只能看的帳號，或最高管理者「用某人的身分看」。 */
  readOnly: boolean;
  /** 畫面照誰的身分算權限（哪些月份能改、「我自己」的頁面）；模擬身分沒有，一律 null。 */
  acting: RoleHolder | null;
  /** 「用某人的身分看」選的值（`VIEW_AS_CHOICES` 的 value）；沒有在看別人＝null。 */
  viewAs: string | null;
}

const ViewerContext = createContext<ViewerContextValue>({ viewer: "owner", setViewer, member: null, readOnly: false, acting: null, viewAs: null });

/** 手機預覽可以選的人：名單上的每個人，照職稱換算畫面。 */
export interface ViewAsChoice {
  value: string;
  label: string;
}
const TITLE_ROLE = { 助理長: "lead", 組長: "leader", 助理: "assistant" } as const;
export const VIEW_AS_CHOICES: ViewAsChoice[] = [
  ...staffDirectory
    .filter((staff) => staff.personId && staff.title in TITLE_ROLE)
    .map((staff) => ({ value: staff.personId as string, label: `${staff.name}（${staff.title}）` })),
  ...staffDirectory.filter((staff) => staff.title === "行政專員").slice(0, 1).map((staff) => ({ value: "clerk", label: `${staff.name}（行政專員）` })),
];

/**
 * 選的值 → 畫面身分與算權限的人：助理長、組長用排班者的畫面、照他自己負責的月份；
 * 助理用他的助理畫面；clerk＝行政專員；其他（owner、舊的 scheduler）照舊。
 */
export function viewOfChoice(value: string): { viewer: string; acting: RoleHolder | null } {
  const staff = staffDirectory.find((person) => person.personId === value);
  const role = staff ? TITLE_ROLE[staff.title as keyof typeof TITLE_ROLE] : undefined;
  if (role === "lead" || role === "leader") return { viewer: "scheduler", acting: { role, personId: value } };
  if (role === "assistant") return { viewer: value, acting: { role, personId: value } };
  if (value === "clerk") return { viewer: "clerk", acting: { role: "clerk" } };
  return { viewer: value, acting: null };
}

export function ViewerProvider({ children }: { children: ReactNode }) {
  return <LocalViewer>{children}</LocalViewer>;
}

function LocalViewer({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, getSnapshot, () => "owner");
  // 手機預覽頁的手機：身分只在這支手機裡切換（模擬身分，不寫進 localStorage）。
  const frame = useSyncExternalStore(noopSubscribe, frameViewer, () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const inFrame = frame !== null;
  const viewer = inFrame ? (picked ?? (frame === "self" ? stored : viewOfChoice(frame).viewer)) : stored;
  return (
    <ViewerContext.Provider value={{ viewer, setViewer: inFrame ? setPicked : setViewer, member: null, readOnly: false, acting: null, viewAs: null }}>
      {children}
    </ViewerContext.Provider>
  );
}

export function useViewer() {
  return useContext(ViewerContext);
}
