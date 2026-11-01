"use client";

import { courseProfile } from "@/config/clinic.config";
import { ManagerOnly } from "@/components/ManagerOnly";
import { PhonePreview } from "@/components/PhonePreview";

export default function PhonePreviewPage() {
  return (
    <ManagerOnly>
      <main className="page-shell">
        <p className="eyebrow">{courseProfile.clinicName}</p>
        <h1>手機預覽</h1>
        <PhonePreview />
      </main>
    </ManagerOnly>
  );
}
