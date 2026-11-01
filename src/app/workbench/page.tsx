import { Suspense } from "react";
import { ScheduleBoard } from "@/components/ScheduleBoard";

/** 排班工作台：每月 7 步排班流程與修改班表。網址可帶 `?month=2027-03&step=review`。 */
export default function WorkbenchPage() {
  return (
    <Suspense>
      <ScheduleBoard mode="workbench" />
    </Suspense>
  );
}
