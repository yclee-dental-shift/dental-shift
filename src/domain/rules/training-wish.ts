import type { ScheduleEntry } from "../types";
import { shiftRequestOf, type ShiftRequests } from "./shift-request";
import { countsForTarget, type TrainingTarget } from "./training";

/**
 * 培訓目標 × 希望不排（使用者 2026-10-31）：助理自己登記希望不排，剛好是他要學的醫師的診，學習就排不夠。
 * 一鍵排班照舊不蓋過希望不排；這裡只算「因為希望不排少了幾診」，讓排班的人、診所負責人看得到原因，
 * 助理登記希望不排時也提醒他。只算跟某位醫師的目標（櫃台、流動每一診都有，不算）。
 */
/** 助理自己看得到這些提醒嗎（使用者 2026-10-31：先不給助理看，未來或許開放）：登記希望不排時的提醒、我的培訓清單那一行。 */
export const SHOW_WISH_IMPACT_TO_ASSISTANTS = false;

export interface TargetWishImpact {
  /** 那位醫師這個月看診幾診。 */
  sessions: number;
  /** 其中排他跟（含學習）幾診。 */
  done: number;
  /** 其中他希望不排、也沒排他跟的診數。 */
  wished: number;
  /** 其中他請假或排休的診數（用假，正當原因）。 */
  leave: number;
  /** 比最少診數少幾診（「為主」的目標＝0）。 */
  short: number;
  /** 少的診數裡，算在希望不排頭上的（不超過希望不排的診數）。 */
  lostToWish: number;
}

export function targetWishImpact(
  target: TrainingTarget,
  entries: ScheduleEntry[],
  requests: ShiftRequests,
  month: string,
  doctorsAt: (date: string, shiftId: string) => string[],
  shiftIds: string[],
): TargetWishImpact | null {
  if (!target.task.startsWith("doctor-")) return null;
  const doctorId = target.task.slice("doctor-".length);
  const dates = [...new Set(entries.filter((entry) => entry.date.startsWith(`${month}-`)).map((entry) => entry.date))].sort();
  const result: TargetWishImpact = { sessions: 0, done: 0, wished: 0, leave: 0, short: 0, lostToWish: 0 };
  for (const date of dates) {
    const own = entries.filter((entry) => entry.personId === target.personId && entry.date === date);
    const dayLeave = own.some((entry) => entry.state === "leave");
    for (const shiftId of shiftIds) {
      if (!doctorsAt(date, shiftId).includes(doctorId)) continue;
      result.sessions += 1;
      const shift = own.find((entry) => entry.state === "shift" && entry.shiftId === shiftId);
      if (shift && countsForTarget(target.task, shift.task)) {
        result.done += 1;
        continue;
      }
      const request = shiftRequestOf(requests, date, target.personId, shiftId);
      if (dayLeave || request?.leaveType) result.leave += 1;
      else if (request && !shift) result.wished += 1;
    }
  }
  result.short = target.main ? 0 : Math.max(0, target.minSessions - result.done);
  result.lostToWish = Math.min(result.short, result.wished);
  return result;
}

/** 某人某天某一診是不是他這個月培訓目標要跟的醫師的診（回傳那些醫師代號）。 */
export function targetDoctorsAt(
  targets: TrainingTarget[],
  personId: string,
  doctorsHere: string[],
): string[] {
  return targets
    .filter((target) => target.personId === personId && target.task.startsWith("doctor-"))
    .map((target) => target.task.slice("doctor-".length))
    .filter((doctorId) => doctorsHere.includes(doctorId));
}
