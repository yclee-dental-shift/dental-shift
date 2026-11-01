import { createLocalScheduleRepository } from "./local-schedule-repository";
import type { ScheduleRepository } from "./schedule-repository";

export function createScheduleRepository(): ScheduleRepository {
  return createLocalScheduleRepository();
}
