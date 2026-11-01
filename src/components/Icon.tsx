import type { ReactNode } from "react";

// 線條圖示（內嵌 SVG，不另外載入圖示套件）；顏色跟著文字顏色。
const PATHS = {
  // 總覽：大小方塊組合
  dashboard: <><rect x="3.5" y="3.5" width="7.5" height="10" rx="2" /><rect x="3.5" y="16.5" width="7.5" height="4" rx="1.5" /><rect x="13" y="3.5" width="7.5" height="4" rx="1.5" /><rect x="13" y="10.5" width="7.5" height="10" rx="2" /></>,
  // 排班工作台：錯開的橫條（像排班的時段）
  planner: <><rect x="3" y="4" width="11" height="4" rx="2" /><rect x="9" y="10" width="12" height="4" rx="2" /><rect x="4.5" y="16" width="10" height="4" rx="2" /></>,
  calendar: <><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M8 2.5v4M16 2.5v4M3.5 9.5h17" /><path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" /></>,
  // 排休申請：月曆＋加號
  dayOff: <><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M8 2.5v4M16 2.5v4M3.5 9.5h17" /><path d="M12 12.5v5M9.5 15h5" /></>,
  // 排班結果：寫字板＋長條
  result: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.8h6V4" /><path d="M9 17v-3M12 17v-6M15 17v-4.5" /></>,
  // 手機預覽：手機外框
  phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>,
  // 能力表：獎章（圓＋緞帶）
  ability: <><circle cx="12" cy="9" r="5.5" /><path d="m9 13.8-1.5 7.2 4.5-2.5 4.5 2.5-1.5-7.2" /><path d="m10 9 1.5 1.5L14.5 7.5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.5a6.5 6.5 0 0 1 3 5.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  data: <><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.66 3.58 3 8 3s8-1.34 8-3v-13" /><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" /></>,
  apps: <><circle cx="5" cy="5" r="1.6" /><circle cx="12" cy="5" r="1.6" /><circle cx="19" cy="5" r="1.6" /><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /><circle cx="5" cy="19" r="1.6" /><circle cx="12" cy="19" r="1.6" /><circle cx="19" cy="19" r="1.6" /></>,
  // 使用說明：圓圈裡一個問號
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" /><path d="M12 17h.01" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.4 3.6a2 2 0 0 1 2.8 2.8L7 18.6 3 20l1.4-4z" /></>,
  // 側邊欄收合／展開
  panelClose: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /><path d="M15 10l-2 2 2 2" /></>,
  panelOpen: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /><path d="M13 10l2 2-2 2" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
