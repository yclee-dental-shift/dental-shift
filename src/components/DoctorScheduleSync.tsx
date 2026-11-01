"use client";

import { useEffect, useRef, useState } from "react";
import { courseProfile } from "@/config/clinic.config";
import { planDoctorSync } from "@/domain/rules/doctor-schedule-import";
import { useSchedule } from "./ScheduleProvider";
import { useDoctorSchedule } from "./useDoctorSchedule";
import { useViewer } from "./ViewerProvider";
import { useMonthAccess } from "./useMonthAccess";
import { usePublications } from "./usePublications";
import { doctorSessionsFor, shiftMonth } from "./schedule-settings";

type SyncPlan = ReturnType<typeof planDoctorSync>;
const EMPTY_PLAN: SyncPlan = { auto: { remove: [], add: [] }, blocked: [] };
const SETTLE_MS = 400;
const DOCTOR_IDS = new Set(courseProfile.people.filter((person) => person.role === "doctor").map((person) => person.id));

/**
 * 班表上的醫師班一律依「醫師班表」：行事曆範圍內、尚未正式公告的月份逐月比對。
 * 不會動到助理班的變更自動套用；會移除助理班的月份列在 blocked，等管理者按下「套用」。
 */
export function useDoctorSync() {
  const { entries, syncState, replaceEntries } = useSchedule();
  const config = useDoctorSchedule();
  const { publications } = usePublications();
  // 只同步自己能改的月份（不是排班負責人的月份，伺服器不收）。
  const { canManage } = useMonthAccess();
  // 資料連續變動時（例如一鍵排班一筆一筆存）先等它停下來再比對一次，避免每存一筆就重算。
  // 記下是用哪一份班表算的：班表又變了（例如背景存好、伺服器補抓）就先不套用，等重算，免得用舊的結果重複寫入。
  const [planned, setPlanned] = useState<{ plan: SyncPlan; entries: unknown }>({ plan: EMPTY_PLAN, entries: null });
  const plan = planned.plan;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const months: string[] = [];
      for (let month = config.firstMonth; month <= config.lastMonth; month = shiftMonth(month, 1)) {
        if (publications[month]?.status !== "published" && canManage(month)) months.push(month);
      }
      setPlanned({ plan: planDoctorSync(entries, months, doctorSessionsFor, DOCTOR_IDS), entries });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [entries, config, publications, canManage]);
  const apply = (month: string) => {
    const item = plan.blocked.find((blocked) => blocked.month === month);
    return item ? replaceEntries(item.remove, item.add) : Promise.resolve();
  };
  return { ready: syncState === "synced" && planned.entries === entries, plan, apply, replaceEntries };
}

/** 放在每一頁的外框裡：資料載入完成後，自動套用不影響助理班的醫師班變更。 */
export function DoctorScheduleSync() {
  const { ready, plan, replaceEntries } = useDoctorSync();
  const { member, readOnly } = useViewer();
  // 有登入時：只有最高管理者與排班負責人的畫面自動套用（月份已在 useDoctorSync 篩過）；助理、行政專員不能改醫師班。
  const allowed = !readOnly && (member === null || member.role === "owner" || member.role === "lead" || member.role === "leader");
  const running = useRef(false);
  useEffect(() => {
    if (!allowed || !ready || running.current) return;
    if (plan.auto.remove.length === 0 && plan.auto.add.length === 0) return;
    running.current = true;
    replaceEntries(plan.auto.remove, plan.auto.add).finally(() => {
      running.current = false;
    });
  }, [allowed, ready, plan, replaceEntries]);
  return null;
}
