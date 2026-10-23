"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarDays, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import AppSidebar from "../AppSidebar";

const EVENTS_KEY = "alleviate-calendar-events-v1";
const LOOPS_KEY = "alleviate-feedback-loops-v1";
const DAY_START_KEY = "alleviate-calendar-day-start-v1";
type CalendarEvent = { id: string; title: string; date: string; time: string; endTime?: string; note: string; color?: number; repeat?: { interval: number; unit: "day"; until?: string; skipWeekdays?: number[] }; completedDates?: string[]; feedbackAction?: { object: string; actionId: string } };
type ReadingEvent = { id: string; object: string; metric: string; value: number; unit: string; note: string; date: string };

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function parseDate(key: string) { return new Date(`${key}T12:00:00`); }
function minuteOfDay(value: string) { const [hours, minutes] = value.split(":").map(Number); return (hours || 0) * 60 + (minutes || 0); }
function formatHour(hour: number) { return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`; }
function formatClock(value: string) { if (!value) return ""; const [hours, minutes] = value.split(":").map(Number); const safeHour = hours || 0; return `${safeHour % 12 || 12}:${String(minutes || 0).padStart(2, "0")} ${safeHour < 12 ? "AM" : "PM"}`; }
function nextHour(value: string) { if (!value) return ""; const date = new Date(2000, 0, 1, ...value.split(":").map(Number) as [number, number]); date.setHours(date.getHours() + 1); return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
function timeValue(minutes: number) { const safe = ((minutes % 1440) + 1440) % 1440; return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`; }
function eventDuration(event: CalendarEvent) { if (!event.time) return 60; const start = minuteOfDay(event.time); const finish = event.endTime ? minuteOfDay(event.endTime) : start + 60; return Math.max(15, (finish <= start ? finish + 1440 : finish) - start); }
function eventColorIndex(event: CalendarEvent) {
  if (Number.isInteger(event.color) && (event.color as number) >= 0) return (event.color as number) % 7;
  return Array.from(event.id).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7) % 7;
}
function eventOccursOnDate(event: CalendarEvent, key: string) {
  if (key < event.date) return false;
  if (!event.repeat) return key === event.date;
  if (event.repeat.until && key > event.repeat.until) return false;
  if (event.repeat.skipWeekdays?.includes(parseDate(key).getDay())) return false;
  const elapsedDays = Math.round((parseDate(key).getTime() - parseDate(event.date).getTime()) / 86400000);
  return elapsedDays >= 0 && elapsedDays % Math.max(1, event.repeat.interval || 1) === 0;
}
function scheduleActionUrl(object: string, action: { id: string; name: string; details: string }) {
  const params = new URLSearchParams({ actionTitle: action.name || "Feedback action", actionDetails: action.details || "", feedbackObject: object, feedbackActionId: action.id });
  return `/calendar?${params.toString()}`;
}
function readEvents(): CalendarEvent[] {
  try {
    const value = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
    return Array.isArray(value) ? value.filter((event) => event && typeof event.id === "string" && typeof event.title === "string" && typeof event.date === "string").map((event) => ({ ...event, time: typeof event.time === "string" ? event.time : "", note: typeof event.note === "string" ? event.note : "" })) : [];
  } catch { return []; }
}
function readReadings(): ReadingEvent[] {
  try {
    const loops = JSON.parse(localStorage.getItem(LOOPS_KEY) || "{}");
    if (!loops || typeof loops !== "object" || Array.isArray(loops)) return [];
    return Object.entries(loops).flatMap(([object, raw]) => {
      const loop = raw as { metric?: string; unit?: string; readings?: Array<{ id?: string; date?: string; value?: number; note?: string }> };
      return Array.isArray(loop.readings) ? loop.readings.filter((reading) => reading?.date && Number.isFinite(reading.value)).map((reading, index) => ({
        id: `${object}-${reading.id || index}`, object, metric: loop.metric || "Progress", value: reading.value as number, unit: loop.unit || "", note: reading.note || "", date: reading.date as string,
      })) : [];
    });
  } catch { return []; }
}

export default function CalendarPage() {
  const [now, setNow] = useState(() => new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [readings, setReadings] = useState<ReadingEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [view, setView] = useState<"year" | "month" | "week" | "day" | "agenda" | "multi-day">("week");
  const [dayStartHour, setDayStartHour] = useState(7);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [note, setNote] = useState("");
  const [repeatMode, setRepeatMode] = useState<"none" | "daily" | "custom">("none");
  const [repeatInterval, setRepeatInterval] = useState(2);
  const [repeatUntil, setRepeatUntil] = useState("");
  const [skipWeekdays, setSkipWeekdays] = useState<number[]>([]);
  const [exceptOpen, setExceptOpen] = useState(false);
  const [feedbackAction, setFeedbackAction] = useState<{ object: string; actionId: string } | undefined>();
  const [resizePreview, setResizePreview] = useState<{ id: string; duration: number } | null>(null);
  const resizeGesture = useRef<{ id: string; startY: number; duration: number; start: number } | null>(null);
  const eventsRef = useRef(events);
  const timeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { eventsRef.current = events; }, [events]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const storedStart = localStorage.getItem(DAY_START_KEY);
      if (storedStart !== null) {
        const savedStart = Number(storedStart);
        if (Number.isInteger(savedStart) && savedStart >= 0 && savedStart <= 23) setDayStartHour(savedStart);
      }
    } catch { /* Keep the default start time if storage is unavailable. */ }
  }, []);

  useEffect(() => {
    const refresh = () => { setEvents(readEvents()); setReadings(readReadings()); };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("feedback-loops-updated", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("feedback-loops-updated", refresh); };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const actionTitle = params.get("actionTitle");
    if (!actionTitle) return;
    const object = params.get("feedbackObject") || "";
    const actionId = params.get("feedbackActionId") || "";
    setTitle(actionTitle);
    setTime("09:00");
    setEndTime("10:00");
    setNote([object && `Feedback loop · ${object}`, params.get("actionDetails")].filter(Boolean).join(" — "));
    if (object && actionId) setFeedbackAction({ object, actionId });
    setShowForm(true);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (view === "week" || view === "day" || view === "multi-day") {
      requestAnimationFrame(() => { if (timeScrollRef.current) timeScrollRef.current.scrollTop = 32 + dayStartHour * 60 - 8; });
    }
  }, [view, selectedDate, dayStartHour]);

  useEffect(() => {
    const onPointerMove = (pointer: PointerEvent) => {
      const gesture = resizeGesture.current;
      if (!gesture) return;
      const delta = Math.round((pointer.clientY - gesture.startY) / 15) * 15;
      const duration = Math.max(15, Math.min(1440 - gesture.start, gesture.duration + delta));
      setResizePreview({ id: gesture.id, duration });
    };
    const onPointerUp = (pointer: PointerEvent) => {
      const gesture = resizeGesture.current;
      if (!gesture) return;
      const delta = Math.round((pointer.clientY - gesture.startY) / 15) * 15;
      const duration = Math.max(15, Math.min(1440 - gesture.start, gesture.duration + delta));
      const endTime = timeValue(gesture.start + duration);
      const next = eventsRef.current.map((event) => event.id === gesture.id ? { ...event, endTime } : event);
      eventsRef.current = next;
      setEvents(next);
      try { localStorage.setItem(EVENTS_KEY, JSON.stringify(next)); } catch { /* Keep the resized event visible for this session. */ }
      resizeGesture.current = null;
      setResizePreview(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp); };
  }, []);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = first.getDay();
    const total = Math.ceil((offset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: total }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offset + 1));
  }, [month]);
  const selectedDay = parseDate(selectedDate);
  const weekStart = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate() - selectedDay.getDay());
  const weekDays = Array.from({ length: 7 }, (_, index) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index));
  const multiDays = Array.from({ length: 3 }, (_, index) => new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate() + index));
  const timeViewDays = view === "week" ? weekDays : view === "multi-day" ? multiDays : [selectedDay];
  const shownDays = view === "agenda" ? days.filter((day) => day.getMonth() === month.getMonth()) : timeViewDays;
  const calendarTitle = view === "year"
    ? String(month.getFullYear())
    : view === "month" || view === "agenda"
    ? month.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : view === "day"
      ? selectedDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : view === "week" && weekDays[0].getMonth() === weekDays[6].getMonth() && weekDays[0].getFullYear() === weekDays[6].getFullYear()
        ? weekDays[0].toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : `${(view === "multi-day" ? multiDays[0] : weekDays[0]).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${(view === "multi-day" ? multiDays[2] : weekDays[6]).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  function moveMonth(offset: number) {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    const selectedDay = Number(selectedDate.slice(-2)) || 1;
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    setMonth(nextMonth);
    setSelectedDate(dateKey(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(selectedDay, lastDay))));
  }
  function selectMonthDay(day: Date) {
    setSelectedDate(dateKey(day));
    if (day.getMonth() !== month.getMonth() || day.getFullYear() !== month.getFullYear()) setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  }

  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const repeat = repeatMode === "none" ? undefined : { interval: repeatMode === "daily" ? 1 : Math.max(1, Math.min(365, repeatInterval)), unit: "day" as const, ...(skipWeekdays.length ? { skipWeekdays } : {}), ...(repeatUntil && repeatUntil >= selectedDate ? { until: repeatUntil } : {}) };
    const existing = editingEventId ? events.find((item) => item.id === editingEventId) : undefined;
    const updated = { id: editingEventId || crypto.randomUUID(), title: title.trim(), date: selectedDate, time: allDay ? "" : time, endTime: allDay ? undefined : endTime || nextHour(time), note: note.trim(), color: existing?.color ?? Math.floor(Math.random() * 7), repeat, feedbackAction, completedDates: existing?.completedDates || [] };
    const next = editingEventId ? events.map((item) => item.id === editingEventId ? updated : item) : [...events, updated];
    setEvents(next);
    try { localStorage.setItem(EVENTS_KEY, JSON.stringify(next)); } catch { /* Keep this event visible for the current session. */ }
    resetEventForm();
  }
  function resetEventForm() {
    setTitle(""); setTime(""); setEndTime(""); setAllDay(false); setNote(""); setRepeatMode("none"); setRepeatInterval(2); setRepeatUntil(""); setSkipWeekdays([]); setExceptOpen(false); setFeedbackAction(undefined); setEditingEventId(null); setShowForm(false);
  }
  function editEvent(item: CalendarEvent) {
    setEditingEventId(item.id);
    setTitle(item.title);
    setSelectedDate(item.date);
    setTime(item.time || "");
    setEndTime(item.endTime || (item.time ? nextHour(item.time) : ""));
    setAllDay(!item.time);
    setNote(item.note || "");
    setRepeatMode(item.repeat ? (item.repeat.interval === 1 ? "daily" : "custom") : "none");
    setRepeatInterval(item.repeat?.interval || 2);
    setRepeatUntil(item.repeat?.until || "");
    setSkipWeekdays(item.repeat?.skipWeekdays || []);
    setExceptOpen(false);
    setFeedbackAction(item.feedbackAction);
    setShowForm(true);
  }
  function editEventById(id: string) {
    const item = events.find((candidate) => candidate.id === id);
    if (item) editEvent(item);
  }
  function removeEvent(id: string) {
    const next = events.filter((event) => event.id !== id);
    setEvents(next);
    try { localStorage.setItem(EVENTS_KEY, JSON.stringify(next)); } catch { /* Keep the current view responsive if storage is unavailable. */ }
  }
  function moveCalendar(offset: number) {
    if (view === "month" || view === "agenda") { moveMonth(offset); return; }
    if (view === "year") {
      const year = month.getFullYear() + offset;
      const selectedDay = Number(selectedDate.slice(-2)) || 1;
      const selectedMonth = Number(selectedDate.slice(5, 7)) - 1;
      const lastDay = new Date(year, selectedMonth + 1, 0).getDate();
      setMonth(new Date(year, month.getMonth(), 1));
      setSelectedDate(dateKey(new Date(year, selectedMonth, Math.min(selectedDay, lastDay))));
      return;
    }
    const next = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate() + offset * (view === "week" ? 7 : view === "multi-day" ? 3 : 1));
    setSelectedDate(dateKey(next));
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }
  function createEventAt(day: Date, hour: number) {
    resetEventForm();
    setSelectedDate(dateKey(day));
    setTitle(""); setNote(""); setTime(`${String(hour).padStart(2, "0")}:00`); setEndTime(`${String(hour + 1).padStart(2, "0")}:00`);
    setShowForm(true);
  }
  function startResize(event: React.PointerEvent<HTMLButtonElement>, item: CalendarEvent) {
    event.preventDefault(); event.stopPropagation();
    const start = minuteOfDay(item.time);
    const duration = eventDuration(item);
    resizeGesture.current = { id: item.id, startY: event.clientY, duration, start };
    setResizePreview({ id: item.id, duration });
  }
  function dropEvent(event: React.DragEvent<HTMLDivElement>, day: Date) {
    event.preventDefault();
    const [id, occurrenceDate] = event.dataTransfer.getData("text/plain").split("|");
    const existing = eventsRef.current.find((item) => item.id === id);
    if (!existing) return;
    const columnTop = event.currentTarget.getBoundingClientRect().top;
    const snappedMinute = Math.round((event.clientY - columnTop - 32) / 15) * 15;
    const start = Math.max(0, Math.min(1439, snappedMinute));
    const duration = existing.time ? eventDuration(existing) : 60;
    const occurrence = parseDate(occurrenceDate || existing.date);
    const target = parseDate(dateKey(day));
    const dayShift = Math.round((target.getTime() - occurrence.getTime()) / 86400000);
    const shiftedBase = parseDate(existing.date);
    shiftedBase.setDate(shiftedBase.getDate() + dayShift);
    const shiftedUntil = existing.repeat?.until ? parseDate(existing.repeat.until) : undefined;
    shiftedUntil?.setDate(shiftedUntil.getDate() + dayShift);
    const next = eventsRef.current.map((item) => item.id === id ? {
      ...item,
      date: dateKey(shiftedBase),
      time: timeValue(start),
      endTime: timeValue(Math.min(1440, start + duration)),
      ...(item.repeat && shiftedUntil ? { repeat: { ...item.repeat, until: dateKey(shiftedUntil) } } : {}),
    } : item);
    eventsRef.current = next;
    setEvents(next);
    try { localStorage.setItem(EVENTS_KEY, JSON.stringify(next)); } catch { /* Keep the moved event visible for this session. */ }
  }

  return <main className="home-page">
    <AppSidebar active="calendar" />
    <div className="home-main">
      <section className="calendar-page-content calendar-full-page">
        <header className="calendar-month-header">
          <div className="calendar-month-title"><CalendarDays size={20} /><h1>{calendarTitle}</h1></div>
          <div className="calendar-top-controls">
            <button className="calendar-add-event-button" aria-label="Add event" title="Add event" onClick={() => { resetEventForm(); setShowForm(true); }}><Plus size={19} /></button>
            <label className="calendar-view-select-label"><span className="sr-only">Calendar view</span><select className="calendar-view-select" value={view} onChange={(event) => setView(event.target.value as typeof view)}><option value="year">Year</option><option value="month">Month</option><option value="week">Week</option><option value="day">Day</option><option value="agenda">Agenda</option><option value="multi-day">3 days</option></select><ChevronDown size={14} /></label>
            {(view === "week" || view === "day" || view === "multi-day") && <label className="calendar-day-start-select"><span>Day starts</span><select aria-label="Day starts" value={dayStartHour} onChange={(event) => { const value = Number(event.target.value); setDayStartHour(value); try { localStorage.setItem(DAY_START_KEY, String(value)); } catch { /* Keep the chosen start time for this session. */ } }}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{formatHour(hour)}</option>)}</select><ChevronDown size={13} /></label>}
            <div className="calendar-month-controls"><button className="icon-btn" aria-label={`Previous ${view}`} onClick={() => moveCalendar(-1)}><ChevronLeft size={17} /></button><button className="calendar-today-btn" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(dateKey(today)); }}>Today</button><button className="icon-btn" aria-label={`Next ${view}`} onClick={() => moveCalendar(1)}><ChevronRight size={17} /></button></div>
          </div>
        </header>
        {view === "month" && <section className="calendar-month-view" aria-label="Monthly calendar">
          <div className="calendar-month-weekdays">{"Sun Mon Tue Wed Thu Fri Sat".split(" ").map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-month-grid" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>{days.map((day) => {
            const key = dateKey(day);
            const dayEvents = events.filter((event) => eventOccursOnDate(event, key)).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
            const dayReadings = readings.filter((reading) => reading.date === key);
            const isToday = key === dateKey(new Date());
            return <article key={key} className={`calendar-month-day ${day.getMonth() !== month.getMonth() ? "is-outside" : ""} ${key === selectedDate ? "is-selected" : ""}`} onClick={() => selectMonthDay(day)}>
              <button className={`calendar-month-day-number ${isToday ? "is-today" : ""}`} onClick={() => selectMonthDay(day)}>{day.getDate()}{day.getMonth() !== month.getMonth() && day.getDate() === 1 ? ` ${day.toLocaleDateString(undefined, { month: "short" })}` : ""}</button>
              <div className="calendar-month-day-events">
                {dayEvents.map((event) => <div role="button" tabIndex={0} onClick={(click) => { click.stopPropagation(); editEvent(event); }} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") { keyEvent.preventDefault(); keyEvent.stopPropagation(); editEvent(event); } }} className={`calendar-event-chip event-color-${eventColorIndex(event)} ${event.completedDates?.includes(key) ? "is-completed" : ""}`} key={`${event.id}-${key}`} title={`Edit ${event.title}`}><span className="calendar-event-check">✓</span><strong>{event.title}</strong>{event.time && <time>{event.time}</time>}{event.repeat && <span title="Repeating event">↻</span>}<button aria-label={`Delete ${event.title} series`} title="Delete event series" onClick={(click) => { click.stopPropagation(); removeEvent(event.id); }}><X size={12} /></button></div>)}
                {dayReadings.map((reading) => <div className="calendar-event-chip calendar-reading-chip" key={reading.id} title={reading.note || `${reading.metric} logged for ${reading.object}`}><span className="calendar-event-check">✓</span><strong>{reading.object}: {reading.value}{reading.unit ? ` ${reading.unit}` : ""}</strong><time>{reading.metric}</time></div>)}
              </div>
              <button className="calendar-day-add" aria-label={`Add event on ${key}`} onClick={(click) => { click.stopPropagation(); resetEventForm(); selectMonthDay(day); setShowForm(true); }}><Plus size={14} /></button>
            </article>;
          })}</div>
        </section>}
        {view === "year" && <section className="calendar-year-view" aria-label={`${month.getFullYear()} calendar`}>
          {Array.from({ length: 12 }, (_, monthIndex) => {
            const year = month.getFullYear();
            const firstDay = new Date(year, monthIndex, 1).getDay();
            const dayCount = new Date(year, monthIndex + 1, 0).getDate();
            const cellCount = Math.ceil((firstDay + dayCount) / 7) * 7;
            const monthDate = new Date(year, monthIndex, 1);
            return <article className="calendar-year-month" key={`${year}-${monthIndex}`}>
              <button type="button" className="calendar-year-month-title" onClick={() => {
                const selectedDay = Number(selectedDate.slice(-2)) || 1;
                const lastDay = new Date(year, monthIndex + 1, 0).getDate();
                setMonth(monthDate);
                setSelectedDate(dateKey(new Date(year, monthIndex, Math.min(selectedDay, lastDay))));
                setView("month");
              }}>{monthDate.toLocaleDateString(undefined, { month: "long" })}</button>
              <div className="calendar-year-weekdays" aria-hidden="true">{"SMTWTFS".split("").map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
              <div className="calendar-year-days">{Array.from({ length: cellCount }, (_, slot) => {
                const dayNumber = slot - firstDay + 1;
                if (dayNumber < 1 || dayNumber > dayCount) return <span className="is-empty" key={slot} />;
                const day = new Date(year, monthIndex, dayNumber);
                const key = dateKey(day);
                const hasItems = events.some((event) => eventOccursOnDate(event, key)) || readings.some((reading) => reading.date === key);
                return <button type="button" key={key} className={`${key === dateKey(now) ? "is-today" : ""} ${key === selectedDate ? "is-selected" : ""} ${hasItems ? "has-items" : ""}`} aria-label={`${day.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}${hasItems ? ", has items" : ""}`} onClick={() => { selectMonthDay(day); setView("month"); }}>{dayNumber}</button>;
              })}</div>
            </article>;
          })}
        </section>}
        {(view === "week" || view === "day" || view === "multi-day") && <section className={`calendar-time-view ${view === "multi-day" ? "is-multi-day" : ""}`} aria-label={`${view} calendar`}>
          <div className="calendar-time-header"><div className="calendar-time-gutter" />{timeViewDays.map((day) => <button key={dateKey(day)} className={`calendar-time-day-heading ${dateKey(day) === dateKey(new Date()) ? "is-today" : ""}`} onClick={() => { setSelectedDate(dateKey(day)); setView("day"); }}><span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>{day.getDate()}</strong></button>)}</div>
          <div className="calendar-time-scroll" ref={timeScrollRef}><div className="calendar-time-grid" style={{ gridTemplateColumns: `58px repeat(${timeViewDays.length}, minmax(0, 1fr))` }}>
            <div className="calendar-hour-labels"><div className="calendar-hour-label is-all-day-label">All day</div>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="calendar-hour-label">{new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" })}</div>)}</div>
            {timeViewDays.map((day) => {
              const key = dateKey(day);
              const dayEvents = events.filter((event) => eventOccursOnDate(event, key));
              const dayReadings = readings.filter((reading) => reading.date === key);
              return <div className="calendar-time-column" key={key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropEvent(event, day)}>
                <div className="calendar-all-day-lane">{dayEvents.filter((event) => !event.time).map((event) => <div key={`${event.id}-${key}`} draggable role="button" tabIndex={0} onClick={() => editEvent(event)} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") { keyEvent.preventDefault(); editEvent(event); } }} onDragStart={(drag) => { drag.dataTransfer.setData("text/plain", `${event.id}|${key}`); drag.dataTransfer.effectAllowed = "move"; }} className={`calendar-timed-event all-day-event event-color-${eventColorIndex(event)} ${event.feedbackAction ? "is-feedback-action" : ""} ${event.completedDates?.includes(key) ? "is-completed" : ""}`} title={`Edit ${event.title} · Drag into the calendar to set a time`}><span>{event.title}{event.repeat ? " ↻" : ""}</span><button className="calendar-time-delete" aria-label={`Delete ${event.title} series`} onClick={(click) => { click.stopPropagation(); removeEvent(event.id); }}>×</button></div>)}{dayReadings.map((reading) => <div key={reading.id} className="calendar-timed-event all-day-reading">{reading.object}: {reading.value}{reading.unit ? ` ${reading.unit}` : ""}</div>)}</div>
                <div className="calendar-hour-lines">{Array.from({ length: 24 }, (_, hour) => <button type="button" key={hour} aria-label={`Add event on ${key} at ${formatClock(`${String(hour).padStart(2, "0")}:00`)}`} className="calendar-time-slot" onClick={() => createEventAt(day, hour)} />)}</div>
                {key === dateKey(now) && <div className="calendar-now-indicator" style={{ top: 32 + now.getHours() * 60 + now.getMinutes() }} aria-label={`Current time, ${formatClock(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`)}`} />}
                {dayEvents.filter((event) => event.time).map((event) => { const start = minuteOfDay(event.time); const effectiveDuration = resizePreview?.id === event.id ? resizePreview.duration : eventDuration(event); const finish = start + effectiveDuration; const top = 32 + start; const height = Math.min(Math.max(24, effectiveDuration), 1440 - start); const compact = height < 42; return <article key={`${event.id}-${key}`} role="button" tabIndex={0} onClick={() => editEvent(event)} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") { keyEvent.preventDefault(); editEvent(event); } }} className={`calendar-timed-event event-color-${eventColorIndex(event)} ${compact ? "is-compact" : ""} ${event.feedbackAction ? "is-feedback-action" : ""} ${resizePreview?.id === event.id ? "is-resizing" : ""} ${event.completedDates?.includes(key) ? "is-completed" : ""}`} style={{ top, height }} title={event.note || `Edit ${event.title}`} draggable={!resizeGesture.current} onDragStart={(drag) => { drag.dataTransfer.setData("text/plain", `${event.id}|${key}`); drag.dataTransfer.effectAllowed = "move"; }}><strong>{event.title}{event.repeat ? " ↻" : ""}</strong><span>{formatClock(event.time)} – {formatClock(timeValue(finish))}</span><button className="calendar-timed-delete" aria-label={`Delete ${event.title} series`} onClick={(click) => { click.stopPropagation(); removeEvent(event.id); }}><X size={12} /></button><button type="button" className="calendar-event-resize-handle" aria-label={`Resize ${event.title}`} title="Drag the lower edge to change duration" onPointerDown={(pointer) => startResize(pointer, event)} /></article>; })}
              </div>;
            })}
          </div></div>
        </section>}
        {view === "agenda" && <section className="calendar-agenda-view" aria-label="Agenda">
          {shownDays.map((day) => { const key = dateKey(day); const items = [...events.filter((event) => eventOccursOnDate(event, key)).map((event) => ({ kind: "event" as const, id: event.id, title: `${event.title}${event.repeat ? " ↻" : ""}`, time: event.time, endTime: event.endTime, note: event.note, color: eventColorIndex(event) })), ...readings.filter((reading) => reading.date === key).map((reading) => ({ kind: "reading" as const, id: reading.id, title: `${reading.object} · ${reading.value}${reading.unit ? ` ${reading.unit}` : ""}`, time: "", endTime: undefined, note: `${reading.metric}${reading.note ? ` · ${reading.note}` : ""}`, color: 1 }))].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")); if (!items.length) return null; return <section className="calendar-agenda-day" key={key}><header><strong>{day.getDate()}</strong><div><b>{day.toLocaleDateString(undefined, { weekday: "long" })}</b><span>{day.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span></div></header><div className="calendar-agenda-items">{items.map((item) => <article role={item.kind === "event" ? "button" : undefined} tabIndex={item.kind === "event" ? 0 : undefined} onClick={() => { if (item.kind === "event") editEventById(item.id); }} onKeyDown={(keyEvent) => { if (item.kind === "event" && (keyEvent.key === "Enter" || keyEvent.key === " ")) { keyEvent.preventDefault(); editEventById(item.id); } }} className={`calendar-agenda-item event-color-${item.color} ${item.kind === "reading" ? "is-reading" : ""}`} key={`${item.kind}-${item.id}-${key}`}><time>{item.time ? `${formatClock(item.time)}${item.endTime ? ` – ${formatClock(item.endTime)}` : ""}` : item.kind === "reading" ? "Progress" : "All day"}</time><div><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}</div>{item.kind === "event" && <button aria-label={`Delete ${item.title} series`} onClick={(click) => { click.stopPropagation(); removeEvent(item.id); }}><Trash2 size={14} /></button>}</article>)}</div></section>; })}
          {!shownDays.some((day) => events.some((event) => eventOccursOnDate(event, dateKey(day))) || readings.some((reading) => reading.date === dateKey(day))) && <div className="calendar-agenda-empty"><CalendarDays size={24} /><strong>No plans this month</strong><span>Add an event or log feedback progress to see it here.</span></div>}
        </section>}
        <nav className="calendar-bottom-switcher" aria-label="Calendar view navigation">
          <div className="calendar-bottom-view-buttons">
            <button className={view === "year" ? "is-active" : ""} aria-pressed={view === "year"} onClick={() => setView("year")}>Year</button>
            {(["month", "week", "day", "agenda", "multi-day"] as const).map((option) => <button key={option} className={view === option ? "is-active" : ""} aria-pressed={view === option} onClick={() => setView(option)}>{option === "multi-day" ? "Multi-Day" : option[0].toUpperCase() + option.slice(1)}</button>)}
          </div>
        </nav>
        {showForm && <div className="calendar-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) resetEventForm(); }}><form className="calendar-event-modal task-schedule-modal" onSubmit={saveEvent}>
          <header><div><span>TASK SCHEDULE</span><h2>{editingEventId ? "Edit schedule" : "Schedule task"}</h2></div><button type="button" className="icon-btn" aria-label="Close schedule" onClick={resetEventForm}><X size={17} /></button></header>
          <label>Title<input autoFocus required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you planning?" /></label>
          <div className={`calendar-modal-row calendar-modal-date-row ${allDay ? "is-all-day" : ""}`}><label>Date<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} required /></label>{!allDay && <><label>Start<input type="time" value={time} onChange={(event) => { setTime(event.target.value); if (event.target.value) setEndTime(nextHour(event.target.value)); }} /></label><label>End<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></>}</div>
          <label>Note<input maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional details" /></label>
          <fieldset className="calendar-repeat-fieldset"><legend>Repeat</legend>
            <div className="calendar-modal-row calendar-repeat-frequency-row"><label>Frequency<select value={repeatMode} onChange={(event) => { setRepeatMode(event.target.value as typeof repeatMode); if (event.target.value === "none") setExceptOpen(false); }}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="custom">Custom interval</option></select></label>
              {repeatMode === "custom" && <label>Repeat every<input type="number" min={1} max={365} value={repeatInterval} onChange={(event) => setRepeatInterval(Number(event.target.value) || 1)} aria-label="Repeat every number of days" /></label>}
              {repeatMode !== "none" && <div className="calendar-except-wrap"><span>Except</span><button type="button" className="calendar-except-trigger" aria-expanded={exceptOpen} onClick={() => setExceptOpen((open) => !open)}>{skipWeekdays.length ? `${skipWeekdays.length} days` : "Weekdays"}<ChevronDown size={13}/></button>{exceptOpen && <div className="calendar-except-menu" role="group" aria-label="Skip weekdays"><strong className="calendar-except-menu-title">Skip days</strong><div className="calendar-except-days">{[[1,"Monday"],[2,"Tuesday"],[3,"Wednesday"],[4,"Thursday"],[5,"Friday"],[6,"Saturday"],[0,"Sunday"]].map(([day, label]) => <label key={day}><input type="checkbox" checked={skipWeekdays.includes(Number(day))} onChange={() => setSkipWeekdays((current) => current.includes(Number(day)) ? current.filter((item) => item !== Number(day)) : [...current, Number(day)])}/>{label}</label>)}</div></div>}</div>}
            </div>
            {repeatMode !== "none" && <div className="calendar-modal-row calendar-repeat-end"><label>Until (optional)<input type="date" min={selectedDate} value={repeatUntil} onChange={(event) => setRepeatUntil(event.target.value)} /></label></div>}
          </fieldset>
          <footer><label className="calendar-all-day-toggle"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />All day</label><div className="calendar-modal-footer-actions"><button type="button" className="calendar-today-btn" onClick={resetEventForm}>Cancel</button><button className="primary-btn" type="submit"><CalendarPlus size={15} /> {editingEventId ? "Save changes" : "Save schedule"}</button></div></footer>
        </form></div>}
      </section>
    </div>
  </main>;
}
