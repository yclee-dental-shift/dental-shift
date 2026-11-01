"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { courseProfile } from "@/config/clinic.config";
import {
  addWeeklyVersion,
  removeWeeklyVersion,
  setWeeklySlots,
  SHIFT_KEYS,
  WEEKDAY_LABELS,
  type DoctorScheduleConfig,
  type DoctorSlot,
  type ShiftKey,
} from "@/domain/rules/doctor-schedule";
import { DoctorChips, DoctorSlotPicker, shortDoctorName as shortName } from "./DoctorSlotPicker";
import { fullMonthLabel } from "./schedule-settings";
import { HelpTip } from "./HelpTip";

const WEEKDAYS = [1, 2, 3, 4, 5, 6];
const shiftLabel = (shiftId: string) => courseProfile.shifts.find((shift) => shift.id === shiftId)?.label ?? shiftId;

/**
 * 每週固定班：選版本、點格子勾醫師（可標不開放一般約診）、新增／刪除「從某月起生效」的版本。改的內容先放在整頁草稿，按「儲存」才寫入。
 * focus：從預覽月曆點某天「改固定班」時，直接切到那個月的版本並打開那天星期的格子（父層用 key 重新掛載）。
 */
export function WeeklyTemplateEditor({
  config,
  month,
  focus,
  onChange,
}: {
  config: DoctorScheduleConfig;
  month: string;
  focus?: { month: string; weekday: number };
  onChange(config: DoctorScheduleConfig): void;
}) {
  const versions = [...config.weekly].sort((a, b) => a.from.localeCompare(b.from));
  const inEffect = versions.filter((version) => version.from <= (focus?.month ?? month)).pop() ?? versions[0];
  const [picked, setPicked] = useState<string | null>(null);
  const selected = versions.find((version) => version.from === picked) ?? inEffect;
  const [cell, setCell] = useState<{ weekday: number; shiftId: ShiftKey } | null>(() => {
    if (!focus) return null;
    // 打開那天星期第一個有醫師的診；都沒有就打開早診。
    const shiftId = SHIFT_KEYS.find((id) => inEffect?.slots[focus.weekday]?.[id]?.length) ?? "morning";
    return { weekday: focus.weekday, shiftId };
  });
  const [newFrom, setNewFrom] = useState("");
  const next = versions[versions.indexOf(selected) + 1];
  const save = onChange;

  // 選醫師的小視窗：開在點的格子旁邊（表格會左右捲動，所以用畫面座標定位）。
  const popRef = useRef<HTMLDivElement>(null);
  const [popStyle, setPopStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const cellKey = cell ? `${cell.weekday}-${cell.shiftId}` : null;
  useLayoutEffect(() => {
    if (!cellKey) return;
    const place = () => {
      const anchor = document.querySelector(`[data-weekly-cell="${cellKey}"]`);
      const pop = popRef.current;
      if (!anchor || !pop) return;
      const rect = anchor.getBoundingClientRect();
      const gap = 8;
      const width = Math.min(340, window.innerWidth - 16);
      // 下方放得下就開在下方，否則上方；都放不下就開在空間大的一邊，裡面捲動。
      const height = pop.scrollHeight;
      const below = rect.bottom + gap;
      const spaceBelow = window.innerHeight - below - gap;
      const spaceAbove = rect.top - gap * 2;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      if (height <= spaceBelow || spaceBelow >= spaceAbove) {
        setPopStyle({ top: below, left, width, maxHeight: Math.max(160, spaceBelow) });
      } else {
        const shown = Math.min(height, spaceAbove);
        setPopStyle({ top: rect.top - gap - shown, left, width, maxHeight: spaceAbove });
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [cellKey]);
  // 按 Esc 或點格子、小視窗以外的地方就關閉。
  useEffect(() => {
    if (!cellKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCell(null);
    };
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".weekly-popover, .weekly-cell")) setCell(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [cellKey]);

  const slotsOf = (weekday: number, shiftId: ShiftKey): DoctorSlot[] => selected?.slots[weekday]?.[shiftId] ?? [];
  const updateSlots = (weekday: number, shiftId: ShiftKey, slots: DoctorSlot[]) =>
    save(setWeeklySlots(config, selected.from, weekday, shiftId, slots));
  const addVersion = () => {
    if (!newFrom) return;
    if (versions.some((version) => version.from === newFrom)) {
      window.alert(`${fullMonthLabel(newFrom)}起的版本已經有了。`);
      return;
    }
    save(addWeeklyVersion(config, newFrom));
    setPicked(newFrom);
    setNewFrom("");
  };
  const removeVersion = () => {
    if (!window.confirm(`刪除「${fullMonthLabel(selected.from)}起」的固定班？這段期間會改用前一個版本。`)) return;
    save(removeWeeklyVersion(config, selected.from));
    setPicked(null);
  };

  return (
    <>
      <div className="version-bar" role="tablist" aria-label="固定班版本">
        {versions.map((version) => (
          <button
            key={version.from}
            role="tab"
            aria-selected={version.from === selected.from}
            className={`reason-chip ${version.from === selected.from ? "is-active" : ""}`}
            onClick={() => {
              setPicked(version.from);
              setCell(null);
            }}
          >
            {fullMonthLabel(version.from)}起
          </button>
        ))}
        <span className="version-add">
          <input
            type="month"
            aria-label="新版本從哪個月起"
            min={config.firstMonth}
            value={newFrom}
            onChange={(event) => setNewFrom(event.target.value)}
          />
          <button className="button button-quiet" disabled={!newFrom} onClick={addVersion}>新增版本</button>
        </span>
      </div>
      <p className="assistant-hint">
        正在看「{fullMonthLabel(selected.from)}起」：用在 {fullMonthLabel(selected.from)}～{next ? `${fullMonthLabel(next.from)}之前` : "之後所有月份"}。
        <strong className="edit-hint">點格子就能修改</strong>。
        <HelpTip title="每週固定班">
          <p>點格子就能修改，改好後按上方「儲存」。</p>
          <p>括號＝有看診但不開放一般約診。</p>
        </HelpTip>
        {selected.from !== versions[0].from && (
          <button className="link-button" onClick={removeVersion}>刪除這個版本</button>
        )}
      </p>
      <div className="table-scroll">
        {/* 橫列是診別、直欄是星期，和一般看診表一樣從左到右看一週。 */}
        <table className="info-table weekly-table">
          <thead>
            <tr>
              <th scope="col">診別</th>
              {WEEKDAYS.map((weekday) => <th scope="col" key={weekday}>{WEEKDAY_LABELS[weekday]}</th>)}
            </tr>
          </thead>
          <tbody>
            {SHIFT_KEYS.map((shiftId) => (
              <tr key={shiftId}>
                <th scope="row">
                  <span className={`month-tag shift-${shiftId}`}>{shiftLabel(shiftId).slice(0, 1)}</span> {shiftLabel(shiftId)}
                </th>
                {WEEKDAYS.map((weekday) => {
                  const slots = slotsOf(weekday, shiftId);
                  const active = cell?.weekday === weekday && cell.shiftId === shiftId;
                  return (
                    <td key={weekday}>
                      <button
                        className={`weekly-cell ${active ? "is-selected" : ""}`}
                        data-weekly-cell={`${weekday}-${shiftId}`}
                        aria-expanded={active}
                        aria-label={`${WEEKDAY_LABELS[weekday]}${shiftLabel(shiftId)}：${slots.map((slot) => shortName(slot.personId)).join("、") || "沒有醫師"}`}
                        onClick={() => setCell(active ? null : { weekday, shiftId })}
                      >
                        <DoctorChips slots={slots} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cell && (
        <div
          className="weekly-popover"
          ref={popRef}
          style={popStyle}
          role="dialog"
          aria-label={`${WEEKDAY_LABELS[cell.weekday]}${shiftLabel(cell.shiftId)}的醫師`}
        >
          <strong>
            {fullMonthLabel(selected.from)}起・{WEEKDAY_LABELS[cell.weekday]}{shiftLabel(cell.shiftId)}
          </strong>
          <DoctorSlotPicker slots={slotsOf(cell.weekday, cell.shiftId)} onChange={(slots) => updateSlots(cell.weekday, cell.shiftId, slots)} />
          <span className="assistant-hint">按上方「儲存」才生效；每個{WEEKDAY_LABELS[cell.weekday]}都會套用（這個版本內）。</span>
          <button className="button button-quiet" onClick={() => setCell(null)}>完成</button>
        </div>
      )}
    </>
  );
}
