/** 國定假日照常看診、改到 dayOff 那天休。 */
export interface HolidaySwap {
  /** 國定假日（照常看診）。 */
  holiday: string;
  /** 月曆上的短名稱，例如「端午」。 */
  name: string;
  /** 說明用的完整名稱，例如「端午節」。 */
  fullName: string;
  /** 改休的日子。 */
  dayOff: string;
}

export interface HolidayNote {
  kind: "worked" | "dayOff";
  /** 月曆格子上的短標示。 */
  short: string;
  /** 滑鼠移上去的完整說明。 */
  detail: string;
}

const monthDay = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** 某天是不是「國定假日照常看診」或「補休」；都不是回傳 undefined。 */
export function holidayNoteOf(date: string, swaps: HolidaySwap[]): HolidayNote | undefined {
  const worked = swaps.find((swap) => swap.holiday === date);
  if (worked) {
    return { kind: "worked", short: `${worked.name} 照常`, detail: `${worked.fullName}照常看診，改 ${monthDay(worked.dayOff)} 休` };
  }
  const dayOff = swaps.find((swap) => swap.dayOff === date);
  if (dayOff) {
    return { kind: "dayOff", short: `補 ${monthDay(dayOff.holiday)} ${dayOff.name}`, detail: `${monthDay(dayOff.holiday)} ${dayOff.fullName}照常看診，改這天休` };
  }
  return undefined;
}
