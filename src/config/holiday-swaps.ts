import type { HolidaySwap } from "@/domain/rules/holiday-swap";

/**
 * 國定假日照常看診、改到別天休（補假）。月曆上兩天都會標示：
 * 照常看診那天標「端午 照常」，補休那天標「補 6/9 端午」；滑鼠移上去看完整說明。
 * 補休那天要另外在「醫師班表」頁設為休診日。
 */
export const holidaySwaps: HolidaySwap[] = [
  { holiday: "2027-06-09", name: "端午", fullName: "端午節", dayOff: "2027-06-25" },
  { holiday: "2027-09-15", name: "中秋", fullName: "中秋節", dayOff: "2027-09-24" },
  { holiday: "2027-09-28", name: "教師節", fullName: "教師節", dayOff: "2027-09-27" },
  { holiday: "2027-10-11", name: "國慶", fullName: "國慶日補假", dayOff: "2027-10-26" },
];
