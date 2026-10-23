export type TaskScheduleSummaryInput = {
  time?: string;
  endTime?: string;
  note?: string;
  repeat?: { interval?: number; until?: string; skipWeekdays?: number[] };
  feedbackAction?: { object?: string };
};

function cleanScheduleNote(task: TaskScheduleSummaryInput) {
  const object = task.feedbackAction?.object?.trim();
  let note = task.note?.trim() || "";
  if (object) {
    const prefix = `Feedback loop · ${object}`;
    if (note.toLocaleLowerCase() === prefix.toLocaleLowerCase()) return "";
    if (note.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) {
      note = note.slice(prefix.length).replace(/^\s*(?:—|·)\s*/, "");
    }
  } else {
    const legacy = note.match(/^Feedback loop\s*[·:]\s*([^—·]+?)(?:\s*[—·]\s*(.*))?$/i);
    if (legacy) note = legacy[2]?.trim() || "";
  }
  return note;
}

function formatTime24(value: string) {
  const [hours, minutes] = value.split(":");
  if (hours === undefined || minutes === undefined) return value;
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

export function taskScheduleNote(task: TaskScheduleSummaryInput) {
  return cleanScheduleNote(task);
}

export function taskScheduleSummary(task: TaskScheduleSummaryInput) {
  const object = task.feedbackAction?.object?.trim();
  const skipped = [...new Set(task.repeat?.skipWeekdays || [])]
    .filter((day) => Number.isInteger(day) && day >= 0 && day < 7)
    .sort((a, b) => a - b);
  const frequency = !task.repeat
    ? "Once"
    : Math.max(1, task.repeat.interval || 1) === 1
      ? `${7 - skipped.length} days a week`
      : `Every ${Math.max(1, task.repeat.interval || 1)} days`;
  const time = task.time
    ? `${formatTime24(task.time)}${task.endTime ? ` – ${formatTime24(task.endTime)}` : ""}`
    : "All day";
  return [
    object || undefined,
    frequency,
    skipped.length ? `Skips: ${skipped.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ")}` : undefined,
    task.repeat?.until ? `Until ${task.repeat.until}` : undefined,
    time,
  ].filter((part): part is string => Boolean(part));
}
