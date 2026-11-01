/**
 * 人員名單：姓名與職稱（範例資料，請換成自己診所的人）。
 * 職稱決定身分：管理階層＝最高管理者、助理長、組長＝排班負責人候選、行政專員＝只能看＋行政檢查、助理。
 * personId 對應 clinic.config.ts 的人員；沒有 personId 的人不在班表上。
 * 這個版本沒有登入，名單只用在「每月排班負責人」與手機預覽的身分選單。
 */
export type StaffTitle = "管理階層" | "助理長" | "組長" | "助理" | "行政專員";

export interface StaffMember {
  name: string;
  title: StaffTitle;
  personId?: string;
}

export const staffDirectory: StaffMember[] = [
  { name: "陳美玲", title: "管理階層", personId: "0002" },
  { name: "周文傑", title: "管理階層" },
  { name: "王小華", title: "助理長", personId: "1001" },
  { name: "李佳穎", title: "組長", personId: "1004" },
  { name: "陳怡君", title: "組長", personId: "1013" },
  { name: "林雅琪", title: "助理", personId: "1020" },
  { name: "張書瑜", title: "助理", personId: "1019" },
  { name: "黃心怡", title: "助理", personId: "1026" },
  { name: "吳佩珊", title: "助理", personId: "1027" },
  { name: "劉家瑜", title: "助理", personId: "1025" },
  { name: "蔡宜庭", title: "助理", personId: "1028" },
  { name: "楊晴", title: "助理", personId: "1029" },
  { name: "許詩涵", title: "助理", personId: "1030" },
  { name: "鄭宇翔", title: "助理", personId: "2006" },
  { name: "謝雨萱", title: "助理", personId: "2007" },
  { name: "孫雅惠", title: "行政專員" },
  { name: "郭品妍", title: "助理", personId: "1031" },
];
