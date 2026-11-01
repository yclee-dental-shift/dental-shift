import { holidayNote } from "./schedule-settings";

/** 國定假日照常看診（「端午 照常」）或補休（「補 6/9 端午」）的小標示；滑鼠移上去看完整說明。 */
export function HolidayNote({ date }: { date: string }) {
  const note = holidayNote(date);
  if (!note) return null;
  return (
    <small className={`holiday-note is-${note.kind}`} title={note.detail}>
      {note.short}
    </small>
  );
}
