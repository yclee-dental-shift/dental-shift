"use client";

import { useState } from "react";
import { courseProfile, doctorDefaultFloors, pediatricDoctorIds } from "@/config/clinic.config";
import { todayString } from "@/domain/dates";
import { formatHours, summarizeMonth } from "@/domain/rules/labor-hours";
import { isPreLeave } from "@/domain/rules/leave-window";
import { ManagerOnly } from "@/components/ManagerOnly";
import { useSchedule } from "@/components/ScheduleProvider";
import { useShiftRequests } from "@/components/useShiftRequests";
import { clampMonth, FIRST_MONTH, fullMonthLabel, LABOR_SETTINGS, shiftMonth } from "@/components/schedule-settings";

/** 人員名單（只能看）：醫師的樓層與本月診次、助理的本月工時與休假。名單目前寫在 clinic.config.ts。 */
function PeopleContent() {
  const { entries } = useSchedule();
  const { requests } = useShiftRequests();
  const [month, setMonth] = useState(() => clampMonth(todayString().slice(0, 7)));
  const doctors = courseProfile.people.filter((person) => person.role === "doctor");
  const assistants = courseProfile.people.filter((person) => person.role === "assistant");
  const inMonth = (personId: string) => entries.filter((entry) => entry.personId === personId && entry.date.startsWith(month));

  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">{courseProfile.clinicName}</p>
      <h1>人員</h1>
      <p className="page-intro">醫師 {doctors.length} 位、助理 {assistants.length} 位。名單目前寫在程式設定裡，這裡只能看；之後接上共用資料庫才會改成在畫面上管理。</p>

      <div className="assistant-month people-month">
        <button className="button button-quiet" aria-label="上個月" disabled={month <= FIRST_MONTH} onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
        <strong>{fullMonthLabel(month)}</strong>
        <button className="button button-quiet" aria-label="下個月" onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
      </div>

      <section className="info-card">
        <h2>醫師</h2>
        <div className="table-scroll">
          <table className="info-table">
            <thead>
              <tr><th scope="col">姓名</th><th scope="col">預設樓層</th><th scope="col">兒牙</th><th scope="col">本月看診</th></tr>
            </thead>
            <tbody>
              {doctors.map((doctor) => (
                <tr key={doctor.id}>
                  <th scope="row">{doctor.displayName}</th>
                  <td>{doctorDefaultFloors[doctor.id] ?? 2} 樓</td>
                  <td>{pediatricDoctorIds.includes(doctor.id) ? <span className="status-badge tone-ok">兒牙</span> : "—"}</td>
                  <td>{inMonth(doctor.id).filter((entry) => entry.state === "shift").length} 診</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="assistant-hint">週二、週四陳美玲在 1 樓；週四林志明在 2 樓。</p>
        <p className="assistant-hint">兒牙醫師看診時固定在 1 樓，其他醫師移到 2 樓，並多配 1 位預留助理。</p>
      </section>

      <section className="info-card">
        <h2>助理</h2>
        <div className="table-scroll">
          <table className="info-table">
            <thead>
              <tr><th scope="col">姓名</th><th scope="col">本月工時</th><th scope="col">休假</th><th scope="col">排休</th></tr>
            </thead>
            <tbody>
              {assistants.map((assistant) => {
                const summary = summarizeMonth(entries, assistant.id, month, LABOR_SETTINGS, requests);
                const over = summary.normalCapMinutes !== undefined && summary.workedMinutes > summary.normalCapMinutes;
                return (
                  <tr key={assistant.id}>
                    <th scope="row">{assistant.displayName}</th>
                    <td className={over ? "is-over" : undefined}>
                      {formatHours(summary.workedMinutes)}
                      {summary.normalCapMinutes === undefined ? "／未設定" : `／${formatHours(summary.normalCapMinutes)} 小時`}
                    </td>
                    <td>{summary.restDays} 天</td>
                    <td>{inMonth(assistant.id).filter(isPreLeave).length} 天</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function PeoplePage() {
  return (
    <ManagerOnly>
      <PeopleContent />
    </ManagerOnly>
  );
}
