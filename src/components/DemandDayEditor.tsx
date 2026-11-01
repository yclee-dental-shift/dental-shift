"use client";

import { courseProfile } from "@/config/clinic.config";
import type { DoctorSession } from "@/config/doctors";
import { formatDay } from "@/domain/dates";
import { describeDemand, sessionKey, type SessionDemand } from "@/domain/rules/assistant-demand";
import {
  clearDayOverrides,
  hasDayOverride,
  removeClosure,
  setDayOverride,
  slotsFor,
  WEEKDAY_LABELS,
  type DoctorScheduleConfig,
  type ShiftKey,
} from "@/domain/rules/doctor-schedule";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { DoctorSlotPicker, displayOrder, shortDoctorName } from "./DoctorSlotPicker";
import type { SettingTarget } from "./DoctorScheduleSettings";
import { HolidayNote } from "./HolidayNote";
import { useSheetDrag } from "./useSheetDrag";

const SHIFTS = courseProfile.shifts;

export interface DayEditorProps {
  date: string;
  /** 這一天各診的需求。 */
  demands: SessionDemand[];
  sessions?: DoctorSession[];
  /** 可以修改時傳入醫師班表；不傳就只能看。 */
  editing?: {
    config: DoctorScheduleConfig;
    onChange(config: DoctorScheduleConfig): void;
    openSetting(target: SettingTarget, date: string): void;
  };
  onAdjust?(key: string, adjustment: number, ruleTotal: number): void;
  /** 這天的意見（只能看）。 */
  note?: string;
  /** 管理者寫逐日意見。 */
  noteEditor?: { notes: Record<string, string>; onChange(date: string, text: string): void };
  onClose(): void;
  /** 先打開哪一診（例如點在午診區塊）；沒有＝那天第一個有醫師的診。 */
  initialShift?: ShiftKey;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

/**
 * 「醫師與人數」某一天的修改視窗：切換早／午／晚、勾那一診的醫師（單日調整）、＋／－人數、
 * 加開、休診、改固定班、寫意見。月曆檢視與班表檢視共用；修改都先放在整頁草稿。
 */
export function DemandDayEditor({
  date,
  demands: today,
  sessions,
  editing,
  onAdjust,
  note,
  noteEditor,
  onClose,
  initialShift,
  className = "day-popover",
  style,
  ref,
}: DayEditorProps) {
  const own = useRef<HTMLDivElement | null>(null);
  const setRef = (node: HTMLDivElement | null) => {
    own.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
  };
  // 手機上是下方視窗：往下拉關閉。
  useSheetDrag(own, onClose);
  const [popShift, setPopShift] = useState<ShiftKey | null>(initialShift ?? null);
  const editShift: ShiftKey = popShift ?? ((today[0]?.shiftId as ShiftKey | undefined) ?? "morning");
  const editDemand = today.find((demand) => demand.shiftId === editShift);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const config = editing?.config;
  const save = (value: DoctorScheduleConfig) => editing?.onChange(value);
  const closure = config?.closures.find((item) => item.date === date);
  const overridden = !!config && hasDayOverride(config, date);
  const limitedOf = (shiftId: string, personId: string) =>
    !!sessions
      ?.find((session) => session.date === date && session.shiftId === shiftId)
      ?.doctors.find((doctor) => doctor.personId === personId)?.limitedBooking;
  const doctorNames = (demand: SessionDemand) =>
    displayOrder(demand.doctorIds.map((personId) => ({ personId, limited: limitedOf(demand.shiftId, personId) })))
      .map((doctor) => (doctor.limited ? `(${shortDoctorName(doctor.personId)})` : shortDoctorName(doctor.personId)))
      .join("、");
  const openSetting = (target: SettingTarget) => {
    onClose();
    editing?.openSetting(target, date);
  };

  const adjustControls = (demand: SessionDemand) => {
    const key = sessionKey(demand.date, demand.shiftId);
    if (!onAdjust) return <strong>{demand.total} 人</strong>;
    return (
      <span className="demand-adjust">
        <button
          className="button button-quiet"
          aria-label={`${demand.shiftLabel}少 1 人`}
          disabled={demand.total === 0}
          onClick={() => onAdjust(key, demand.adjustment - 1, demand.ruleTotal)}
        >
          －
        </button>
        <strong>{demand.total} 人</strong>
        <button
          className="button button-quiet"
          aria-label={`${demand.shiftLabel}多 1 人`}
          onClick={() => onAdjust(key, demand.adjustment + 1, demand.ruleTotal)}
        >
          ＋
        </button>
        {demand.adjustment !== 0 && (
          <button className="link-button" onClick={() => onAdjust(key, 0, demand.ruleTotal)}>
            恢復系統人數
          </button>
        )}
      </span>
    );
  };

  return (
    <div className={className} style={style} ref={setRef} id="demand-popover" role="dialog" aria-label={`${formatDay(date)}的醫師與人數`}>
      <span className="day-popover-head">
        <strong>
          {formatDay(date)}
          <HolidayNote date={date} />
        </strong>
        {config && overridden && (
          <span className="day-popover-adjusted">
            這天有改醫師
            <button className="link-button" onClick={() => save(clearDayOverrides(config, date))}>恢復成固定班</button>
          </span>
        )}
      </span>
      {config ? (
        closure ? (
          <span className="day-popover-detail">休診（{closure.label}）。要排醫師請先按「取消休診」。</span>
        ) : (
          <>
            <span className="chip-row" role="tablist" aria-label="診別">
              {SHIFTS.map((shift) => {
                const demand = today.find((item) => item.shiftId === shift.id);
                return (
                  <button
                    key={shift.id}
                    role="tab"
                    aria-selected={shift.id === editShift}
                    className={`reason-chip ${shift.id === editShift ? "is-active" : ""}`}
                    onClick={() => setPopShift(shift.id as ShiftKey)}
                  >
                    {shift.label}（{demand ? `需 ${demand.total}` : "未開"}）
                  </button>
                );
              })}
            </span>
            <div className={`demand-detail shift-block-${editShift}`}>
              {editDemand ? (
                <>
                  <span className="demand-detail-head">
                    <strong>需求人數</strong>
                    {editDemand.adjustment !== 0 && <span className="day-popover-adjusted">系統算 {editDemand.ruleTotal} 人</span>}
                  </span>
                  {adjustControls(editDemand)}
                  <span className="day-popover-detail">算法：{describeDemand(editDemand)}</span>
                </>
              ) : (
                <span className="day-popover-detail">這一診沒有醫師，不需要助理。勾醫師就會開診。</span>
              )}
            </div>
            <span className="day-popover-detail">
              醫師：只改這一天的{SHIFTS.find((shift) => shift.id === editShift)?.label}，勾了人數馬上更新，按「儲存」才生效；其他{WEEKDAY_LABELS[weekday]}不受影響。
            </span>
            <DoctorSlotPicker
              slots={slotsFor(config, date, editShift)}
              onChange={(slots) => save(setDayOverride(config, date, editShift, slots))}
            />
          </>
        )
      ) : (
        today.map((demand) => (
          <div key={demand.shiftId} className={`demand-detail shift-block-${demand.shiftId}`}>
            <span className="demand-detail-head">
              <strong>{demand.shiftLabel}：需 {demand.total} 人</strong>
              {demand.adjustment !== 0 && <span className="day-popover-adjusted">系統算 {demand.ruleTotal} 人</span>}
            </span>
            <span className="day-popover-detail">醫師：{doctorNames(demand)}</span>
            <span className="day-popover-detail">算法：{describeDemand(demand)}</span>
          </div>
        ))
      )}
      {noteEditor ? (
        <label className="day-note">
          這天的意見（退回時給排班者）
          <textarea
            value={noteEditor.notes[date] ?? ""}
            maxLength={200}
            placeholder="例如：早診 4 人太多，請改 3 人"
            onChange={(event) => noteEditor.onChange(date, event.target.value)}
          />
        </label>
      ) : (
        note && <span className="month-status-warn day-note">管理者意見：{note}</span>
      )}
      <span className="day-actions-buttons">
        {config && (
          <>
            <button className="button button-quiet" onClick={() => openSetting("visit")}>這天加開</button>
            {closure ? (
              <button
                className="button button-danger"
                onClick={() => {
                  if (!window.confirm(`取消 ${formatDay(date)}（${closure.label}）休診？那天會依固定班看診。`)) return;
                  save(removeClosure(config, date));
                }}
              >
                取消休診
              </button>
            ) : (
              <button className="button button-quiet" onClick={() => openSetting("closure")}>設為休診</button>
            )}
            {weekday !== 0 && (
              <button className="button button-quiet" onClick={() => openSetting("weekly")}>
                改{WEEKDAY_LABELS[weekday]}的固定班
              </button>
            )}
          </>
        )}
        <button className="button button-quiet" onClick={onClose}>關閉</button>
      </span>
    </div>
  );
}

/**
 * 班表檢視用的浮動視窗：浮在點的那一欄旁邊（右邊放不下就放左邊、不超出畫面底部），
 * 捲動時跟著那一欄移動；按 Esc 或點視窗與班表以外的地方就關閉。
 */
const firstChild = (host: HTMLElement) => host.firstElementChild as HTMLElement | null;

export function FloatingPanel({ anchor, onClose, children }: { anchor: HTMLElement; onClose(): void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  // 手機上是下方視窗：往下拉關閉（`useSheetDrag`）。
  useSheetDrag(box, onClose, { target: firstChild });
  useLayoutEffect(() => {
    const place = () => {
      const shell = box.current;
      if (!shell) return;
      const rect = anchor.getBoundingClientRect();
      const gap = 8;
      const width = shell.offsetWidth;
      const height = shell.offsetHeight;
      const left = rect.right + gap + width <= window.innerWidth - gap ? rect.right + gap : Math.max(gap, rect.left - gap - width);
      const top = Math.max(gap, Math.min(rect.top, window.innerHeight - gap - height));
      shell.style.left = `${left}px`;
      shell.style.top = `${top}px`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    // 視窗內容自己變高（例如展開選項）時也重新定位，避免超出畫面底部。
    const observer = new ResizeObserver(place);
    if (box.current) observer.observe(box.current);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      // 點到班表的日期／格子由班表處理（換一天或換人），不在這裡關。
      if (!target || box.current?.contains(target) || target.closest(".month-grid")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);
  return createPortal(
    <div className="floating-shell" ref={box}>
      {children}
    </div>,
    document.body,
  );
}
