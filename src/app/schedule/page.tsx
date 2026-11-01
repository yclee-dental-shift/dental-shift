import { Suspense } from "react";
import { ScheduleBoard } from "@/components/ScheduleBoard";

/** 班表（只看）：月／週切換、存成圖片、排班統計；要修改到排班工作台。 */
export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleBoard mode="view" />
    </Suspense>
  );
}
