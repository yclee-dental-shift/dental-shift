"use client";

import { useSyncExternalStore } from "react";
import { readScheduleReviews, saveScheduleReview, subscribeScheduleReviews } from "@/data/schedule-review-store";
import type { ScheduleReview } from "@/domain/rules/schedule-review";

const EMPTY: Record<string, ScheduleReview> = {};

/** 每月班表審核（行政檢查、最高管理者確認班表）。 */
export function useScheduleReviews() {
  const reviews = useSyncExternalStore(subscribeScheduleReviews, readScheduleReviews, () => EMPTY);
  const saveReview = (review: ScheduleReview) => {
    if (!saveScheduleReview(review)) window.alert("無法儲存（瀏覽器不允許寫入）。");
  };
  return { reviews, saveReview };
}
