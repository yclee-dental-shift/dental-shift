import type { CourseProfile, CoursePerson } from "@/domain/types";

/**
 * 診所設定：診別時段、人員與診療椅。
 * 醫師與助理都是範例名單，請換成自己診所的人（醫師規則見 doctors.ts；姓名與職稱見 staff-directory.ts）。
 * 不得放入病人資料與請假原因。
 */
function doctor(id: string, displayName: string): CoursePerson {
  return { id, displayName, role: "doctor" };
}

function assistant(id: string, displayName: string): CoursePerson {
  return { id, displayName, role: "assistant" };
}

export const courseProfile: CourseProfile = {
  clinicName: "範例牙醫診所",
  shifts: [
    // 助理實際上班時間（看診時間略短，不另外記錄）。
    { id: "morning", label: "早診", start: "08:25", end: "12:05" },
    { id: "afternoon", label: "午診", start: "13:35", end: "16:45" },
    { id: "evening", label: "晚診", start: "17:35", end: "20:45" },
  ],
  people: [
    doctor("0001", "林志明醫師"),
    doctor("0002", "陳美玲醫師"),
    doctor("0008", "張雅文醫師"),
    doctor("0005", "黃建宏醫師"),
    doctor("0009", "吳宗翰醫師"),
    doctor("0010", "劉怡萱醫師"),
    doctor("0006", "蔡佩君醫師"),
    doctor("0007", "楊淑惠醫師"),
    doctor("0004", "許文豪醫師"),
    assistant("1001", "王小華"),
    assistant("1004", "李佳穎"),
    assistant("1013", "陳怡君"),
    assistant("1020", "林雅琪"),
    assistant("1019", "張書瑜"),
    assistant("1026", "黃心怡"),
    assistant("1027", "吳佩珊"),
    assistant("1025", "劉家瑜"),
    assistant("1028", "蔡宜庭"),
    assistant("1029", "楊晴"),
    assistant("1030", "許詩涵"),
    assistant("1031", "郭品妍"),
    // 以下為兼職；之後改依員工編號排序。
    assistant("2006", "鄭宇翔"),
    assistant("2007", "謝雨萱"),
  ],
};

/**
 * 工作分配表上的簡稱：助理一個字。
 * 新進人員要在這裡補上；沒有的用名字最後一個字。
 */
export const ASSISTANT_SHORT_NAMES: Record<string, string> = {
  "1001": "華", "1004": "穎", "1013": "君", "1020": "琪", "1019": "瑜", "1026": "怡", "1027": "珊",
  "1025": "家", "1028": "庭", "1029": "晴", "1030": "涵", "2006": "翔", "2007": "萱", "1031": "妍",
};
/**
 * 醫師一個字（月班表方塊下），通常用姓；同姓的醫師改用名字最後一個字。順序＝工作分配表醫師列的順序。
 * 有空間寫全名、兩個字寫名字（`taskShort`）。
 */
export const DOCTOR_CHARS: Record<string, string> = {
  "0001": "林", "0002": "陳", "0008": "張", "0004": "許", "0009": "吳", "0010": "劉", "0006": "蔡", "0007": "楊", "0005": "黃",
};

/** 診療椅位置。名稱用「X診」，和早診／午診／晚診等時段不同。 */
export interface ChairDefinition {
  id: string;
  label: string;
  floor: number;
  building: "前棟" | "後棟";
}

function chair(number: number, floor: number, building: ChairDefinition["building"]): ChairDefinition {
  return { id: `chair-${number}`, label: `${number}診`, floor, building };
}

// 1–3 診在 1 樓前棟；4–7 診在 2 樓前棟；8–9 診在 2 樓後棟。目前只記錄，畫面尚未使用。
export const chairs: ChairDefinition[] = [
  chair(1, 1, "前棟"),
  chair(2, 1, "前棟"),
  chair(3, 1, "前棟"),
  chair(4, 2, "前棟"),
  chair(5, 2, "前棟"),
  chair(6, 2, "前棟"),
  chair(7, 2, "前棟"),
  chair(8, 2, "後棟"),
  chair(9, 2, "後棟"),
];

/** 兒牙醫師：看診時固定在 1 樓，其他醫師移到 2 樓，並多配 1 位預留助理。 */
export const pediatricDoctorIds = ["0009", "0006"];

/** 沒有兒牙醫師時的預設樓層；未列出的醫師視為 2 樓。 */
export const doctorDefaultFloors: Record<string, 1 | 2> = {
  "0001": 1,
  "0004": 1,
  "0005": 2,
  "0002": 2,
  "0008": 2,
  "0010": 2,
  "0007": 2,
};

/** 依星期幾的樓層例外（0＝週日），優先於預設樓層；兒牙醫師在場時仍照兒牙規則。 */
export const doctorWeekdayFloors: Partial<Record<number, Record<string, 1 | 2>>> = {
  2: { "0002": 1 },
  4: { "0002": 1, "0001": 2 },
};
