"use client";

import { courseProfile } from "@/config/clinic.config";
import type { DoctorSession } from "@/config/doctors";
import { formatDay } from "@/domain/dates";
import { describeDemand, type SessionDemand } from "@/domain/rules/assistant-demand";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { displayOrder, shortDoctorName } from "./DoctorSlotPicker";
import { clinicDayOf, holidayNote } from "./schedule-settings";

const SHIFTS = courseProfile.shifts;
/** 滑鼠停在某一天多久才跳出提示（毫秒）：太快會干擾，太慢要等。 */
export const HOVER_DELAY_MS = 200;

/**
 * 滑鼠停留提示：停 HOVER_DELAY_MS 後記下目標與位置；只有滑鼠會觸發（手機照舊點一下）。
 * 提示放在格子右邊，右邊放不下就放左邊；超出畫面底部就往上移。
 */
export function useHoverTip<T>() {
  const [hover, setHover] = useState<{ target: T; rect: DOMRect } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const tipRef = useRef<HTMLDivElement>(null);
  const start = (target: T, event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    const element = event.currentTarget;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHover({ target, rect: element.getBoundingClientRect() }), HOVER_DELAY_MS);
  };
  const end = () => {
    window.clearTimeout(timer.current);
    setHover(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!hover || !tip) return;
    const gap = 8;
    const { rect } = hover;
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const left = rect.right + gap + width <= window.innerWidth - gap ? rect.right + gap : Math.max(gap, rect.left - gap - width);
    const top = Math.max(gap, Math.min(rect.top, window.innerHeight - gap - height));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }, [hover]);
  /** 把提示內容放到 body（不被表格捲動裁掉）。 */
  const render = (content: (target: T) => ReactNode) =>
    hover
      ? createPortal(
          <div className="demand-hover-tip" ref={tipRef} role="tooltip">
            {content(hover.target)}
          </div>,
          document.body,
        )
      : null;
  return { hover, start, end, render };
}

const limitedIn = (sessions: DoctorSession[] | undefined, demand: SessionDemand, personId: string) =>
  !!sessions
    ?.find((session) => session.date === demand.date && session.shiftId === demand.shiftId)
    ?.doctors.find((doctor) => doctor.personId === personId)?.limitedBooking;

/** 一診某一樓的醫師名字；括號＝不開放一般約診；self 標粗體。 */
function floorNames(demand: SessionDemand, ids: string[], sessions?: DoctorSession[], self?: string) {
  return displayOrder(ids.map((personId) => ({ personId, limited: limitedIn(sessions, demand, personId) }))).map((doctor, index) => {
    const text = doctor.limited ? `(${shortDoctorName(doctor.personId)})` : shortDoctorName(doctor.personId);
    return (
      <span key={doctor.personId}>
        {index > 0 && "、"}
        {doctor.personId === self ? <b>{text}</b> : text}
      </span>
    );
  });
}

/** 每一診共幾人、1F／2F 醫師、人數算法（提示與手機月曆下方的檢視共用）。 */
export function ShiftDemands({ today, sessions, self }: { today: SessionDemand[]; sessions?: DoctorSession[]; self?: string }) {
  return SHIFTS.map((shift) => {
    const demand = today.find((item) => item.shiftId === shift.id);
    if (!demand) return null;
    return (
      <div className="demand-hover-shift" key={shift.id}>
        <b>
          {shift.label}　共 {demand.total} 人{demand.adjustment !== 0 && `（系統算 ${demand.ruleTotal} 人）`}
        </b>
        {([1, 2] as const).map((floor) =>
          demand.floors[floor].length > 0 ? (
            <span key={floor}>
              {floor}F：{floorNames(demand, demand.floors[floor], sessions, self)}
            </span>
          ) : null,
        )}
        <small>{describeDemand(demand)}</small>
      </div>
    );
  });
}

export const closedText = (date: string, closureLabel?: string) =>
  holidayNote(date)?.short ?? closureLabel ?? clinicDayOf(date).label ?? "沒有醫師班";

/** 整天的提示：每一診的醫師（依樓層）與人數算法。 */
export function DayHoverContent({
  date,
  today,
  sessions,
  closureLabel,
  hint,
}: {
  date: string;
  today: SessionDemand[];
  sessions?: DoctorSession[];
  closureLabel?: string;
  hint: string;
}) {
  return (
    <>
      <strong>{formatDay(date)}</strong>
      {today.length === 0 ? <span>{closedText(date, closureLabel)}</span> : <ShiftDemands today={today} sessions={sessions} />}
      <small className="demand-hover-hint">{hint}</small>
    </>
  );
}

/**
 * 班表檢視醫師格子的提示：
 * 上欄是這位醫師這天早／午／晚看不看、在幾樓（指定或依規則）、不開放一般約診；
 * 下欄是同一天每一診的醫師樓層與需求人數算法。
 */
export function DoctorHoverContent({
  date,
  personId,
  today,
  sessions,
  closureLabel,
  hint,
}: {
  date: string;
  personId: string;
  today: SessionDemand[];
  sessions?: DoctorSession[];
  closureLabel?: string;
  hint: string;
}) {
  const name = courseProfile.people.find((person) => person.id === personId)?.displayName ?? personId;
  const mine = SHIFTS.flatMap((shift) => {
    const demand = today.find((item) => item.shiftId === shift.id);
    if (!demand?.doctorIds.includes(personId)) return [];
    const doctor = sessions
      ?.find((session) => session.date === date && session.shiftId === shift.id)
      ?.doctors.find((item) => item.personId === personId);
    const floor = demand.floors[1].includes(personId) ? 1 : demand.floors[2].includes(personId) ? 2 : undefined;
    return [{ shift, floor, fixed: !!doctor?.floor, limited: !!doctor?.limitedBooking }];
  });
  return (
    <>
      <strong>
        {name}　{formatDay(date)}
      </strong>
      {today.length === 0 ? (
        <span>{closedText(date, closureLabel)}</span>
      ) : (
        <>
          <div className="demand-hover-mine">
            {mine.length === 0 ? (
              <span>這天不看診</span>
            ) : (
              <>
                <b>看 {mine.length} 診</b>
                {mine.map(({ shift, floor, fixed, limited }) => (
                  <span key={shift.id}>
                    {shift.label}：{floor ? `${floor}F` : "—"}
                    {fixed && "（指定）"}
                    {limited && "　不開放一般約診"}
                  </span>
                ))}
              </>
            )}
          </div>
          <small className="demand-hover-section">同一天的醫師與需求人數</small>
          <ShiftDemands today={today} sessions={sessions} self={personId} />
        </>
      )}
      <small className="demand-hover-hint">{hint}</small>
    </>
  );
}
