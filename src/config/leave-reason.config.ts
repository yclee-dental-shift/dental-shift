/**
 * 排休與「指定診次不排」的理由：先選大項目，再填文字理由。
 * 常用理由依過去 Google 試算表「排休事由」最常出現的寫法整理，點一下即可帶入文字。
 * 「健康就醫」屬健康相關資訊：改存雲端之前，要先做好登入與權限（見 CLAUDE.md）。
 */
export const reasonCategories = [
  { id: "家庭照顧", quick: ["顧小孩", "小孩6點下課", "保母休假", "帶小孩"] },
  { id: "旅遊返鄉", quick: ["出國", "旅遊", "回老家"] },
  { id: "聚會活動", quick: ["聚餐", "生日", "家族聚會"] },
  { id: "個人事務", quick: ["私事", "辦事情", "家裡有事"] },
  { id: "進修考試", quick: ["進修", "考試"] },
  { id: "健康就醫", quick: ["看診", "回診", "陪家人就醫"] },
  { id: "其他", quick: [] },
] as const;

export type ReasonCategory = (typeof reasonCategories)[number]["id"];

/** 文字理由最多幾個字。 */
export const REASON_MAX_LENGTH = 50;
