/**
 * 醫師名字與人員 ID 對照，以及醫師看診表共用的型別。
 * 名字加括號＝有看診但不開放一般約診。
 */

export const LIMITED_BOOKING_NOTE = "不開放一般約診";

export const doctorIdsByName: Record<string, string> = {
  林志明: "0001",
  陳美玲: "0002",
  張雅文: "0008",
  黃建宏: "0005",
  吳宗翰: "0009",
  劉怡萱: "0010",
  蔡佩君: "0006",
  楊淑惠: "0007",
  許文豪: "0004",
};

/** 可以設定「有看診但不開放一般約診」的醫師；醫師班表的勾選清單只對這些醫師顯示這個選項。 */
export const LIMITED_BOOKING_DOCTOR_IDS = ["0002"];

/**
 * 自動不排規則：某星期某一診符合條件時，不排這位醫師（單日調整仍優先）。
 * 條件可以是「其他醫師已有 N 位以上」或「當天這一診有某些醫師」；兩個都寫時要同時符合。
 */
export interface SessionExclusionRule {
  weekday: number;
  shiftId: "morning" | "afternoon" | "evening";
  personId: string;
  othersAtLeast?: number;
  whenAnyPresent?: string[];
  /** 顯示在醫師班表與設定頁。 */
  label: string;
}

export const SESSION_EXCLUSION_RULES: SessionExclusionRule[] = [
  {
    weekday: 2,
    shiftId: "evening",
    personId: "0002",
    whenAnyPresent: ["0009"],
    label: "週二晚診：有吳宗翰醫師時，不排陳美玲",
  },
  { weekday: 3, shiftId: "evening", personId: "0002", othersAtLeast: 4, label: "週三晚診：其他醫師已有 4 位以上時，不排（陳美玲）" },
  {
    weekday: 5,
    shiftId: "afternoon",
    personId: "0001",
    whenAnyPresent: ["0006", "0007"],
    label: "週五午診：有兒牙＋口外（蔡醫師、楊醫師）時，不排林志明（只看早診）",
  },
];

/** 醫師班表頁的顯示順序：這些醫師一律排最上面／最下面，其他照原順序（只影響顯示）。 */
export const DISPLAY_FIRST_DOCTOR_IDS = ["0001"];
export const DISPLAY_LAST_DOCTOR_IDS = ["0002"];

/** 不開放一般約診規則：某星期當天有某些醫師時，改這位醫師各診是否開放一般約診（單日調整仍優先）。 */
export interface LimitedBookingRule {
  weekday: number;
  personId: string;
  whenDayHasAny: string[];
  /** true＝不開放一般約診（括號），false＝開放。沒寫的診不變。 */
  limitedByShift: Partial<Record<"morning" | "afternoon" | "evening", boolean>>;
  label: string;
}

export const LIMITED_BOOKING_RULES: LimitedBookingRule[] = [
  {
    weekday: 5,
    personId: "0002",
    whenDayHasAny: ["0006", "0007"],
    limitedByShift: { morning: false, afternoon: true, evening: true },
    label: "週五有兒牙＋口外（蔡醫師、楊醫師）時：陳美玲早診開放一般約診，午診、晚診不開放",
  },
];

export interface DoctorSession {
  date: string;
  shiftId: "morning" | "afternoon" | "evening";
  /** 配置表上的助理需求人數；沒有時依規則計算。 */
  assistantsNeeded?: number;
  /** floor：單日指定樓層（沒有＝依樓層規則）。 */
  doctors: Array<{ personId: string; limitedBooking: boolean; floor?: 1 | 2 }>;
}

export interface ClinicClosure {
  date: string;
  label: string;
}
