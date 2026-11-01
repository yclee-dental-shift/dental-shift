"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LIMITED_BOOKING_RULES, SESSION_EXCLUSION_RULES } from "@/config/doctors";

import { todayString } from "@/domain/dates";
import { extendCalendar, isDoctorScheduleConfig, type DoctorScheduleConfig } from "@/domain/rules/doctor-schedule";
import { resetDoctorSchedule, saveDoctorSchedule } from "@/data/doctor-schedule-store";
import { ClosureEditor } from "./ClosureEditor";
import { scrollBehavior } from "./reduce-motion";
import { VisitEditor } from "./VisitEditor";
import { WeeklyTemplateEditor } from "./WeeklyTemplateEditor";
import { fullMonthLabel } from "./schedule-settings";
import { HelpTip } from "./HelpTip";

export type SettingTarget = "weekly" | "visit" | "closure";
export interface SettingFocus {
  target: SettingTarget;
  date?: string;
  /** 每次點擊都不同，讓編輯區重新打開並捲過去。 */
  nonce: number;
}

type SectionId = SettingTarget | "range" | "backup";


/**
 * 醫師班表的長期設定（原本的「醫師班表」頁）：每週固定班、專科醫師來診日、休診日、行事曆範圍、備份與還原。
 * 放在排班流程第一步的月曆下面，預設收合；從月曆點「這天加開／設為休診／改固定班」會打開對應的區塊並捲過去。
 */
export function DoctorScheduleSettings({
  config,
  month,
  focus,
  onChange,
  dirty,
  onDiscard,
}: {
  /** 畫面上的醫師班表（含未儲存的草稿）。 */
  config: DoctorScheduleConfig;
  month: string;
  focus: SettingFocus | null;
  /** 修改放進整頁草稿。 */
  onChange(config: DoctorScheduleConfig): void;
  /** 有未儲存的修改；匯入、還原會直接寫入並放棄草稿。 */
  dirty: boolean;
  onDiscard(): void;
}) {
  const [opened, setOpened] = useState<SectionId[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // 從月曆跳過來的區塊先打開；使用者自己收起後就不再強制打開（直到下一次跳過來）。
  const [dismissed, setDismissed] = useState<number | null>(null);
  const isOpen = (id: SectionId) => opened.includes(id) || (focus?.target === id && dismissed !== focus.nonce);
  const toggle = (id: SectionId, open: boolean) => {
    if (open === isOpen(id)) return;
    if (!open && focus?.target === id) setDismissed(focus.nonce);
    setOpened((current) => (open ? [...new Set([...current, id])] : current.filter((item) => item !== id)));
  };
  // 外面整組平常收成一行（使用者 2026-10-30）；從月曆跳過來時跟著打開，自己收起後要等下一次跳過來才再打開。
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupDismissed, setGroupDismissed] = useState<number | null>(null);
  const groupIsOpen = groupOpen || (!!focus && groupDismissed !== focus.nonce);
  const toggleGroup = (open: boolean) => {
    if (open === groupIsOpen) return;
    if (!open && focus) setGroupDismissed(focus.nonce);
    setGroupOpen(open);
  };
  useEffect(() => {
    if (focus) document.getElementById(`edit-${focus.target}`)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [focus]);

  const unsavedNote = dirty ? "還沒儲存的修改會一起放棄。" : "";
  const nextYearEnd = `${Number(config.lastMonth.slice(0, 4)) + 1}-12`;
  function extend() {
    if (!window.confirm(`把行事曆延長到 ${fullMonthLabel(nextYearEnd)}？這段期間會依固定班排出醫師；記得在「休診日」補上國定假日，並設定專科醫師來診日。`)) return;
    onChange(extendCalendar(config, nextYearEnd));
  }
  function downloadBackup() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `doctor-schedule-${todayString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("已下載醫師班表備份。");
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDoctorScheduleConfig(parsed)) throw new Error("格式不符");
      if (!window.confirm(`用這個備份取代目前的醫師班表？${unsavedNote}匯入會直接儲存。`)) return;
      const saved = saveDoctorSchedule(parsed);
      if (saved) onDiscard();
      setMessage(saved ? "已匯入醫師班表備份。" : "無法儲存（瀏覽器不允許寫入）。");
    } catch {
      setMessage("這個檔案不是醫師班表備份，沒有匯入。");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const section = (id: SectionId, title: string, hint: string, body: ReactNode) => (
    <details
      className="setting-section scroll-target"
      id={`edit-${id}`}
      open={isOpen(id)}
      onToggle={(event) => toggle(id, event.currentTarget.open)}
    >
      <summary>
        <strong>{title}</strong>
        <small>{hint}</small>
      </summary>
      <div className="setting-body">{body}</div>
    </details>
  );

  return (
    <details className="doctor-settings tool-details" open={groupIsOpen} onToggle={(event) => toggleGroup(event.currentTarget.open)}>
      <summary className="help-line">
        <strong>醫師班表長期設定</strong>
        <small className="assistant-hint">每週固定班、來診日、休診日、行事曆範圍、備份</small>
        <HelpTip title="醫師班表長期設定" guide="doctor-settings">
          <p>每月醫師看診＝每週固定班＋專科醫師來診日，扣掉休診日。</p>
          <p>這裡的修改和上面月曆一起，按「儲存」後才會帶到班表；只存在這台電腦的瀏覽器。</p>
        </HelpTip>
      </summary>
      {section(
        "weekly",
        "每週固定班",
        "可分版本，從某月起生效",
        <>
          <WeeklyTemplateEditor
            key={focus?.target === "weekly" ? focus.nonce : "weekly"}
            config={config}
            month={month}
            onChange={onChange}
            focus={
              focus?.target === "weekly" && focus.date
                ? { month: focus.date.slice(0, 7), weekday: new Date(`${focus.date}T00:00:00Z`).getUTCDay() }
                : undefined
            }
          />
          <p className="assistant-hint help-line">
            週日沒有固定班；週六可設固定班或只靠來診日。
            <HelpTip title="自動規則" guide="doctor-settings">
              <ul>
                {[...SESSION_EXCLUSION_RULES, ...LIMITED_BOOKING_RULES].map((rule) => <li key={rule.label}>{rule.label}</li>)}
              </ul>
              <p>單日調整仍以你勾的為準。</p>
            </HelpTip>
          </p>
        </>,
      )}
      {section(
        "visit",
        "非每週固定班／專科醫師來診日／臨時加開",
        "加在當天固定班上",
        <VisitEditor
          key={focus?.target === "visit" ? focus.nonce : "visit"}
          config={config}
          onChange={onChange}
          start={focus?.target === "visit" ? { date: focus.date } : undefined}
        />,
      )}
      {section(
        "closure",
        "休診日",
        `${config.closures.length} 天`,
        <>
          <p className="assistant-hint help-line">
            休診日當天不看診。
            <HelpTip title="休診日">
              <p>休診日優先於固定班與來診日。另外，週日與沒有任何醫師的日子也視為休診。</p>
            </HelpTip>
          </p>
          <ClosureEditor
            key={focus?.target === "closure" ? focus.nonce : "closure"}
            config={config}
            onChange={onChange}
            presetDate={focus?.target === "closure" ? focus.date : undefined}
          />
        </>,
      )}
      {section(
        "range",
        "行事曆範圍",
        `${fullMonthLabel(config.firstMonth)}～${fullMonthLabel(config.lastMonth)}`,
        <>
          <p className="assistant-hint">範圍外的月份不會自動帶入醫師班，班表上也不限制排班。</p>
          <button className="button button-quiet" onClick={extend}>延長到 {nextYearEnd.slice(0, 4)} 年 12 月</button>
        </>,
      )}
      {section(
        "backup",
        "醫師班表備份與還原",
        "不含在資料工具的 JSON 備份裡",
        <>
          <p className="assistant-hint">醫師班表不含在「資料工具」的 JSON 備份裡，請用這裡另外備份。換電腦時也可以用備份檔搬過去。</p>
          <div className="toolbar-actions">
            <button className="button button-quiet" onClick={downloadBackup}>下載醫師班表備份</button>
            <button className="button button-quiet" onClick={() => fileInput.current?.click()}>匯入備份</button>
            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => importBackup(event.target.files?.[0])} />
            <button
              className="button button-danger"
              onClick={() => {
                if (!window.confirm(`還原成原始 2027 年設定？目前的修改會消失（請先下載備份）。${unsavedNote}還原會直接儲存。`)) return;
                if (resetDoctorSchedule()) onDiscard();
              }}
            >
              還原原始設定
            </button>
          </div>
          {message && <p className="assistant-hint" role="status">{message}</p>}
        </>,
      )}
    </details>
  );
}
