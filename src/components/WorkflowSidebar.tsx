"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { isStepDone, phaseOf, stepTitle, WORKFLOW_PHASES, WORKFLOW_STEPS, type WorkflowInput, type WorkflowStepId } from "@/domain/rules/workflow";
import { Icon } from "./Icon";

/** 流程目前選的：班表日程（只有手機側欄有），或 9 步裡的一步。 */
export type WorkflowPick = "timeline" | WorkflowStepId;

/**
 * 每月排班流程（使用者 2026-10-30：9 步分成 5 段，WORKFLOW_PHASES）：一排 5 段，已完成的綠底並加 ✓；
 * 正在看的那一段下面列出它的小步驟（誰做、完成／目前），點小步驟切換要看的步驟。
 * 電腦版：每一段下面寫它第一步的日期（stepDates，日程與流程合併；使用者 2026-10-25），延遲的標紅字；
 * 標題列右邊放「調整日程」（headerExtra）。
 * 手機：螢幕最左邊有一個拉把，點一下或往右拉，滑出窄的直式時間軸側欄
 * （班表日程＋5 段，正在看的那段展開小步驟）；選一項、點外面或往左推回去就收起。
 */
export function WorkflowSidebar({
  monthLabel,
  input,
  current,
  picked,
  stepDates,
  lateSteps = [],
  headerExtra,
  lockedSteps = [],
  canPreview = false,
  onPick,
  children,
}: {
  monthLabel: string;
  input: WorkflowInput;
  current: WorkflowStepId;
  picked: WorkflowPick;
  /** 電腦版每一步下面的日期（手機不顯示，日程在側欄的「班表日程」）。 */
  stepDates?: Partial<Record<WorkflowStepId, ReactNode>>;
  lateSteps?: readonly WorkflowStepId[];
  /** 電腦版標題列右邊（已調整標示、調整日程按鈕）。 */
  headerExtra?: ReactNode;
  /** 還沒輪到的步驟（照順序走）：變灰；canPreview（最高管理者）可以點開預覽，其他人點不了。 */
  lockedSteps?: readonly WorkflowStepId[];
  canPreview?: boolean;
  onPick(pick: WorkflowPick): void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  // 拉動之後放開的那一下不要當成點擊
  const dragged = useRef(false);
  const pickedPhase = picked === "timeline" ? null : phaseOf(picked);
  const pick = (next: WorkflowPick) => {
    onPick(next);
    setMobileOpen(false);
  };

  // 手機：螢幕最左邊的拉把。按住往右拉，側欄跟著手指出來；打開後按住側欄或拉把往左推回去。
  // 放開時過了一半（或往那邊甩）就停在打開／收起，沒拉動＝點一下拉把，切換打開／收起。
  const dragStart = (event: PointerEvent<HTMLElement>) => {
    const drawer = drawerRef.current;
    if (!drawer || event.button > 0) return;
    const onTab = !!(event.target as Element).closest(".workflow-tab");
    if (!onTab && !mobileOpen) return;
    const width = drawer.querySelector<HTMLElement>(".workflow-sidebar")?.offsetWidth ?? 104;
    const base = mobileOpen ? 0 : -width;
    const sx = event.clientX;
    const sy = event.clientY;
    let x = base;
    let horizontal: boolean | null = null;
    let last = { x: sx, t: event.timeStamp };
    let speed = 0;
    const move = (ev: globalThis.PointerEvent) => {
      if (horizontal === null && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
        horizontal = Math.abs(ev.clientX - sx) > Math.abs(ev.clientY - sy);
        if (horizontal) drawer.style.transition = "none";
      }
      if (!horizontal) return;
      ev.preventDefault();
      x = Math.min(0, Math.max(-width, base + ev.clientX - sx));
      speed = (ev.clientX - last.x) / Math.max(1, ev.timeStamp - last.t);
      last = { x: ev.clientX, t: ev.timeStamp };
      drawer.style.transform = `translateX(${x}px)`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      drawer.style.transition = "";
      drawer.style.transform = "";
      if (!horizontal) return;
      dragged.current = true;
      setMobileOpen(speed > 0.4 ? true : speed < -0.4 ? false : x > -width / 2);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  /** 一段裡的小步驟：電腦版排在流程列下面（is-strip），手機側欄展開在那一段底下（is-nested）。 */
  const subSteps = (steps: readonly WorkflowStepId[], className: string) => (
    <ol className={`workflow-substeps ${className}`} aria-label={`${pickedPhase?.label ?? ""}的步驟`}>
      {steps.map((id) => {
        const step = WORKFLOW_STEPS.find((item) => item.id === id)!;
        const done = isStepDone(id, input);
        const locked = lockedSteps.includes(id);
        return (
          <li key={id}>
            <button
              className={`workflow-substep ${done ? "is-done" : id === current ? "is-current" : ""} ${id === picked ? "is-active" : ""} ${locked ? "is-locked" : ""}`}
              aria-current={id === picked ? "step" : undefined}
              disabled={locked && !canPreview}
              onClick={() => pick(id)}
            >
              <span className="workflow-substep-label">{step.label}{done && <span className="workflow-done" aria-label="已完成"> ✓</span>}</span>
              <small>{id === current && !done ? `目前・${step.actor}` : step.actor}</small>
            </button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="workflow-layout">
      {mobileOpen && <button className="workflow-sidebar-backdrop" aria-label="收起流程側欄" onClick={() => setMobileOpen(false)} />}
      <div ref={drawerRef} className={`workflow-drawer ${mobileOpen ? "is-mobile-open" : ""}`} onPointerDown={dragStart}>
      <aside id="workflow-sidebar" className="workflow-sidebar" aria-label={`${monthLabel}排班流程`}>
        <div className="workflow-title">
          <strong>{monthLabel}</strong><strong>排班流程</strong>
          {headerExtra && <span className="workflow-title-extra">{headerExtra}</span>}
        </div>
        <ol className="workflow-steps">
          <li className="workflow-timeline-item">
            <button
              className={`workflow-step is-timeline ${picked === "timeline" ? "is-active" : ""}`}
              aria-current={picked === "timeline" ? "step" : undefined}
              onClick={() => pick("timeline")}
            >
              <span className="workflow-mark" aria-hidden="true"><Icon name="calendar" size={14} /></span>
              <span className="workflow-label">班表日程</span>
            </button>
          </li>
          {WORKFLOW_PHASES.map((phase, index) => {
            const steps: readonly WorkflowStepId[] = phase.steps;
            const done = steps.every((step) => isStepDone(step, input));
            const hasCurrent = steps.includes(current);
            const state = done ? "is-done" : hasCurrent ? "is-current" : "is-todo";
            const active = pickedPhase?.id === phase.id;
            const locked = steps.every((step) => lockedSteps.includes(step));
            // 點一段：正在看就不動；有目前那一步就去那一步；做完的看最後一步；其他看第一步。
            const target = active && picked !== "timeline" ? picked : hasCurrent ? current : done ? steps[steps.length - 1] : steps[0];
            const late = steps.some((step) => !isStepDone(step, input) && lateSteps.includes(step));
            return (
              <li key={phase.id} className={state}>
                <button
                  className={`workflow-step ${state} ${active ? "is-active" : ""} ${locked ? "is-locked" : ""}`}
                  aria-current={active ? "step" : undefined}
                  disabled={locked && !canPreview}
                  title={locked ? (canPreview ? "還沒輪到這一段（最高管理者可預覽，只能看）" : "還沒輪到這一段，請先完成前面的步驟") : undefined}
                  onClick={() => pick(target)}
                >
                  <span className="workflow-mark" aria-hidden="true">{index + 1}</span>
                  <span className="workflow-label">{phase.label}</span>
                  {done && <span className="workflow-done" aria-label="已完成">✓</span>}
                  {stepDates?.[steps[0]] && <span className="workflow-step-date">{stepDates[steps[0]]}</span>}
                  {hasCurrent && !done && <small>目前</small>}
                  {late && <small className="is-late">延遲</small>}
                </button>
                {active && steps.length > 1 && subSteps(steps, "is-nested")}
              </li>
            );
          })}
        </ol>
        {pickedPhase && pickedPhase.steps.length > 1 && subSteps(pickedPhase.steps, "is-strip")}
      </aside>
      {/* 手機：貼在螢幕最左邊的灰色拉把（跟著側欄一起移動） */}
      <button
        className="workflow-tab"
        aria-expanded={mobileOpen}
        aria-controls="workflow-sidebar"
        aria-label={mobileOpen ? "收起流程側欄" : `打開流程側欄（${picked === "timeline" ? "班表日程" : `目前看${WORKFLOW_STEPS.find((step) => step.id === picked)?.label ?? ""}`}）`}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          setMobileOpen(!mobileOpen);
        }}
      >
        <span className="workflow-tab-grip" aria-hidden="true" />
      </button>
      </div>
      <div className="workflow-main">
        {/* 手機：內容上方寫出現在看哪一步，點了打開流程側欄（使用者 2026-11-01：左邊的拉把不容易發現） */}
        <button
          type="button"
          className="workflow-current-chip"
          aria-expanded={mobileOpen}
          aria-controls="workflow-sidebar"
          onClick={() => setMobileOpen(true)}
        >
          {/* 下面的標題已經寫這一步的名字，這裡寫第幾段、全部幾段，看別的步驟時再寫目前在哪 */}
          <span className="workflow-current-label">流程 第 {WORKFLOW_PHASES.indexOf(phaseOf(current)) + 1}／{WORKFLOW_PHASES.length} 段</span>
          {picked !== current && <span className="workflow-current-note">（目前在 {stepTitle(current)}）</span>}
          <span aria-hidden="true">›</span>
        </button>
        {children}
      </div>
    </div>
  );
}
