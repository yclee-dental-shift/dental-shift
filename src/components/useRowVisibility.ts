"use client";

import type { PersonRole } from "@/domain/types";
import { useSyncExternalStore } from "react";

/**
 * 班表上哪些人隱藏、哪一組（醫師／助理）收起、上下順序（拖動名字）。只是畫面偏好：
 * 存在這台瀏覽器 localStorage，與班表資料分開，不含在 JSON 匯出；不影響人數計算。
 */
export interface RowVisibility {
  hidden: string[];
  collapsed: PersonRole[];
  /** 拖動排好的順序（人員 ID）；不在裡面的人照預設順序排在後面。舊資料沒有這個欄位。 */
  order: string[];
}

const STORAGE_KEY = "clinic-schedule-workshop:row-visibility:v1";
const EMPTY: RowVisibility = { hidden: [], collapsed: [], order: [] };
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: RowVisibility = EMPTY;

function read(): RowVisibility {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedValue;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as Partial<RowVisibility>) : {};
      cachedValue = {
        hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => typeof id === "string") : [],
        collapsed: Array.isArray(parsed.collapsed)
          ? parsed.collapsed.filter((role): role is PersonRole => role === "doctor" || role === "assistant")
          : [],
        order: Array.isArray(parsed.order) ? parsed.order.filter((id) => typeof id === "string") : [],
      };
    } catch {
      cachedValue = EMPTY;
    }
  }
  return cachedValue;
}

function save(next: RowVisibility) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 無法記住時只在這次畫面生效。
    cachedRaw = null;
    cachedValue = next;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useRowVisibility() {
  const value = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((other) => other !== item) : [...list, item]);
  return {
    ...value,
    isHidden: (personId: string) => value.hidden.includes(personId),
    isCollapsed: (role: PersonRole) => value.collapsed.includes(role),
    togglePerson: (personId: string) => save({ ...read(), hidden: toggle(read().hidden, personId) }),
    toggleGroup: (role: PersonRole) => save({ ...read(), collapsed: toggle(read().collapsed, role) }),
    /** 照拖動排好的順序排列。 */
    sortPeople: <T extends { id: string }>(people: T[]) => sortByOrder(people, value.order),
    /** 把 draggedId 移到 targetId 的前面或後面；people 是同一組（醫師或助理）的全部人。 */
    movePerson: (people: { id: string }[], draggedId: string, targetId: string, after: boolean) => {
      const current = read();
      const ids = moveId(sortByOrder(people, current.order).map((person) => person.id), draggedId, targetId, after);
      save({ ...current, order: [...current.order.filter((id) => !ids.includes(id)), ...ids] });
    },
    /** 這一組恢復預設順序。 */
    resetOrder: (personIds: string[]) => save({ ...read(), order: read().order.filter((id) => !personIds.includes(id)) }),
    /** 叫回這幾個人（例如某一組全部顯示）。 */
    showPeople: (personIds: string[]) => save({ ...read(), hidden: read().hidden.filter((id) => !personIds.includes(id)) }),
  };
}

/** 排過順序的人在前（照 order），沒排過的照原本順序接在後面。 */
export function sortByOrder<T extends { id: string }>(people: T[], order: string[]): T[] {
  const rank = (id: string) => {
    const index = order.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return people
    .map((person, index) => ({ person, index }))
    .sort((a, b) => rank(a.person.id) - rank(b.person.id) || a.index - b.index)
    .map(({ person }) => person);
}

/** 把 draggedId 從清單拿出來，放到 targetId 的前面或後面。 */
export function moveId(ids: string[], draggedId: string, targetId: string, after: boolean): string[] {
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) return ids;
  const rest = ids.filter((id) => id !== draggedId);
  const index = rest.indexOf(targetId) + (after ? 1 : 0);
  return [...rest.slice(0, index), draggedId, ...rest.slice(index)];
}
