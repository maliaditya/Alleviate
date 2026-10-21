"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, CheckSquare, Clock3, Repeat2, Trash2, Inbox, CalendarRange, List, Search, MoreHorizontal, ChevronDown, ArrowLeft, ArrowRight } from "lucide-react";
import AppSidebar from "../AppSidebar";
import { useAppDialogs } from "../AppDialogs";

const EVENTS_KEY = "alleviate-calendar-events-v1";
const FEEDBACK_LOOPS_KEY = "alleviate-feedback-loops-v1";
const RESOURCES_OBJECTS_KEY = "alleviate-resources-default-objects";
const LEGACY_OBJECTS_KEY = "alleviate-wisemapping-objects-v1";
type CalendarTask = { id: string; title: string; date: string; time?: string; endTime?: string; note?: string; repeat?: { interval: number; unit: "day"; until?: string; skipWeekdays?: number[] }; completedDates?: string[]; feedbackAction?: { object: string; actionId: string } };
type NeedAction = { id: string; name?: string; details?: string; complete?: boolean; completedDate?: string };
type NeedLoop = { actions?: NeedAction[] };
type NeedsTab = "objects" | "today" | "all";
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const localDate = (value: string) => new Date(`${value}T12:00:00`);
const formatTime = (value?: string) => {
  if (!value) return "All day";
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(2000, 0, 1, hours || 0, minutes || 0).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};
function occursOn(task: CalendarTask, day: string) {
  if (day < task.date || (task.repeat?.until && day > task.repeat.until)) return false;
  if (task.repeat?.skipWeekdays?.includes(localDate(day).getDay())) return false;
  if (!task.repeat) return day === task.date;
  const daysApart = Math.round((localDate(day).getTime() - localDate(task.date).getTime()) / 86400000);
  return daysApart >= 0 && daysApart % Math.max(1, task.repeat.interval || 1) === 0;
}
function readTasks(): CalendarTask[] {
  try {
    const stored = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((task) => task && typeof task.id === "string" && typeof task.title === "string" && typeof task.date === "string") : [];
  } catch { return []; }
}
function taskSchedule(event: CalendarTask) {
  if (!event.repeat) return "Once";
  const interval = Math.max(1, event.repeat.interval || 1);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const skipped = [...new Set(event.repeat.skipWeekdays || [])].filter((day) => Number.isInteger(day) && day >= 0 && day < 7).sort((a, b) => a - b).map((day) => weekdays[day]);
  const frequency = interval === 1 ? `${7 - skipped.length} days/week` : `Every ${interval} days`;
  return `${frequency}${skipped.length ? ` | Skips: ${skipped.join(",")}` : ""}${event.repeat.until ? ` · Until ${event.repeat.until}` : ""}`;
}
function taskTimeRange(event: CalendarTask) {
  const start = formatTime(event.time);
  return event.time && event.endTime ? `${start} – ${formatTime(event.endTime)}` : start;
}
function readObjects(): string[] {
  try {
    const saved = localStorage.getItem(RESOURCES_OBJECTS_KEY) ?? localStorage.getItem(LEGACY_OBJECTS_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? Array.from(new Set(parsed.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map((name) => name.trim()))) : [];
  } catch { return []; }
}
function saveTasks(tasks: CalendarTask[]) {
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(tasks)); window.dispatchEvent(new Event("calendar-events-updated")); } catch { /* Keep the task list responsive if storage is unavailable. */ }
}

export default function TasksPage() {
  const dialogs = useAppDialogs();
  const [events, setEvents] = useState<CalendarTask[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [view, setView] = useState<"today" | "next" | "inbox" | "list">("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [needsTab, setNeedsTab] = useState<NeedsTab>("all");
  const [loops, setLoops] = useState<Record<string, NeedLoop>>({});
  const [objects, setObjects] = useState<string[]>([]);
  const [monthOffset, setMonthOffset] = useState(0);
  const today = dateKey(new Date());
  const trackedMonth = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1);
  const monthDays = Array.from({ length: new Date(trackedMonth.getFullYear(), trackedMonth.getMonth() + 1, 0).getDate() }, (_, index) => new Date(trackedMonth.getFullYear(), trackedMonth.getMonth(), index + 1));
  const monthLabel = trackedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  useEffect(() => {
    const refresh = () => setEvents(readTasks());
    const refreshLoops = () => {
      try { const saved = JSON.parse(localStorage.getItem(FEEDBACK_LOOPS_KEY) || "{}"); setLoops(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}); }
      catch { setLoops({}); }
    };
    refresh();
    refreshLoops();
    const refreshObjects = () => setObjects(readObjects());
    refreshObjects();
    window.addEventListener("storage", refresh);
    window.addEventListener("storage", refreshLoops);
    window.addEventListener("calendar-events-updated", refresh);
    window.addEventListener("feedback-loops-updated", refreshLoops);
    window.addEventListener("resources-mindmap-updated", refreshObjects);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("storage", refreshLoops); window.removeEventListener("storage", refreshObjects); window.removeEventListener("calendar-events-updated", refresh); window.removeEventListener("feedback-loops-updated", refreshLoops); window.removeEventListener("resources-mindmap-updated", refreshObjects); };
  }, []);

  const todayEvents = useMemo(() => events.filter((event) => occursOn(event, today)).sort((a, b) => (a.time || "").localeCompare(b.time || "") || a.title.localeCompare(b.title)), [events, today]);
  const activeEvents = todayEvents.filter((event) => !event.completedDates?.includes(today));
  const completedEvents = todayEvents.filter((event) => event.completedDates?.includes(today));
  const nextSeven = useMemo(() => events.filter((event) => {
    const start = localDate(today).getTime();
    const end = start + 6 * 86400000;
    return Array.from({ length: 7 }, (_, index) => dateKey(new Date(start + index * 86400000))).some((day) => occursOn(event, day)) && !event.completedDates?.includes(event.date);
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "")), [events, today]);
  const visibleEvents = needsTab === "today" ? todayEvents : needsTab === "all" ? events : view === "today" ? todayEvents : view === "next" ? nextSeven : events;
  const selectedTask = visibleEvents.find((event) => event.id === selectedId) || visibleEvents[0];
  const toggleComplete = (event: CalendarTask) => {
    const completedDates = new Set(event.completedDates || []);
    if (completedDates.has(today)) completedDates.delete(today); else completedDates.add(today);
    const isComplete = completedDates.has(today);
    const next = events.map((item) => item.id === event.id ? { ...item, completedDates: Array.from(completedDates) } : item);
    setEvents(next);
    saveTasks(next);
    if (event.feedbackAction) {
      try {
        const loops = JSON.parse(localStorage.getItem(FEEDBACK_LOOPS_KEY) || "{}");
        const objectKey = event.feedbackAction.object.trim().toLocaleLowerCase();
        const loop = loops[objectKey];
        if (loop && Array.isArray(loop.actions)) {
          loop.actions = loop.actions.map((action: { id?: string; complete?: boolean; completedDate?: string }) => action.id === event.feedbackAction?.actionId ? { ...action, complete: isComplete, completedDate: isComplete ? today : undefined } : action);
          localStorage.setItem(FEEDBACK_LOOPS_KEY, JSON.stringify(loops));
          window.dispatchEvent(new Event("feedback-loops-updated"));
        }
      } catch { /* Calendar completion is saved even if feedback data cannot be updated. */ }
    }
  };
  const deleteTask = async (event: CalendarTask) => {
    if (!await dialogs.confirm({ title: "Delete task?", message: `Delete “${event.title}” from your calendar?`, confirmLabel: "Delete", destructive: true })) return;
    const next = events.filter((item) => item.id !== event.id);
    setEvents(next);
    saveTasks(next);
  };

  const toggleNeedAction = (object: string, action: NeedAction) => {
    const key = object.trim().toLocaleLowerCase();
    const next = { ...loops, [key]: { ...loops[key], actions: (loops[key]?.actions || []).map((item) => item.id === action.id ? { ...item, complete: !item.complete, completedDate: !item.complete ? today : undefined } : item) } };
    setLoops(next);
    try { localStorage.setItem(FEEDBACK_LOOPS_KEY, JSON.stringify(next)); window.dispatchEvent(new Event("feedback-loops-updated")); } catch { /* Keep this view usable if storage is unavailable. */ }
  };
  const objectGroups = objects.map((object) => {
    const key = object.trim().toLocaleLowerCase();
    return { object, key, actions: (loops[key]?.actions || []).filter((action) => action.name?.trim() || action.details?.trim()) };
  });
  const groupedEvents = (items: CalendarTask[]) => {
    const grouped = new Map<string, CalendarTask[]>();
    const unassigned: CalendarTask[] = [];
    items.forEach((event) => {
      const object = event.feedbackAction?.object?.trim();
      if (!object) { unassigned.push(event); return; }
      const key = object.toLocaleLowerCase();
      grouped.set(key, [...(grouped.get(key) || []), event]);
    });
    return { groups: Array.from(grouped, ([object, tasks]) => ({ object, tasks })).sort((a, b) => a.object.localeCompare(b.object)), unassigned };
  };
  const eventGroups = groupedEvents(visibleEvents);
  const trackerEvents = needsTab === "objects" ? events.filter((event) => event.feedbackAction?.object) : needsTab === "today" ? todayEvents : events;
  const trackerGroups = groupedEvents(trackerEvents);
  const doneCount = trackerEvents.reduce((sum, event) => sum + monthDays.filter((day) => { const key = dateKey(day); return occursOn(event, key) && event.completedDates?.includes(key); }).length, 0);
  const scheduledCount = trackerEvents.reduce((sum, event) => sum + monthDays.filter((day) => occursOn(event, dateKey(day))).length, 0);
  const toggleTrackerDay = (event: CalendarTask, day: string) => {
    const completedDates = new Set(event.completedDates || []);
    if (completedDates.has(day)) completedDates.delete(day); else completedDates.add(day);
    const next = events.map((item) => item.id === event.id ? { ...item, completedDates: Array.from(completedDates) } : item);
    setEvents(next); saveTasks(next);
  };

  const title = "Track Tasks";
  return <main className="home-page">
    <AppSidebar active="tracking" />
    <div className={`home-main tasks-main tasks-shell ${needsTab ? "needs-tracker-shell" : ""}`}>
      <aside className="tasks-nav"><nav aria-label="Task views">
        <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}><CalendarDays size={16} />Today<span>{activeEvents.length || ""}</span></button>
        <button className={view === "next" ? "active" : ""} onClick={() => setView("next")}><CalendarRange size={16} />Next 7 Days<span>{nextSeven.length || ""}</span></button>
        <button className={view === "inbox" ? "active" : ""} onClick={() => setView("inbox")}><Inbox size={16} />Inbox<span>{events.length || ""}</span></button>
      </nav><div className="tasks-nav-label">Lists <button aria-label="Add list" title="Add list">＋</button></div><button className={`tasks-list-link ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}><List size={16} />helow<span>{events.length}</span></button><div className="tasks-nav-label">Filters</div><div className="tasks-filter-hint">Display tasks filtered by list, date, priority, tag, and more</div><div className="tasks-nav-bottom"><button onClick={() => { setShowCompleted((value) => !value); setView("today"); }}><CheckSquare size={16} />Completed</button><Link href="/calendar"><CalendarDays size={16} />Calendar</Link></div></aside>
      <section className="tasks-center">
        <header className="tasks-topline"><h1><span>☰</span>{title}</h1><div><button aria-label="Previous month" onClick={() => setMonthOffset((value) => value - 1)}><ArrowLeft size={16} /></button><strong className="tracker-month-title">{monthLabel}</strong><button aria-label="Next month" onClick={() => setMonthOffset((value) => value + 1)}><ArrowRight size={16} /></button><Link href="/calendar" aria-label="Open calendar"><CalendarDays size={17} /></Link><button aria-label="Search tasks"><Search size={17} /></button><button aria-label="More options"><MoreHorizontal size={19} /></button></div></header>
        <div className="needs-tabs" role="tablist" aria-label="Track Tasks views">{(["all", "objects", "today"] as const).map((tab) => <button key={tab} role="tab" aria-selected={needsTab === tab} className={needsTab === tab ? "active" : ""} onClick={() => setNeedsTab(tab)}>{tab === "objects" ? "Objects" : tab === "today" ? "Today" : "All"}</button>)}</div>
        <section className="tracker-summary"><div className="tracker-progress"><strong>{scheduledCount ? Math.round(doneCount / scheduledCount * 100) : 0}%</strong></div><div><span>Total completed: <b>{doneCount}</b></span><span>Total scheduled: <b>{scheduledCount}</b></span></div><div className="tracker-chart" aria-label="Monthly scheduled and completed chart">{monthDays.map((day) => { const count = trackerEvents.filter((event) => occursOn(event, dateKey(day))).length; const completed = trackerEvents.filter((event) => occursOn(event, dateKey(day)) && event.completedDates?.includes(dateKey(day))).length; return <span key={dateKey(day)} title={`${dateKey(day)}: ${completed}/${count}`}><i style={{ height: `${count ? Math.max(4, completed / count * 45) : 3}px` }} /></span>; })}</div><div className="tracker-donut"><i>{doneCount}</i></div></section>
        <div className="tasks-view-list needs-list">
          <div className="tracker-grid-scroll"><table className="tracker-grid"><thead><tr><th className="tracker-name-col">Track Tasks <span>›</span></th>{monthDays.map((day) => <th key={dateKey(day)} className={dateKey(day) === today ? "is-today" : ""}>{day.getDate()}</th>)}<th className="tracker-total-col">Total hrs</th></tr></thead><tbody>
            {trackerGroups.groups.flatMap(({ object, tasks }) => [<tr className="tracker-group-row" key={`group-${object}`}><th colSpan={monthDays.length + 2}>{object.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())}</th></tr>, ...tasks.map((event) => <tr className="tracker-task-row" key={event.id}><th className="tracker-name-col"><button type="button" className="tracker-task-check" aria-label={`Open ${event.title}`} onClick={() => setSelectedId(event.id)}><Check size={12}/></button><span title={event.title}>{event.title}</span></th>{monthDays.map((day) => { const key = dateKey(day); const scheduled = occursOn(event, key); const complete = event.completedDates?.includes(key); return <td key={key}><button type="button" className={`tracker-cell ${complete ? "is-complete" : ""}`} disabled={!scheduled} onClick={() => toggleTrackerDay(event, key)} aria-label={`${event.title}, ${key}${scheduled ? complete ? ", completed" : ", not completed" : ", not scheduled"}`} /></td>; })}<td className="tracker-total">{event.time && event.endTime ? "—" : "0.0"}</td></tr>)])}
            {trackerGroups.unassigned.length > 0 && <tr className="tracker-group-row" key="group-unassigned"><th colSpan={monthDays.length + 2}>Unassigned</th></tr>}
            {trackerGroups.unassigned.map((event) => <tr className="tracker-task-row" key={event.id}><th className="tracker-name-col"><button type="button" className="tracker-task-check" aria-label={`Open ${event.title}`} onClick={() => setSelectedId(event.id)}><Check size={12}/></button><span title={event.title}>{event.title}</span></th>{monthDays.map((day) => { const key = dateKey(day); const scheduled = occursOn(event, key); const complete = event.completedDates?.includes(key); return <td key={key}><button type="button" className={`tracker-cell ${complete ? "is-complete" : ""}`} disabled={!scheduled} onClick={() => toggleTrackerDay(event, key)} aria-label={`${event.title}, ${key}${scheduled ? complete ? ", completed" : ", not completed" : ", not scheduled"}`} /></td>; })}<td className="tracker-total">0.0</td></tr>)}
            {trackerEvents.length === 0 && <tr><td colSpan={monthDays.length + 2} className="tracker-empty">{needsTab === "objects" ? "No object tasks yet. Link a calendar task to a feedback action to track it here." : needsTab === "today" ? "No tasks scheduled today." : "No tasks scheduled this month."}</td></tr>}
          </tbody></table></div>
        </div>
        <p className="tasks-sync-note"><Repeat2 size={13} /> Calendar tasks sync automatically.</p>
      </section>
    </div>
  </main>;
}

function TaskRow({ event, today, onToggle, onDelete, selected, onSelect }: { event: CalendarTask; today: string; onToggle: (event: CalendarTask) => void; onDelete: (event: CalendarTask) => void; selected?: boolean; onSelect?: () => void }) {
  const isComplete = event.completedDates?.includes(today) || false;
  return <article onClick={onSelect} className={`today-task-row ${isComplete ? "is-complete" : ""} ${selected ? "is-selected" : ""}`}>
    <button type="button" className="today-task-check" onClick={() => onToggle(event)} aria-label={isComplete ? `Mark ${event.title} incomplete` : `Mark ${event.title} complete`}>{isComplete && <Check size={14} />}</button>
    <div className="today-task-copy"><strong>{event.title}</strong>{event.note && <small>{event.note}</small>}<small className="today-task-details">{[event.feedbackAction?.object && `Feedback loop · ${event.feedbackAction.object}`, taskSchedule(event)].filter(Boolean).join(" · ")}</small></div>
    <span className="today-task-time"><Clock3 size={13} />{taskTimeRange(event)}</span>
    <button type="button" className="today-task-delete" onClick={() => onDelete(event)} aria-label={`Delete ${event.title}`} title="Delete task"><Trash2 size={14} /></button>
  </article>;
}
