export type PersonRole = "doctor" | "assistant";
export type EntryState = "shift" | "leave";

export interface ShiftDefinition {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface CoursePerson {
  id: string;
  displayName: string;
  role: PersonRole;
  availability?: Array<{ weekday: number; shiftId: string }>;
}

export interface CourseProfile {
  clinicName: string;
  shifts: ShiftDefinition[];
  people: CoursePerson[];
}

export interface ScheduleEntry {
  id: string;
  date: string;
  personId: string;
  state: EntryState;
  shiftId?: string;
  note?: string;
  /** 做什麼工作（只有上班有，選填；沒有＝未分配），代號見 `src/domain/rules/shift-task.ts`。 */
  task?: string;
  updatedAt: number;
}

export interface CourseExport {
  kind: "clinic-schedule-workshop";
  version: number;
  exportedAt: string;
  clinicName: string;
  entries: ScheduleEntry[];
}

export type SyncState = "connecting" | "synced" | "saving" | "error";
export type RepositoryMode = "local" | "firestore" | "remote";
