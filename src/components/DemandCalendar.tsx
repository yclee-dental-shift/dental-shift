"use client";

import type { DoctorSession } from "@/config/doctors";
import type { SessionDemand } from "@/domain/rules/assistant-demand";
import { formatDay, todayString } from "@/domain/dates";
import { hasDayOverride, type DoctorScheduleConfig, type ShiftKey } from "@/domain/rules/doctor-schedule";
import { useEffect, useState, useSyncExternalStore } from "react";
import { DOCTORS, displayOrder, shortDoctorName } from "./DoctorSlotPicker";
import { scrollBehavior } from "./reduce-motion";
import { DemandDayEditor } from "./DemandDayEditor";
import { closedText, DayHoverContent, ShiftDemands, useHoverTip } from "./DemandHoverTip";
import type { SettingTarget } from "./DoctorScheduleSettings";
import { clinicDayOf, fullMonthLabel, holidayNote, monthDates } from "./schedule-settings";
import { courseProfile } from "@/config/clinic.config";
import { holidaySwaps } from "@/config/holiday-swaps";
import { HelpTip } from "./HelpTip";

const SHIFTS = courseProfile.shifts;
/** 週日欄很窄：只列有醫師的診；其他天固定早、午、晚三欄。 */
const shiftsOf = (weekday: number, today: SessionDemand[]) =>
  SHIFTS.filter((shift) => weekday !== 0 || today.some((demand) => demand.shiftId === shift.id));
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
/** 篩選時依點選順序配色（globals.css 的 .hl-0～.hl-5），超過就重複。 */
const HIGHLIGHT_COLORS = 6;

/** 手機版面（和 globals.css 的 760px 一致）：月曆改成「上面小月曆、下面看那一天」。 */
const MOBILE_QUERY = "(max-width: 760px)";
const subscribeMobile = (listener: () => void) => {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
const useIsMobile = () => useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);

interface Doctor {
  personId: string;
  limited: boolean;
}
const doctorText = (doctor: Doctor) => (doctor.limited ? `(${shortDoctorName(doctor.personId)})` : shortDoctorName(doctor.personId));

/**
 * 排班流程第一步「醫師與人數」的月曆：每天早、午、晚各一塊，列出那一診的醫師，最下排是需要的助理人數。
 * 點一天看算法；editing 時可以在小視窗勾那一診的醫師（單日調整）、按 ＋／－ 調整人數，
 * 並從這裡打開下方的加開、休診、固定班設定。修改都先放在整頁草稿（按「儲存」才寫入），改過的日子標「未存」。
 * notes：管理者退回時的逐日意見（標「意見」）；noteEditor：管理者在小視窗寫某天的意見。
 * 手機（使用者 2026-10-26，照 iPhone 行事曆）：點日期先在月曆下方看那天每一診的醫師、樓層、人數與算法，
 * 按「編輯這一天」才打開修改視窗。
 */
export function DemandCalendar({
  month,
  demands,
  sessions,
  editing,
  onAdjust,
  changedDates,
  notes,
  noteEditor,
}: {
  month: string;
  demands: SessionDemand[];
  /** 醫師班表的診次，用來標示「不開放一般約診」（括號）與篩選的診數。 */
  sessions?: DoctorSession[];
  /** 可以修改時傳入醫師班表與打開長期設定的方法；不傳就只能看。 */
  editing?: {
    config: DoctorScheduleConfig;
    onChange(config: DoctorScheduleConfig): void;
    openSetting(target: SettingTarget, date: string): void;
  };
  /** editing 時才會用到：不傳就不能 ＋／－。 */
  onAdjust?(key: string, adjustment: number, ruleTotal: number): void;
  /** 有未儲存修改的日子。 */
  changedDates?: Set<string>;
  /** 每天的意見（只能看），key 為日期。 */
  notes?: Record<string, string>;
  /** 管理者寫逐日意見。 */
  noteEditor?: { notes: Record<string, string>; onChange(date: string, text: string): void };
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // 點在哪一診的區塊，修改視窗就先開那一診。
  const [selectedShift, setSelectedShift] = useState<ShiftKey | undefined>(undefined);
  const picked = selected?.startsWith(month) ? selected : null;
  const mobile = useIsMobile();
  // 手機：月曆下方正在看的那一天（只是看，不會打開修改）。
  const [viewing, setViewing] = useState<string | null>(null);
  // 醫師篩選（可複選）：選中的醫師名字亮起來，其他變淡。只是檢查用，不存。
  const [highlighted, setHighlighted] = useState<string[]>([]);
  // 滑鼠停留提示：那天每一診的醫師樓層與人數算法（手機照舊點一下）。
  const hover = useHoverTip<string>();
  const toggleHighlight = (personId: string) =>
    setHighlighted((current) => (current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId]));
  // 小視窗：按 Esc 或點月曆格以外的地方就關閉。
  useEffect(() => {
    if (!picked) return;
    document.getElementById("demand-popover")?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".preview-cell.is-open")) setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [picked]);

  const dates = monthDates(month);
  // 這個月有關的國定假日調整（照常開診或補休在這個月），列在月曆下方。
  const monthSwaps = holidaySwaps.filter((swap) => swap.holiday.startsWith(month) || swap.dayOff.startsWith(month));
  const firstWeekday = new Date(`${dates[0]}T00:00:00Z`).getUTCDay();
  const limitedOf = (date: string, shiftId: string, personId: string) =>
    !!sessions
      ?.find((session) => session.date === date && session.shiftId === shiftId)
      ?.doctors.find((doctor) => doctor.personId === personId)?.limitedBooking;
  const doctorsOf = (demand: SessionDemand): Doctor[] =>
    displayOrder(demand.doctorIds.map((personId) => ({ personId, limited: limitedOf(demand.date, demand.shiftId, personId) })));
  const config = editing?.config;
  const closureOf = (date: string) => config?.closures.find((closure) => closure.date === date);
  // 手機先看今天；今天不在這個月就看第一個有醫師看診的日子。
  const today = todayString();
  const shownDay =
    viewing && dates.includes(viewing)
      ? viewing
      : dates.includes(today)
        ? today
        : (dates.find((date) => demands.some((demand) => demand.date === date)) ?? dates[0]);

  /** 一診的醫師名字；篩選時第 N 位選的醫師固定在第 N 行（沒看這診就留空），其他醫師排在下面變淡。 */
  const doctorLines = (doctors: Doctor[]) =>
    highlighted.length > 0 ? (
      <>
        {highlighted.map((id, index) => {
          const doctor = doctors.find((item) => item.personId === id);
          return doctor ? (
            <span key={id} className={`preview-doctor is-hit hl-${index % HIGHLIGHT_COLORS}`}>{doctorText(doctor)}</span>
          ) : (
            <span key={id} className="preview-doctor is-placeholder" aria-hidden="true">　</span>
          );
        })}
        {doctors.filter((doctor) => !highlighted.includes(doctor.personId)).map((doctor) => (
          <span key={doctor.personId} className="preview-doctor">{doctorText(doctor)}</span>
        ))}
      </>
    ) : (
      doctors.map((doctor) => <span key={doctor.personId} className="preview-doctor">{doctorText(doctor)}</span>)
    );

  return (
    <>
      {sessions && (
        <div className="doctor-filter" role="group" aria-label="醫師篩選">
          {DOCTORS.map((doctor) => {
            const count = sessions.filter((session) => session.doctors.some((item) => item.personId === doctor.id)).length;
            const on = highlighted.includes(doctor.id);
            return (
              <button
                key={doctor.id}
                className={`filter-chip ${on ? `is-on hl-${highlighted.indexOf(doctor.id) % HIGHLIGHT_COLORS}` : ""}`}
                aria-pressed={on}
                onClick={() => toggleHighlight(doctor.id)}
              >
                {doctor.displayName.replace(/醫師$/, "")}
                <small>{count} 診</small>
              </button>
            );
          })}
          {highlighted.length > 0 && (
            <button className="link-button" onClick={() => setHighlighted([])}>全部清除</button>
          )}
        </div>
      )}
      <p className="assistant-hint demand-legend help-line">
        最下排＝每診需求人數。
        <HelpTip title="月曆圖例" label="圖例" guide="step-demand">
          <p>每天最下排的數字＝那一診的<strong>需求人數</strong>（早／午／晚）；灰框「調」＝手動調整過；淡黃底＝國定假日照常開診。</p>
          <p>
        {mobile
          ? `點日期在月曆下方看那天的醫師、樓層與人數算法${editing ? "，要改再按「編輯這一天」；改過的日子標「未存」，按「儲存」才生效" : noteEditor ? "，按「寫這天的意見」退回時一起給排班者" : ""}。`
          : editing
            ? "點日期可以改那天的醫師、調整人數、加開或設休診；改過的日子標「未存」，按「儲存」才生效。"
            : "點日期可以看算法。"}
        {!mobile && noteEditor && "點日期可以寫那天的意見，退回時一起給排班者。"}
          </p>
        </HelpTip>
      </p>
      <div
        className={`preview-calendar demand-calendar ${highlighted.length > 0 ? "is-filtering" : ""}`}
        role="grid"
        aria-label={`${fullMonthLabel(month)}醫師與助理人數`}
      >
        {!picked &&
          hover.render((date) => (
            <DayHoverContent
              date={date}
              today={demands.filter((demand) => demand.date === date)}
              sessions={sessions}
              closureLabel={closureOf(date)?.label}
              hint={editing || noteEditor ? "點一下可以修改" : "點一下看詳細"}
            />
          ))}
        {WEEKDAYS.map((day) => <span key={day} className="leave-weekday">{day}</span>)}
        {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
        {dates.map((date) => {
          const today = demands.filter((demand) => demand.date === date);
          const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
          const adjusted = today.some((demand) => demand.adjustment !== 0);
          const overridden = !!config && hasDayOverride(config, date);
          const isOpen = picked === date;
          const isViewing = mobile && shownDay === date;
          const unsaved = !!changedDates?.has(date);
          const note = noteEditor ? noteEditor.notes[date] : notes?.[date];
          const hit = today.some((demand) => demand.doctorIds.some((id) => highlighted.includes(id)));
          const closure = closureOf(date);
          const shown = shiftsOf(weekday, today);
          // 國定假日照常開診：整格淡黃底，說明寫在月曆下方。
          const holidayWorked = holidayNote(date)?.kind === "worked";
          return (
            <div
              key={date}
              className={`preview-cell ${isOpen ? "is-open" : ""} ${hit ? "has-hit" : ""}`}
              onPointerEnter={(event) => !isOpen && hover.start(date, event)}
              onPointerLeave={hover.end}
              onPointerDown={hover.end}
            >
              <button
                className={`preview-day ${today.length === 0 ? "is-closed" : ""} ${holidayWorked && today.length > 0 ? "is-holiday-worked" : ""} ${isOpen || isViewing ? "is-selected" : ""}`}
                title={holidayWorked ? holidayNote(date)?.detail : undefined}
                aria-label={formatDay(date)}
                aria-pressed={mobile ? isViewing : isOpen}
                // 手機上點日期只是換下方看的那一天，已完成的步驟（只能看）也可以按。
                data-view-control={mobile ? "" : undefined}
                disabled={!mobile && today.length === 0 && !editing && !noteEditor && !note}
                onClick={(event) => {
                  if (mobile) {
                    setViewing(date);
                    // 月曆很長：點了把下方那天的內容捲進畫面。
                    window.requestAnimationFrame(() =>
                      document.querySelector(".demand-day-detail")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }),
                    );
                    return;
                  }
                  const shift = (event.target as Element).closest("[data-shift]")?.getAttribute("data-shift") as ShiftKey | null;
                  if (isOpen && !shift) return setSelected(null);
                  setSelectedShift(shift ?? undefined);
                  setSelected(date);
                }}
              >
                <strong>
                  {Number(date.slice(8, 10))}
                  {(adjusted || overridden) && (
                    <span className="adjusted-mark" title={[overridden && "這天有改醫師", adjusted && "這天有手動調整人數"].filter(Boolean).join("、")}>
                      調
                    </span>
                  )}
                  {unsaved && <span className="unsaved-mark" title="這天有還沒儲存的修改">未存</span>}
                  {note && <span className="note-mark" title={note}>意見</span>}
                </strong>
                {today.length === 0 ? (
                  <span className="clinic-closed" title={holidayNote(date)?.detail}>
                    {holidayNote(date)?.short ?? closure?.label ?? clinicDayOf(date).label ?? "沒有醫師班"}
                  </span>
                ) : (
                  <>
                    <span className={`preview-shifts ${weekday === 0 ? "is-stacked" : ""}`}>
                      {shown.map((shift) => {
                        const demand = today.find((item) => item.shiftId === shift.id);
                        return (
                          <span key={shift.id} data-shift={shift.id} className={`preview-shift shift-block-${shift.id} ${demand ? "" : "is-empty"}`}>
                            <span className={`month-tag shift-${shift.id}`}>{shift.label.slice(0, 1)}</span>
                            {demand ? doctorLines(doctorsOf(demand)) : <span className="month-empty">—</span>}
                          </span>
                        );
                      })}
                    </span>
                    {/* 需求人數固定在格子最下排，醫師多寡不影響對齊。 */}
                    <span className="demand-needs">
                      {shown.map((shift) => {
                        const demand = today.find((item) => item.shiftId === shift.id);
                        return (
                          <span
                            key={shift.id}
                            data-shift={shift.id}
                            className={`demand-need shift-block-${shift.id} ${demand ? "" : "is-empty"} ${demand?.adjustment ? "is-adjusted" : ""}`}
                            title={demand ? `${shift.label}需求 ${demand.total} 人` : undefined}
                          >
                            {demand ? demand.total : ""}
                          </span>
                        );
                      })}
                    </span>
                  </>
                )}
              </button>
              {isOpen && (
                <DemandDayEditor
                  key={`${date}_${selectedShift ?? ""}`}
                  date={date}
                  initialShift={selectedShift}
                  demands={today}
                  sessions={sessions}
                  editing={editing}
                  onAdjust={onAdjust}
                  note={note}
                  noteEditor={noteEditor}
                  onClose={() => setSelected(null)}
                  className={`day-popover ${weekday >= 4 ? "open-left" : ""}`}
                />
              )}
            </div>
          );
        })}
      </div>
      {mobile && (
        <DemandDayDetail
          date={shownDay}
          today={demands.filter((demand) => demand.date === shownDay)}
          sessions={sessions}
          closureLabel={closureOf(shownDay)?.label}
          marks={[
            !!config && hasDayOverride(config, shownDay) && "這天有改醫師",
            demands.some((demand) => demand.date === shownDay && demand.adjustment !== 0) && "這天有手動調整人數",
            !!changedDates?.has(shownDay) && "還沒儲存",
          ].filter((mark): mark is string => !!mark)}
          note={noteEditor ? noteEditor.notes[shownDay] : notes?.[shownDay]}
          editLabel={editing ? "編輯這一天" : noteEditor ? "寫這天的意見" : undefined}
          onEdit={() => {
            setSelectedShift(undefined);
            setSelected(shownDay);
          }}
        />
      )}
      {monthSwaps.length > 0 && (
        <ul className="holiday-swap-notes">
          {monthSwaps.map((swap) => (
            <li key={swap.holiday}>
              {formatDay(swap.holiday)} {swap.fullName}照常開診，原假日改到 {formatDay(swap.dayOff)} 休診。
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** 手機月曆下方：選定那天每一診的醫師（依樓層）、需求人數與算法，只能看；按鈕才打開修改視窗。 */
function DemandDayDetail({
  date,
  today,
  sessions,
  closureLabel,
  marks,
  note,
  editLabel,
  onEdit,
}: {
  date: string;
  today: SessionDemand[];
  sessions?: DoctorSession[];
  closureLabel?: string;
  marks: string[];
  note?: string;
  editLabel?: string;
  onEdit(): void;
}) {
  return (
    <section className="demand-day-detail" aria-label={`${formatDay(date)}醫師與人數`}>
      <h3>{formatDay(date)}</h3>
      {marks.length > 0 && <p className="demand-day-marks">{marks.join("・")}</p>}
      {today.length === 0 ? (
        <p className="assistant-empty">{holidayNote(date)?.detail ?? closedText(date, closureLabel)}</p>
      ) : (
        <>
          <div className="demand-day-shifts">
            <ShiftDemands today={today} sessions={sessions} />
          </div>
          <p className="demand-day-legend">括號＝不開放一般約診。</p>
        </>
      )}
      {note && <p className="demand-day-note">意見：{note}</p>}
      {editLabel && (
        <button type="button" className="button demand-day-edit" onClick={onEdit}>
          {editLabel}
        </button>
      )}
    </section>
  );
}
