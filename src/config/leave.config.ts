/** 排休假別。理由（大項目＋文字）另存於 leave-reason-store，見 leave-reason.config.ts。 */
export const leaveTypes = ["特休", "安胎", "產假", "產檢", "病假", "事假", "婚假", "喪假"] as const;
export type LeaveType = (typeof leaveTypes)[number];

/**
 * 每月排班日程通則（日曆天，不扣假日），每個月可在「排班日程」個別調整：
 * 長假（同月排休 2 天以上）與人數發布：前 4 個月的 1 日；開始準備：再前 15 天。
 * 正式公告：前 2 個月的 1 日；預公告：正式公告前 2 天（助理確認到隔天下班）；
 * 排班：預公告前 7 天；一般排休：排班前 7 天，共 7 天。
 * 截止只鎖定「排休申請」；班表要等管理者「正式公告」才鎖定。
 */
export const leaveWindow = {
  longLeaveOpenMonthsBefore: 4,
  publishMonthsBefore: 2,
  confirmDays: 2,
  schedulingDays: 7,
  generalLeaveDays: 7,
  prepareDaysBefore: 15,
  longLeaveMinDays: 2,
};
