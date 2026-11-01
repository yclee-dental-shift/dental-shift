import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DoctorScheduleSync } from "@/components/DoctorScheduleSync";
import { ScheduleProvider } from "@/components/ScheduleProvider";
import { STALE_RELOAD_SCRIPT } from "@/components/stale-reload";
import { THEME_BOOT_SCRIPT } from "@/components/ThemeToggle";
import { ViewerProvider } from "@/components/ViewerProvider";
import { DEMO_SEED_SCRIPT, IS_DEMO } from "@/demo/demo-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: "診所班表",
  description: "範例牙醫診所醫師與助理班表",
  // 加入主畫面時預設的名稱（完整標題太長會被截掉）。網頁圖示 app/icon.svg、加入主畫面圖示 app/apple-icon.png，換成自己診所的標誌即可。
  other: { "apple-mobile-web-app-title": "診所班表" },
  // 展示版不讓搜尋引擎收錄，只有拿到網址的人會來。
  ...(IS_DEMO ? { robots: { index: false, follow: false } } : {}),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme 由開頁的小段程式先設好（白天／夜間，見 ThemeToggle.tsx），所以 html 不比對。
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* 網站更新後舊分頁讀不到舊檔：自動重新整理一次（stale-reload.ts）。 */}
        <script dangerouslySetInnerHTML={{ __html: STALE_RELOAD_SCRIPT }} />
        {/* 展示版：第一次打開先放入範例資料（demo-mode.ts）。 */}
        {IS_DEMO && <script dangerouslySetInnerHTML={{ __html: DEMO_SEED_SCRIPT }} />}
      </head>
      <body>
        <ScheduleProvider>
          <ViewerProvider>
            <DoctorScheduleSync />
            <AppShell buildLabel={process.env.NEXT_PUBLIC_BUILD_LABEL ?? "local"}>{children}</AppShell>
          </ViewerProvider>
        </ScheduleProvider>
      </body>
    </html>
  );
}
