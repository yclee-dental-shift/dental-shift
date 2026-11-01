"use client";

import { courseProfile } from "@/config/clinic.config";
import type { DoctorSession } from "@/config/doctors";
import { LIMITED_BOOKING_DOCTOR_IDS } from "@/config/doctors";
import { formatDay } from "@/domain/dates";
import { describeDemand, type SessionDemand } from "@/domain/rules/assistant-demand";
import { setDayOverride, slotsFor, type DoctorSlot, type ShiftKey } from "@/domain/rules/doctor-schedule";
import { displayOrder, shortDoctorName } from "./DoctorSlotPicker";
import type { DayEditorProps } from "./DemandDayEditor";

const SHIFTS = courseProfile.shifts;

/**
 * 班表檢視點某位醫師某一天的格子：
 * 上欄改這位醫師這天早／午／晚看不看、位置（1F／2F，指定的優先於樓層規則）、不開放一般約診；
 * 下欄看同一診的其他醫師在哪一樓、需求人數怎麼算（只看，要改其他醫師打開整天的修改視窗）。
 * 修改都先放在整頁草稿。
 */
export function DoctorDayEditor({
  date,
  personId,
  demands: today,
  sessions,
  editing,
  onClose,
  onOpenDay,
}: Pick<DayEditorProps, "date" | "demands" | "sessions" | "editing" | "onClose"> & {
  personId: string;
  /** 打開整天的修改視窗（先開那一診）。 */
  onOpenDay(shiftId?: ShiftKey): void;
}) {
  const config = editing?.config;
  const name = courseProfile.people.find((person) => person.id === personId)?.displayName ?? personId;
  const closure = config?.closures.find((item) => item.date === date);
  const slotsOf = (shiftId: ShiftKey): DoctorSlot[] =>
    config
      ? slotsFor(config, date, shiftId)
      : (sessions?.find((session) => session.date === date && session.shiftId === shiftId)?.doctors ?? []).map(
          (doctor: DoctorSession["doctors"][number]) => ({ personId: doctor.personId, limited: doctor.limitedBooking }),
        );
  const save = (shiftId: ShiftKey, slots: DoctorSlot[]) => config && editing?.onChange(setDayOverride(config, date, shiftId, slots));
  const update = (shiftId: ShiftKey, change: (slot: DoctorSlot) => DoctorSlot) =>
    save(
      shiftId,
      slotsOf(shiftId).map((slot) => (slot.personId === personId ? change(slot) : slot)),
    );
  const floorNow = (shiftId: string): 1 | 2 | undefined => {
    const demand = today.find((item) => item.shiftId === shiftId);
    if (!demand) return undefined;
    return demand.floors[1].includes(personId) ? 1 : demand.floors[2].includes(personId) ? 2 : undefined;
  };
  const limitedOf = (shiftId: string, id: string) => !!slotsOf(shiftId as ShiftKey).find((slot) => slot.personId === id)?.limited;
  const names = (demand: SessionDemand, ids: string[]) =>
    displayOrder(ids.map((id) => ({ personId: id, limited: limitedOf(demand.shiftId, id) }))).map((doctor) => {
      const text = doctor.limited ? `(${shortDoctorName(doctor.personId)})` : shortDoctorName(doctor.personId);
      return (
        <span key={doctor.personId} className={doctor.personId === personId ? "is-self" : undefined}>
          {text}
        </span>
      );
    });

  return (
    <div className="day-popover doctor-day-editor" role="dialog" aria-label={`${name} ${formatDay(date)}`}>
      <span className="day-popover-head">
        <strong>
          {name}　{formatDay(date)}
        </strong>
      </span>
      {closure ? (
        <span className="day-popover-detail">這天休診（{closure.label}）。要排醫師請先打開整天的修改視窗取消休診。</span>
      ) : (
        <div className="doctor-day-mine">
          <strong className="doctor-day-title">這位醫師{config ? "（可以改）" : ""}</strong>
          {SHIFTS.map((shift) => {
            const shiftId = shift.id as ShiftKey;
            const slot = slotsOf(shiftId).find((item) => item.personId === personId);
            const current = floorNow(shiftId);
            return (
              <div key={shiftId} className={`doctor-day-row shift-block-${shiftId} ${slot ? "" : "is-off"}`}>
                <label>
                  <input
                    type="checkbox"
                    disabled={!config}
                    checked={!!slot}
                    onChange={() =>
                      save(
                        shiftId,
                        slot
                          ? slotsOf(shiftId).filter((item) => item.personId !== personId)
                          : [...slotsOf(shiftId), { personId, limited: false }],
                      )
                    }
                  />
                  {shift.label}
                </label>
                {slot ? (
                  <>
                    <label>
                      位置
                      <select
                        disabled={!config}
                        value={slot.floor ?? ""}
                        onChange={(event) =>
                          update(shiftId, (item) => {
                            const next = { ...item };
                            if (event.target.value) next.floor = Number(event.target.value) as 1 | 2;
                            else delete next.floor;
                            return next;
                          })
                        }
                      >
                        <option value="">依規則{!slot.floor && current ? `（${current}F）` : ""}</option>
                        <option value="1">1F</option>
                        <option value="2">2F</option>
                      </select>
                    </label>
                    {(LIMITED_BOOKING_DOCTOR_IDS.includes(personId) || slot.limited) && (
                      <label>
                        <input
                          type="checkbox"
                          disabled={!config}
                          checked={slot.limited}
                          onChange={() => update(shiftId, (item) => ({ ...item, limited: !item.limited }))}
                        />
                        不開放一般約診
                      </label>
                    )}
                  </>
                ) : (
                  <span className="month-empty">不看診</span>
                )}
              </div>
            );
          })}
          {config && <span className="day-popover-detail">只改這一天，按「儲存」才生效。指定位置優先於樓層規則。</span>}
        </div>
      )}
      <div className="doctor-day-others">
        <strong className="doctor-day-title">同一診的醫師與需求人數</strong>
        {today.length === 0 && <span className="day-popover-detail">這天沒有醫師看診。</span>}
        {today.map((demand) => (
          <div key={demand.shiftId} className={`demand-detail shift-block-${demand.shiftId}`}>
            <span className="demand-detail-head">
              <strong>
                {demand.shiftLabel}　共 {demand.total} 人
              </strong>
              {demand.adjustment !== 0 && <span className="day-popover-adjusted">系統算 {demand.ruleTotal} 人</span>}
            </span>
            {([1, 2] as const).map((floor) =>
              demand.floors[floor].length > 0 ? (
                <span key={floor} className="doctor-day-floor">
                  {floor}F：{names(demand, demand.floors[floor])}
                </span>
              ) : null,
            )}
            <span className="day-popover-detail">算法：{describeDemand(demand)}</span>
            {config && (
              <button className="link-button is-quiet" onClick={() => onOpenDay(demand.shiftId as ShiftKey)}>
                修改這一診的其他醫師或人數
              </button>
            )}
          </div>
        ))}
      </div>
      <span className="day-actions-buttons">
        <button className="button button-quiet" onClick={() => onOpenDay()}>
          打開整天的修改視窗
        </button>
        <button className="button button-quiet" onClick={onClose}>
          關閉
        </button>
      </span>
    </div>
  );
}
