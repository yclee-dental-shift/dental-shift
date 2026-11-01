/**
 * 2027 年醫師班表（範例）：每週固定班表＋診所行事曆上的專科醫師日期與休診日。請換成自己診所的。
 * 名字加括號＝有看診但不開放一般約診。
 */
import type { DoctorScheduleConfig, DoctorSlot, SessionSlots, ShiftKey } from "@/domain/rules/doctor-schedule";
import { doctorIdsByName, type ClinicClosure } from "./doctors";

export type WeeklyTemplate = Record<number, Partial<Record<"morning" | "afternoon" | "evening", string[]>>>;

/** 每週固定（1＝週一 … 5＝週五）；週六、週日不在固定班表內。 */
export const weeklyTemplate2027: WeeklyTemplate = {
  1: { morning: ["林志明"], afternoon: ["林志明"], evening: ["林志明"] },
  2: { morning: ["林志明"], afternoon: ["林志明", "黃建宏"], evening: ["陳美玲", "黃建宏"] },
  3: {
    morning: ["林志明", "(陳美玲)", "劉怡萱"],
    afternoon: ["張雅文", "劉怡萱", "陳美玲", "吳宗翰"],
    evening: ["林志明", "劉怡萱", "(陳美玲)", "吳宗翰"],
  },
  4: { morning: ["林志明", "陳美玲"], afternoon: ["陳美玲"], evening: ["陳美玲", "林志明"] },
  5: {
    morning: ["林志明", "(陳美玲)", "張雅文"],
    afternoon: ["林志明", "(陳美玲)", "張雅文"],
    evening: ["陳美玲"],
  },
};

export interface SpecialistVisit {
  label: string;
  /** "MM-DD" 清單。 */
  dates: string[];
  sessions: Partial<Record<"morning" | "afternoon" | "evening", string[]>>;
}

function dates(byMonth: Record<number, number[]>): string[] {
  return Object.entries(byMonth).flatMap(([month, days]) =>
    days.map((day) => `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`),
  );
}

const pediatricDates = dates({
  1: [8, 18, 22], 2: [12, 15, 26], 3: [12, 15, 26], 4: [9, 19, 23], 5: [7, 17, 21], 6: [4, 18, 21],
  7: [2, 16, 19, 30], 8: [13, 16, 27], 9: [10, 20], 10: [1, 15, 18, 29], 11: [12, 15, 26], 12: [10, 20],
});
const isMonday = (monthDay: string) => new Date(`2027-${monthDay}T00:00:00Z`).getUTCDay() === 1;

/** 行事曆上的專科醫師日期（會加在當天固定班表上）。 */
export const specialistVisits2027: SpecialistVisit[] = [
  {
    label: "矯正 黃醫師",
    dates: dates({
      1: [6, 15, 20, 29], 2: [19, 24], 3: [5, 10, 19, 24], 4: [2, 16, 21], 5: [5, 14, 19, 28], 6: [11, 16, 30],
      7: [9, 14, 23, 28], 8: [6, 11, 20, 25], 9: [3, 8, 17, 29], 10: [8, 13, 22, 27], 11: [5, 10, 19, 24], 12: [3, 8, 17, 22],
    }),
    sessions: { evening: ["黃建宏"] },
  },
  {
    label: "兒牙＋口外 蔡醫師、楊醫師（週五）",
    dates: pediatricDates.filter((date) => !isMonday(date)),
    sessions: { afternoon: ["蔡佩君", "楊淑惠"], evening: ["蔡佩君", "楊淑惠"] },
  },
  {
    label: "兒牙 蔡醫師（每月一次週一）",
    dates: pediatricDates.filter(isMonday),
    sessions: { afternoon: ["蔡佩君"], evening: ["蔡佩君"] },
  },
  {
    label: "兒牙 吳醫師",
    dates: dates({
      1: [12, 26], 2: [23], 3: [9, 23], 4: [20], 5: [4, 18], 6: [1, 15, 29],
      7: [13, 27], 8: [10, 24], 9: [7, 21], 10: [5, 19], 11: [2, 16, 30], 12: [14, 28],
    }),
    sessions: { afternoon: ["吳宗翰"], evening: ["吳宗翰"] },
  },
  {
    label: "矯正 許醫師（週六）",
    dates: dates({ 1: [23], 2: [20], 3: [20], 4: [17], 5: [15], 6: [12], 7: [10], 8: [21], 9: [18], 10: [16], 11: [13], 12: [11] }),
    sessions: { morning: ["許文豪", "林志明", "(陳美玲)"], afternoon: ["許文豪"] },
  },
];

/** 休診日：國定假日（灰底）與診所補國定假日休診。6/9、9/15、9/28、10/11 照常看診。 */
export const closures2027: ClinicClosure[] = [
  { date: "2027-01-01", label: "元旦" },
  { date: "2027-02-04", label: "春節" },
  { date: "2027-02-05", label: "春節" },
  { date: "2027-02-08", label: "春節" },
  { date: "2027-02-09", label: "春節" },
  { date: "2027-02-10", label: "春節" },
  { date: "2027-03-01", label: "補 228" },
  { date: "2027-04-05", label: "清明節" },
  { date: "2027-04-06", label: "補兒童節" },
  { date: "2027-04-30", label: "補勞動節" },
  { date: "2027-06-25", label: "診所補假休診" },
  { date: "2027-09-24", label: "診所補假休診" },
  { date: "2027-09-27", label: "診所補假休診" },
  { date: "2027-10-25", label: "光復節" },
  { date: "2027-10-26", label: "診所補假休診" },
  { date: "2027-12-31", label: "補元旦" },
];

/** 把上面的 2027 設定轉成「醫師班表」頁使用的格式；醫師班表頁的預設內容（也是「還原原始設定」的內容）。 */
export function defaultDoctorSchedule(): DoctorScheduleConfig {
  const slotsOf = (names: string[] = []): DoctorSlot[] =>
    names.map((raw) => {
      const name = raw.replace(/[()]/g, "");
      const personId = doctorIdsByName[name];
      if (!personId) throw new Error(`未知的醫師：${name}`);
      return { personId, limited: raw.startsWith("(") };
    });
  const sessionsOf = (sessions: Partial<Record<ShiftKey, string[]>>): SessionSlots =>
    Object.fromEntries(Object.entries(sessions).map(([shiftId, names]) => [shiftId, slotsOf(names)]));
  return {
    version: 1,
    firstMonth: "2027-01",
    lastMonth: "2027-12",
    weekly: [
      {
        from: "2027-01",
        slots: Object.fromEntries(Object.entries(weeklyTemplate2027).map(([weekday, sessions]) => [weekday, sessionsOf(sessions)])),
      },
    ],
    visits: specialistVisits2027.map((visit, index) => ({
      id: `visit-2027-${index + 1}`,
      label: visit.label,
      dates: visit.dates.map((monthDay) => `2027-${monthDay}`),
      sessions: sessionsOf(visit.sessions),
    })),
    closures: closures2027.map((closure) => ({ ...closure })),
  };
}
