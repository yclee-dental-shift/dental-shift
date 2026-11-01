import { doctorIdsByName } from "./doctors";

/**
 * 能力表：排班只看每位助理對每個工作的三種狀態。
 * 每月上傳「能力矩陣」Excel（◎熟練／Ø尚未熟練／△需加強／※學習中），照表上「可支援人數評估」換算。
 * Excel 的格式是範例診所的「能力矩陣」，格式不同請改 `ability-import.ts`。
 */

export interface AbilityTask {
  /** 工作代號：`doctor-醫師代號`、`float`（流動）、`counter`（櫃台）。 */
  id: string;
  label: string;
}

export const ABILITY_TASKS: AbilityTask[] = [
  ...Object.entries(doctorIdsByName).map(([name, id]) => ({ id: `doctor-${id}`, label: name })),
  { id: "float", label: "流動" },
  { id: "counter", label: "櫃台" },
];

/** Excel 每一區的標題（醫師名字、流動工作、櫃台）→ 工作代號；表上只寫姓的醫師另外對照。 */
export const ABILITY_SECTION_ALIASES: Record<string, string> = {
  劉醫師: "doctor-0010",
  流動: "float",
  櫃台: "counter",
  櫃檯: "counter",
};

/** 表上有、但排班不用的區塊（不列為「沒對到」）。 */
export const ABILITY_IGNORED_SECTIONS = ["衛教"];

/** 表上註明「先排外」的項目：不算進那位醫師（張醫師自費 RPD；吳醫師牙統、簡單拔牙）。 */
export const ABILITY_EXCLUDED_ITEMS: Array<{ taskId: string; item: string }> = [
  { taskId: "doctor-0008", item: "RPD" },
  { taskId: "doctor-0009", item: "牙周統合" },
  { taskId: "doctor-0009", item: "簡單拔牙" },
];

/** 可獨立：那一區 Ø 最多幾個（照表上「Ø不高於3（包含3）」）。 */
export const ABILITY_MAX_NOT_YET = 3;
