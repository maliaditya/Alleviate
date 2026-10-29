"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type DragEvent } from "react";
import { CalendarDays, Check, ChevronDown, Trash2 } from "lucide-react";

const STORAGE_KEY = "alleviate-eisenhower-tasks-v1";
const CALENDAR_KEY = "alleviate-calendar-events-v1";
const SCHEDULED_QUADRANTS_KEY = "alleviate-eisenhower-calendar-quadrants-v1";
type QuadrantId = "do" | "schedule" | "delegate" | "eliminate";
type MatrixTask = { id: string; title: string; quadrant: QuadrantId; dueDate?: string; done: boolean; createdAt: number };
type CalendarTask = { id: string; title: string; date: string; repeat?: { interval: number; unit: "day"; until?: string; skipWeekdays?: number[] }; completedDates?: string[] };
const QUADRANTS: Array<{ id: QuadrantId; roman: string; title: string; hint: string; color: string }> = [
  { id: "do", roman: "I", title: "Urgent & Important", hint: "Do first", color: "#fb596b" },
  { id: "schedule", roman: "II", title: "Not Urgent & Important", hint: "Schedule", color: "#f5ae18" },
  { id: "delegate", roman: "III", title: "Urgent & Unimportant", hint: "Delegate", color: "#4779ff" },
  { id: "eliminate", roman: "IV", title: "Not Urgent & Unimportant", hint: "Consider removing", color: "#32c9a6" },
];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const localDate = (value: string) => new Date(`${value}T12:00:00`);
function readCalendarTasks(): CalendarTask[] {
  try {
    const saved = JSON.parse(localStorage.getItem(CALENDAR_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((task) => task && typeof task.id === "string" && typeof task.title === "string" && typeof task.date === "string") : [];
  } catch { return []; }
}
function occursToday(task: CalendarTask, today: string) {
  if (today < task.date || (task.repeat?.until && today > task.repeat.until)) return false;
  if (task.repeat?.skipWeekdays?.includes(localDate(today).getDay())) return false;
  if (!task.repeat) return today === task.date;
  const daysApart = Math.round((localDate(today).getTime() - localDate(task.date).getTime()) / 86400000);
  return daysApart >= 0 && daysApart % Math.max(1, task.repeat.interval || 1) === 0;
}

function readTasks(): MatrixTask[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((task) => task && typeof task.id === "string" && typeof task.title === "string" && QUADRANTS.some((quadrant) => quadrant.id === task.quadrant)).map((task) => ({ ...task, done: Boolean(task.done), createdAt: Number(task.createdAt) || Date.now() })) : [];
  } catch { return []; }
}
function readScheduledQuadrants(): Record<string, QuadrantId> {
  try {
    const saved = JSON.parse(localStorage.getItem(SCHEDULED_QUADRANTS_KEY) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, QuadrantId] => typeof entry[0] === "string" && QUADRANTS.some((quadrant) => quadrant.id === entry[1])))
      : {};
  } catch { return {}; }
}

export default function EisenhowerPage() {
  const [tasks, setTasks] = useState<MatrixTask[]>([]);
  const [calendarTasks, setCalendarTasks] = useState<CalendarTask[]>([]);
  const [scheduledQuadrants, setScheduledQuadrants] = useState<Record<string, QuadrantId>>({});
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState<Record<QuadrantId, boolean>>({ do: true, schedule: true, delegate: true, eliminate: true });
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => { setTasks(readTasks()); setScheduledQuadrants(readScheduledQuadrants()); setReady(true); }, []);
  useEffect(() => {
    const refresh = () => setCalendarTasks(readCalendarTasks());
    refresh();
    window.addEventListener("calendar-events-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("calendar-events-updated", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch { /* Keep the current session usable if storage is unavailable. */ }
  }, [ready, tasks]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(SCHEDULED_QUADRANTS_KEY, JSON.stringify(scheduledQuadrants)); window.dispatchEvent(new Event("eisenhower-quadrants-updated")); } catch { /* Keep assignments for this session if storage is unavailable. */ }
  }, [ready, scheduledQuadrants]);

  const toggleTask = (id: string) => setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task));
  const toggleScheduledTask = (id: string) => {
    const eventId = id.slice("calendar:".length);
    const today = dateKey(new Date());
    const next = calendarTasks.map((task) => {
      if (task.id !== eventId) return task;
      const completedDates = new Set(task.completedDates || []);
      if (completedDates.has(today)) completedDates.delete(today); else completedDates.add(today);
      return { ...task, completedDates: Array.from(completedDates) };
    });
    setCalendarTasks(next);
    try { localStorage.setItem(CALENDAR_KEY, JSON.stringify(next)); window.dispatchEvent(new Event("calendar-events-updated")); } catch { /* Keep the matrix usable if calendar storage is unavailable. */ }
  };
  const deleteTask = (id: string) => setTasks((current) => current.filter((task) => task.id !== id));
  const moveTask = useCallback((id: string, quadrant: QuadrantId) => {
    if (id.startsWith("calendar:")) {
      const eventId = id.slice("calendar:".length);
      setScheduledQuadrants((current) => {
        const next = { ...current };
        // Calendar task IDs identify the recurring series, so the most recent
        // quadrant follows that task into each future occurrence.
        next[eventId] = quadrant;
        return next;
      });
    } else setTasks((current) => current.map((task) => task.id === id ? { ...task, quadrant } : task));
  }, []);
  const onDrop = (quadrant: QuadrantId, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggedId;
    if (id) moveTask(id, quadrant);
    setDraggedId(null);
  };
  const today = dateKey(new Date());
  const scheduledToday = calendarTasks.filter((task) => occursToday(task, today)).map((task): MatrixTask => ({ id: `calendar:${task.id}`, title: task.title, quadrant: scheduledQuadrants[task.id] ?? "eliminate", done: task.completedDates?.includes(today) || false, createdAt: 0 }));
  const allTasks = [...tasks, ...scheduledToday];
  return <main className="matrix-page">
    <div className="matrix-main">
      <section className="matrix-content">
        <div className="matrix-grid">
          {QUADRANTS.map((quadrant) => {
            const quadrantTasks = allTasks.filter((task) => task.quadrant === quadrant.id).sort((a, b) => Number(a.done) - Number(b.done) || (quadrant.id === "eliminate" ? Number(b.id.startsWith("calendar:")) - Number(a.id.startsWith("calendar:")) : 0) || b.createdAt - a.createdAt);
            const count = allTasks.filter((task) => task.quadrant === quadrant.id).length;
            const isTodayScheduleQuadrant = quadrant.id === "eliminate";
            const isExpanded = expanded[quadrant.id];
            return <section key={quadrant.id} className={`matrix-quadrant matrix-quadrant-${quadrant.id} ${draggedId ? "can-drop" : ""}`} style={{ "--quadrant-accent": quadrant.color } as React.CSSProperties} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(quadrant.id, event)}>
              <header className="matrix-quadrant-heading"><span className="matrix-quadrant-roman">{quadrant.roman}</span><div><h2>{quadrant.title}</h2><small>{quadrant.hint}</small></div><span className="matrix-quadrant-count">{count}</span><button type="button" className="matrix-collapse" aria-label={`${isExpanded ? "Collapse" : "Expand"} ${quadrant.title}`} onClick={() => setExpanded((current) => ({ ...current, [quadrant.id]: !current[quadrant.id] }))}><ChevronDown size={17} className={isExpanded ? "" : "is-collapsed"} /></button></header>
              {isExpanded && <>
                {isTodayScheduleQuadrant && <div className="matrix-today-label"><CalendarDays size={13} />Today's scheduled tasks</div>}
                <div className="matrix-task-list">{quadrantTasks.map((task) => <article key={task.id} draggable onDragStart={(event) => { setDraggedId(task.id); event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedId(null)} className={`matrix-task ${task.done ? "is-done" : ""} ${task.id.startsWith("calendar:") ? "is-scheduled" : ""} ${draggedId === task.id ? "is-dragging" : ""}`}>
                  <button type="button" className="matrix-task-check" aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={() => task.id.startsWith("calendar:") ? toggleScheduledTask(task.id) : toggleTask(task.id)}>{task.done && <Check size={13} />}</button>
                  <span className="matrix-task-title">{task.title}</span>
                  {task.dueDate && <span className="matrix-task-date"><CalendarDays size={12} />{task.dueDate}</span>}
                  {!task.id.startsWith("calendar:") && <button type="button" className="matrix-task-delete" aria-label={`Delete ${task.title}`} onClick={() => deleteTask(task.id)}><Trash2 size={14} /></button>}
                </article>)}</div>
                {!quadrantTasks.length && <p className="matrix-empty">{isTodayScheduleQuadrant ? "No tasks scheduled for today." : "Drop a task here."}</p>}
              </>}
            </section>;
          })}
        </div>
      </section>
    </div>
  </main>;
}
