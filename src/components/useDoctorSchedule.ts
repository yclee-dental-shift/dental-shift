"use client";

import { readDefaultDoctorSchedule, readDoctorSchedule, subscribeDoctorSchedule } from "@/data/doctor-schedule-store";
import { useSyncExternalStore } from "react";

/** 目前的醫師班表；改動時重新畫面。 */
export function useDoctorSchedule() {
  return useSyncExternalStore(subscribeDoctorSchedule, readDoctorSchedule, readDefaultDoctorSchedule);
}
