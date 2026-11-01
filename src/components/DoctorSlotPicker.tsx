"use client";

import { courseProfile } from "@/config/clinic.config";
import { DISPLAY_FIRST_DOCTOR_IDS, DISPLAY_LAST_DOCTOR_IDS, LIMITED_BOOKING_DOCTOR_IDS } from "@/config/doctors";
import type { DoctorSlot } from "@/domain/rules/doctor-schedule";

const displayRank = (personId: string, limited: boolean) =>
  DISPLAY_FIRST_DOCTOR_IDS.includes(personId) ? 0 : DISPLAY_LAST_DOCTOR_IDS.includes(personId) ? 3 : limited ? 2 : 1;

/** 勾選清單的醫師順序：林志明最上、陳美玲最下，其他照名單。 */
export const DOCTORS = courseProfile.people
  .filter((person) => person.role === "doctor")
  .map((person, index) => ({ person, index }))
  .sort((a, b) => displayRank(a.person.id, false) - displayRank(b.person.id, false) || a.index - b.index)
  .map(({ person }) => person);
export const shortDoctorName = (personId: string) =>
  (DOCTORS.find((person) => person.id === personId)?.displayName ?? personId).replace(/醫師$/, "");

/**
 * 顯示順序：DISPLAY_FIRST（林志明）最上、DISPLAY_LAST（陳美玲）最下；
 * 其他醫師照原順序，不開放一般約診（括號）的排在他們後面。不改存的資料。
 */
export function displayOrder<T extends { personId: string; limited?: boolean; limitedBooking?: boolean }>(list: T[]): T[] {
  return list
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        displayRank(a.item.personId, !!(a.item.limited ?? a.item.limitedBooking)) -
          displayRank(b.item.personId, !!(b.item.limited ?? b.item.limitedBooking)) || a.index - b.index,
    )
    .map(({ item }) => item);
}

/** 一診的醫師勾選清單：勾選看診；LIMITED_BOOKING_DOCTOR_IDS 的醫師（或舊資料已標記的）才可再勾「不開放一般約診」。 */
export function DoctorSlotPicker({ slots, onChange }: { slots: DoctorSlot[]; onChange(slots: DoctorSlot[]): void }) {
  const toggleDoctor = (personId: string) =>
    onChange(
      slots.some((slot) => slot.personId === personId)
        ? slots.filter((slot) => slot.personId !== personId)
        : [...slots, { personId, limited: false }],
    );
  const toggleLimited = (personId: string) =>
    onChange(slots.map((slot) => (slot.personId === personId ? { ...slot, limited: !slot.limited } : slot)));
  return (
    <ul className="slot-picker">
      {DOCTORS.map((doctor) => {
        const slot = slots.find((item) => item.personId === doctor.id);
        return (
          <li key={doctor.id}>
            <label>
              <input type="checkbox" checked={!!slot} onChange={() => toggleDoctor(doctor.id)} />
              {doctor.displayName}
            </label>
            {(LIMITED_BOOKING_DOCTOR_IDS.includes(doctor.id) || slot?.limited) && (
              <label className={slot ? "" : "is-muted"}>
                <input type="checkbox" disabled={!slot} checked={!!slot?.limited} onChange={() => toggleLimited(doctor.id)} />
                不開放一般約診
              </label>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DoctorChips({ slots }: { slots?: DoctorSlot[] }) {
  if (!slots || slots.length === 0) return <span className="month-empty">＋</span>;
  return (
    <span className="doctor-chips">
      {displayOrder(slots).map((slot) => (
        <span key={slot.personId} className={`doctor-chip ${slot.limited ? "is-limited" : ""}`}>
          {slot.limited ? `(${shortDoctorName(slot.personId)})` : shortDoctorName(slot.personId)}
        </span>
      ))}
    </span>
  );
}
