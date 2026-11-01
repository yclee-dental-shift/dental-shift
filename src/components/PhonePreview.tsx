"use client";

import { useState, type ReactNode } from "react";
import { PHONE_FRAME_PREFIX, useIsPhoneFrame, useViewer, VIEW_AS_CHOICES } from "./ViewerProvider";

/** 預覽手機的大小（iPhone 14／15 的畫面寬高）。 */
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;

/**
 * 一支預覽手機：iframe 用手機寬度打開同一個網站（版面照手機），name 指定這支手機用誰的身分（見 ViewerProvider）。
 * 換身分或按「回首頁」會重新打開這支手機。
 */
function Phone({ title, viewer, children }: { title: string; viewer: string; children?: ReactNode }) {
  const [reload, setReload] = useState(0);
  return (
    <section className="phone-preview-item">
      <div className="phone-preview-head">
        <strong>{title}</strong>
        {children}
        <button type="button" className="button button-quiet" onClick={() => setReload(reload + 1)}>回首頁</button>
      </div>
      <div className="phone-frame">
        <iframe
          key={`${viewer}-${reload}`}
          name={`${PHONE_FRAME_PREFIX}${viewer}`}
          src="/"
          title={`${title}的手機畫面`}
          width={PHONE_WIDTH}
          height={PHONE_HEIGHT}
        />
      </div>
    </section>
  );
}

/**
 * 手機預覽（最高管理者）：在電腦上並排兩支手機，不用換手機或換帳號登入。
 * 左邊＝自己（照常操作）；右邊＝選名單上一個人，照他的職稱看他的畫面。
 */
export function PhonePreview() {
  const { viewer, member } = useViewer();
  const [other, setOther] = useState(VIEW_AS_CHOICES[0]?.value ?? "scheduler");
  const inPhoneFrame = useIsPhoneFrame();
  if (inPhoneFrame) {
    return <p className="info-callout">手機預覽裡不能再開手機預覽。</p>;
  }
  if (viewer !== "owner") {
    return <p className="info-callout">這一頁只有最高管理者可以使用。</p>;
  }
  return (
    <>
      <p className="page-intro">
        在電腦上看手機畫面。左邊是你自己，可以照常操作；右邊選一個人，用他的身分看他手機上的樣子（助理長、組長看到的是排班工作台那一套）
        {member ? "（只能看、不能改）" : "（本機模式的模擬身分）"}。兩支手機各自換頁、互不影響。
      </p>
      <div className="phone-preview">
        <Phone title="自己" viewer="self" />
        <Phone title="看別人" viewer={other}>
          <label className="phone-preview-pick">
            <select aria-label="右邊手機用誰的身分看" value={other} onChange={(event) => setOther(event.target.value)}>
              {VIEW_AS_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </select>
          </label>
        </Phone>
      </div>
    </>
  );
}
