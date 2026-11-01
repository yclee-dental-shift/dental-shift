"use client";

import { readShiftRequests, saveShiftRequests, subscribeShiftRequests } from "@/data/shift-request-store";
import type { ShiftRequests } from "@/domain/rules/shift-request";
import { useSyncExternalStore } from "react";

const EMPTY: ShiftRequests = {};

export function useShiftRequests() {
  const requests = useSyncExternalStore(subscribeShiftRequests, readShiftRequests, () => EMPTY);
  return { requests, saveShiftRequests };
}
