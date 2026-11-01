"use client";

import type { CSSProperties } from "react";

/**
 * 分段切換桿：灰色長框、每格一樣寬，選中那格的白色滑塊滑過去（使用者 2026-10-25 決定，名稱一律兩個字）。
 * 手機班表「單日／月曆／總表」、第 1、2 步「月曆／班表」、助理待確認「清單／月曆」共用。
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: ReadonlyArray<readonly [T, string]>;
  value: NoInfer<T>;
  onChange(value: NoInfer<T>): void;
  /** 給讀螢幕軟體的名稱。 */
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`segmented ${className}`}
      role="group"
      aria-label={label}
      data-view-control
      style={{ "--count": options.length, "--i": Math.max(0, options.findIndex(([option]) => option === value)) } as CSSProperties}
    >
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map(([option, text]) => (
        <button key={option} type="button" className={option === value ? "is-active" : undefined} aria-pressed={option === value} onClick={() => onChange(option)}>
          {text}
        </button>
      ))}
    </span>
  );
}
