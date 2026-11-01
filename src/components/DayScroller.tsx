"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { scrollBehavior } from "./reduce-motion";

/** 一次看幾天。 */
const VISIBLE_DAYS = 7;
/** 看得到的前後再多算幾天的圓點（捲動時先算好，邊緣不會空白）。 */
const NEAR_DAYS = 7;

/**
 * 連續捲動的日期帶（使用者 2026-10-26 要求）：一次看 7 天，手指往左拖，後面的日期跟著手指一天一天露出來，
 * 放手照速度慣性滑一段，停下時對齊整天（瀏覽器原生捲動＋scroll-snap）。捲動只是看，點日期才選。
 * 左右箭頭一次捲 7 天；選到的日期不在畫面上時自動捲過去（對齊那一週的星期一）。
 * dates 要從星期一開始、連續的日期；renderDay 的 near＝在畫面上或旁邊（才需要算圓點）。
 */
export function DayScroller({
  dates,
  selected,
  className,
  daysClassName,
  navClassName,
  label,
  renderDay,
}: {
  dates: string[];
  selected: string;
  className: string;
  daysClassName: string;
  navClassName: string;
  label: string;
  renderDay(date: string, near: boolean): ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [first, setFirst] = useState(() => Math.max(0, dates.indexOf(selected)));
  const placed = useRef(false);
  const columnWidth = () => {
    const scroller = scrollerRef.current;
    const cell = scroller?.firstElementChild as HTMLElement | null;
    if (!scroller || !cell) return 0;
    const second = cell.nextElementSibling as HTMLElement | null;
    return second ? second.offsetLeft - cell.offsetLeft : cell.offsetWidth;
  };

  // 選到的日期不在畫面上就捲過去（第一次直接到位，之後滑過去）。
  const selectedIndex = dates.indexOf(selected);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const width = columnWidth();
    if (!scroller || !width || selectedIndex < 0) return;
    const shown = Math.round(scroller.scrollLeft / width);
    if (placed.current && selectedIndex >= shown && selectedIndex < shown + VISIBLE_DAYS) return;
    const target = Math.max(0, selectedIndex - (selectedIndex % VISIBLE_DAYS)) * width;
    scroller.scrollTo({ left: target, behavior: placed.current ? "smooth" : "auto" });
    placed.current = true;
  }, [selectedIndex]);

  // 記下目前看到第幾天（決定箭頭能不能按、哪幾天要算圓點）。
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const width = columnWidth();
      if (width) setFirst(Math.round(scroller.scrollLeft / width));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const page = (offset: number) => {
    const scroller = scrollerRef.current;
    const width = columnWidth();
    if (!scroller || !width) return;
    const next = Math.min(Math.max(0, first + offset * VISIBLE_DAYS), Math.max(0, dates.length - VISIBLE_DAYS));
    scroller.scrollTo({ left: next * width, behavior: scrollBehavior() });
  };

  return (
    <div className={className}>
      <button className={navClassName} aria-label="往前 7 天" disabled={first <= 0} onClick={() => page(-1)}>‹</button>
      <div ref={scrollerRef} className={`${daysClassName} day-scroller`} role="tablist" aria-label={label}>
        {dates.map((date, index) => renderDay(date, index >= first - NEAR_DAYS && index < first + VISIBLE_DAYS + NEAR_DAYS))}
      </div>
      <button className={navClassName} aria-label="往後 7 天" disabled={first >= dates.length - VISIBLE_DAYS} onClick={() => page(1)}>›</button>
    </div>
  );
}

/** 日期帶的日期：從 from 那一週的星期一，到 to 那個月往後 monthsAfter 個月的月底那一週的星期日。 */
export function scrollerDates(from: string, to: string, monthsAfter = 0): string[] {
  const [year, month] = to.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month + monthsAfter, 0)).toISOString().slice(0, 10);
  const start = new Date(`${from}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(`${lastDay}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + ((7 - end.getUTCDay()) % 7));
  const dates: string[] = [];
  for (const day = start; day <= end; day.setUTCDate(day.getUTCDate() + 1)) dates.push(day.toISOString().slice(0, 10));
  return dates;
}
