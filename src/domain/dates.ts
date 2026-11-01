const DAY_MS = 24 * 60 * 60 * 1000;

function asUtcDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function startOfWeek(dateString: string): string {
  const date = asUtcDate(dateString);
  const weekday = date.getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  return toDateString(new Date(date.getTime() - daysFromMonday * DAY_MS));
}

export function addDays(dateString: string, days: number): string {
  return toDateString(new Date(asUtcDate(dateString).getTime() + days * DAY_MS));
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function formatWeekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  return `${monday.replaceAll("-", "/")}－${sunday.replaceAll("-", "/")}`;
}

export function formatDay(dateString: string): string {
  const date = asUtcDate(dateString);
  const labels = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()} 週${labels[date.getUTCDay()]}`;
}

/** 裝置的現在時間，格式 "YYYY-MM-DDTHH:mm"（本地時間）。 */
export function nowString(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
