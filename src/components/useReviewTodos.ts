"use client";

import { reviewTodo } from "@/domain/rules/schedule-review";
import { useMonthAccess } from "./useMonthAccess";
import { useScheduleReviews } from "./useScheduleReviews";
import { useViewer } from "./ViewerProvider";

/** 班表審核裡輪到自己處理的月份（總覽「待處理」與選單旁的數字）。 */
export function useReviewTodos(): Array<{ month: string; text: string; step: "schedule" | "clerkCheck" | "ownerCheck" }> {
  const { viewer } = useViewer();
  const { reviews } = useScheduleReviews();
  const { canManage } = useMonthAccess();
  return Object.values(reviews)
    .sort((a, b) => a.month.localeCompare(b.month))
    .flatMap((review) => {
      const who = viewer === "owner" ? "owner" : viewer === "clerk" ? "clerk" : viewer === "scheduler" && canManage(review.month) ? "lead" : null;
      const text = who ? reviewTodo(review, who) : null;
      if (!text) return [];
      const step = review.status === "returned" ? "schedule" : review.status === "owner" || review.status === "clerkOk" ? "ownerCheck" : "clerkCheck";
      return [{ month: review.month, text, step }];
    });
}
