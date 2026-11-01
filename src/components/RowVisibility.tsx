"use client";

import type { CoursePerson, PersonRole } from "@/domain/types";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRowVisibility } from "./useRowVisibility";

const ROLE_LABELS: Record<PersonRole, string> = { doctor: "醫師", assistant: "助理" };

/**
 * 班表裡的組別標題列「醫師 9 人 ▾」：點一下整組收起／展開。
 * 滑鼠移上去（手機點「⋯」）跳出這組人員清單，點名字顯示／隱藏，被隱藏的變淡。
 * 清單放到 body（portal）並用 fixed 定位，才不會被可捲動的班表或固定欄蓋住。
 */
export function GroupHeaderRow({ role, people, colSpan }: { role: PersonRole; people: CoursePerson[]; colSpan: number }) {
  const visibility = useRowVisibility();
  const collapsed = visibility.isCollapsed(role);
  const anchor = useRef<HTMLSpanElement>(null);
  const popover = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const open = () => {
    window.clearTimeout(closeTimer.current);
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    // 清單最寬 520px；靠右時往左移，手機上不超出螢幕（左右各留 16px）。
    const width = Math.min(520, window.innerWidth - 32);
    setPosition({ top: rect.bottom, left: Math.max(16, Math.min(rect.left, window.innerWidth - 16 - width)) });
  };
  // 移到清單之間會短暫離開，稍等再關，避免一移就消失。
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPosition(null), 200);
  };
  // 捲動或點到別處就關閉（fixed 位置不會跟著捲）。
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onPointer = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !(anchor.current?.contains(target) || popover.current?.contains(target))) close();
    };
    window.addEventListener("scroll", close, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [position]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const hiddenHere = people.filter((person) => visibility.isHidden(person.id));
  const reordered = people.some((person) => visibility.order.includes(person.id));
  return (
    <tr className="group-row">
      <th colSpan={colSpan}>
        <span className="group-menu" ref={anchor} onMouseEnter={open} onMouseLeave={closeSoon}>
          <button className="group-toggle" aria-expanded={!collapsed} onClick={() => visibility.toggleGroup(role)}>
            {ROLE_LABELS[role]} {people.length} 人{collapsed ? "・已收起 ▸" : " ▾"}
          </button>
          <button
            className="group-more print-only-hide"
            aria-label={`${ROLE_LABELS[role]}人員清單`}
            aria-expanded={!!position}
            onClick={open}
          >
            ⋯
          </button>
          {position &&
            createPortal(
              <span
                className="group-popover"
                ref={popover}
                role="group"
                aria-label={`${ROLE_LABELS[role]}顯示／隱藏`}
                style={{ top: position.top, left: position.left }}
                onMouseEnter={open}
                onMouseLeave={closeSoon}
              >
                <small>點名字顯示／隱藏{collapsed ? "（整組目前收起，點上面標題展開）" : ""}</small>
                <span className="group-popover-people">
                  {visibility.sortPeople(people).map((person) => {
                    const hidden = visibility.isHidden(person.id);
                    return (
                      <button
                        key={person.id}
                        className={`person-chip ${hidden ? "is-hidden" : ""}`}
                        aria-pressed={!hidden}
                        title={hidden ? "點一下顯示" : "點一下隱藏"}
                        onClick={() => visibility.togglePerson(person.id)}
                      >
                        {person.displayName}
                      </button>
                    );
                  })}
                </span>
                {hiddenHere.length > 0 && (
                  <button className="link-button is-quiet" onClick={() => visibility.showPeople(hiddenHere.map((person) => person.id))}>
                    全部顯示
                  </button>
                )}
                {reordered && (
                  <button className="link-button is-quiet" onClick={() => visibility.resetOrder(people.map((person) => person.id))}>
                    恢復預設順序
                  </button>
                )}
              </span>,
            document.body,
          )}
        </span>
      </th>
    </tr>
  );
}

/** 這組要畫出來的人（收起時沒有、隱藏的不畫），照拖動排好的順序。 */
export function useVisiblePeople() {
  const visibility = useRowVisibility();
  return (role: PersonRole, people: CoursePerson[]) =>
    visibility.isCollapsed(role) ? [] : visibility.sortPeople(people).filter((person) => !visibility.isHidden(person.id));
}

// 正在拖的人（dragover 時讀不到 dataTransfer 的內容，所以另外記）。
let dragging: CoursePerson | null = null;

/**
 * 每一列最左邊的名字格：按住往上或往下拖可以改順序，只能在同一組（醫師／助理）裡移動。
 * group 是這一組的全部人（含隱藏的），用來算新的順序。
 */
export function DraggableNameCell({ person, group, children }: { person: CoursePerson; group: CoursePerson[]; children: ReactNode }) {
  const visibility = useRowVisibility();
  const [drop, setDrop] = useState<"before" | "after" | null>(null);
  const sameGroup = () => dragging !== null && dragging.id !== person.id && dragging.role === person.role;
  return (
    <th
      scope="row"
      draggable
      className={`draggable-name ${drop ? `is-drop-${drop}` : ""}`}
      title="按住名字往上或往下拖，可以改順序"
      onDragStart={(event) => {
        dragging = person;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", person.displayName);
      }}
      onDragEnd={() => {
        dragging = null;
      }}
      onDragOver={(event) => {
        if (!sameGroup()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        setDrop(event.clientY > rect.top + rect.height / 2 ? "after" : "before");
      }}
      onDragLeave={() => setDrop(null)}
      onDrop={(event) => {
        event.preventDefault();
        if (sameGroup() && drop && dragging) visibility.movePerson(group, dragging.id, person.id, drop === "after");
        dragging = null;
        setDrop(null);
      }}
    >
      {children}
    </th>
  );
}

/** 名字旁的小「－」：隱藏這一列。 */
export function HideRowButton({ person }: { person: CoursePerson }) {
  const visibility = useRowVisibility();
  return (
    <button
      className="hide-row-button print-only-hide"
      aria-label={`隱藏 ${person.displayName}`}
      title="隱藏這一列（滑鼠移到組別標題可叫回）"
      onClick={(event) => {
        event.stopPropagation();
        visibility.togglePerson(person.id);
      }}
    >
      －
    </button>
  );
}
