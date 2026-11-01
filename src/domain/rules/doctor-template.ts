import type { ClinicClosure, DoctorSession } from "@/config/doctors";
import type { SpecialistVisit, WeeklyTemplate } from "@/config/doctor-schedule-2027";

const SHIFT_ORDER = ["morning", "afternoon", "evening"] as const;

function daysOf(month: string): string[] {
  const [year, value] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

/**
 * 用「每週固定班表＋行事曆專科醫師＋休診日」產生某月的醫師診次。
 * 休診日與週日不看診；週六只有行事曆上有安排的醫師。
 */
export function buildMonthSessions(
  month: string,
  template: WeeklyTemplate,
  visits: SpecialistVisit[],
  closures: ClinicClosure[],
  doctorIdsByName: Record<string, string>,
): DoctorSession[] {
  const closed = new Set(closures.map((closure) => closure.date));
  return daysOf(month).flatMap((date) => {
    if (closed.has(date)) return [];
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0) return [];
    const monthDay = date.slice(5);
    const todays = visits.filter((visit) => visit.dates.includes(monthDay));
    return SHIFT_ORDER.flatMap((shiftId) => {
      const names = [
        ...(template[weekday]?.[shiftId] ?? []),
        ...todays.flatMap((visit) => visit.sessions[shiftId] ?? []),
      ];
      const seen = new Set<string>();
      const doctors = names.flatMap((raw) => {
        const name = raw.replace(/[()]/g, "");
        const personId = doctorIdsByName[name];
        if (!personId) throw new Error(`未知的醫師：${name}`);
        if (seen.has(personId)) return [];
        seen.add(personId);
        return [{ personId, limitedBooking: raw.startsWith("(") }];
      });
      return doctors.length > 0 ? [{ date, shiftId, doctors }] : [];
    });
  });
}
