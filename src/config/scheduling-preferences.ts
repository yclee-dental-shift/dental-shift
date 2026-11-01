import { courseProfile } from "./clinic.config";

/**
 * 一鍵排班的偏好：先照偏好排，排不滿才放寬，放寬時挑次數最少的人。
 * 之後人力狀況清楚了，可以調整這些數字。
 */
export const schedulingPreferences = {
  /** 盡量不排一天三診。 */
  avoidTripleShift: true,
  /** 盡量不排連續兩天三診。 */
  avoidConsecutiveTripleDays: true,
  /** 晚診最多連續幾天。 */
  maxConsecutiveEvenings: 2,
  /** 哪一個班別算「晚診」。 */
  eveningShiftId: "evening",
  /**
   * 兩頭班（早＋晚、中間空午）：可以排，但先排連續的班；要排時挑這個月兩頭班最少、
   * 前後一天沒有兩頭班、不在同一個星期幾的人。每人每週（週一起算）最多幾天，超過算放寬偏好。
   * 順序在三診前面（兩頭班一天兩診，比三診輕）。
   */
  maxSplitDaysPerWeek: 1,
  /** 班別順序（早、午、晚），用來判斷兩頭班。 */
  shiftOrder: courseProfile.shifts.map((shift) => shift.id),
};
