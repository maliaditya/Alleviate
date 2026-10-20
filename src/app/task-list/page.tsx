"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { CalendarDays, CalendarPlus, Check, CalendarRange, ChevronDown, ChevronRight, FolderPlus, GitBranch, Inbox, List, Pencil, Plus, Trash2, UserRound, Wrench, X } from "lucide-react";
import AppSidebar from "../AppSidebar";
import { useAppDialogs } from "../AppDialogs";
import FeedbackLoopCard, { EMPTY_LOOP, type Loop } from "../feedback-loop/FeedbackLoopCard";

const EVENTS_KEY = "alleviate-calendar-events-v1";
const OBJECTS_KEY = "alleviate-resources-default-objects";
const LEGACY_OBJECTS_KEY = "alleviate-wisemapping-objects-v1";
const OBJECT_IDS_KEY = "alleviate-resources-default-object-ids";
const OBJECT_XML_KEY = "alleviate-resources-default-xml";
const LOOPS_KEY = "alleviate-feedback-loops-v1";
const MATRIX_QUADRANTS_KEY = "alleviate-eisenhower-calendar-quadrants-v1";
const QUADRANT_COLORS: Record<string, string> = { do: "#fb596b", schedule: "#f5ae18", delegate: "#4779ff", eliminate: "#32c9a6" };
type Task = { id: string; title: string; date: string; time?: string; endTime?: string; note?: string; color?: number; repeat?: { interval: number; unit: "day"; until?: string; skipWeekdays?: number[] }; completedDates?: string[]; feedbackAction?: { object: string; actionId: string } };
type LinkedAction = Loop["actions"][number];
type TaskView = "today" | "next" | "inbox" | "list";
type ObjectTopic = { id: string; text: string; isObject: boolean; children: ObjectTopic[] };
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const localDate = (value: string) => new Date(`${value}T12:00:00`);
function occursOn(task: Task, day: string) {
  if (day < task.date || (task.repeat?.until && day > task.repeat.until)) return false;
  if (task.repeat?.skipWeekdays?.includes(localDate(day).getDay())) return false;
  if (!task.repeat) return day === task.date;
  const daysApart = Math.round((localDate(day).getTime() - localDate(task.date).getTime()) / 86400000);
  return daysApart >= 0 && daysApart % Math.max(1, task.repeat.interval || 1) === 0;
}
function scheduleFrequency(task: Task) {
  if (!task.repeat) return "Once";
  const interval = Math.max(1, task.repeat.interval || 1);
  const frequency = interval === 1 ? "Every day" : `Every ${interval} days`;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const skipped = (task.repeat.skipWeekdays || []).map((day) => weekdays[day]).filter(Boolean);
  return skipped.length ? `${frequency} · skips ${skipped.join(", ")}` : frequency;
}
function readObjectHierarchy(objects: string[]): ObjectTopic[] {
  const names = new Set(objects.map((name) => name.trim().toLocaleLowerCase()));
  try {
    const xml = localStorage.getItem("alleviate-resources-default-xml");
    if (xml) {
      const parsedIds = JSON.parse(localStorage.getItem("alleviate-resources-default-object-ids") || "{}");
      const objectIds = new Set(parsedIds && typeof parsedIds === "object" && !Array.isArray(parsedIds) ? Object.values(parsedIds).filter((id): id is string => typeof id === "string") : []);
      const document = new DOMParser().parseFromString(xml, "text/xml");
      if (!document.querySelector("parsererror")) {
        const root = Array.from(document.querySelectorAll("topic")).find((topic) => topic.getAttribute("central") === "true") || document.querySelector("topic");
        if (root) {
          const parse = (element: Element): ObjectTopic | null => {
            const text = element.getAttribute("text")?.trim() || "";
            const id = element.getAttribute("id") || text;
            if (!text || text.toLocaleLowerCase() === "untitled") return null;
            return { id, text, isObject: objectIds.size ? objectIds.has(id) : names.has(text.toLocaleLowerCase()), children: Array.from(element.children).filter((child) => child.tagName.toLocaleLowerCase() === "topic" && !child.hasAttribute("feedback-action-id")).map(parse).filter((child): child is ObjectTopic => child !== null) };
          };
          const rootTopic = parse(root);
          return rootTopic ? [rootTopic] : [];
        }
      }
    }
  } catch { /* Use the standard hierarchy if the saved mind map is unavailable. */ }
  const fallbacks: Array<[string, string[]]> = [["Personal Wellbeing", ["Body", "Mind"]], ["Value Creation", ["Job", "Freelancing"]], ["Relations", ["Heart"]], ["Resources", ["House", "Land", "Bike", "Car"]]];
  const included = new Set<string>();
  const tree = fallbacks.map(([text, children]) => ({ id: text, text, isObject: false, children: children.filter((name) => names.has(name.toLocaleLowerCase())).map((name) => { included.add(name.toLocaleLowerCase()); return { id: name, text: name, isObject: true, children: [] }; }) })).filter((topic) => topic.children.length);
  const extras = objects.filter((name) => !included.has(name.toLocaleLowerCase())).map((name) => ({ id: name, text: name, isObject: true, children: [] }));
  return [{ id: "1", text: "You", isObject: false, children: [...tree, ...extras] }];
}
function readTasks(): Task[] {
  try { const stored = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]"); return Array.isArray(stored) ? stored.filter((task) => task && typeof task.id === "string" && typeof task.title === "string" && typeof task.date === "string") : []; }
  catch { return []; }
}
function saveTasks(tasks: Task[]) {
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(tasks)); window.dispatchEvent(new Event("calendar-events-updated")); } catch { /* Storage is optional for this session. */ }
}

export default function TaskListPage() {
  const dialogs = useAppDialogs();
  const today = dateKey(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<TaskView>("today");
  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<{ object: string; action: LinkedAction } | null>(null);
  const [factorPickerActionId, setFactorPickerActionId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [objects, setObjects] = useState<string[]>([]);
  const [objectHierarchy, setObjectHierarchy] = useState<ObjectTopic[]>([]);
  const [objectView, setObjectView] = useState<"list" | "hierarchy">("list");
  const [collapsedTopics, setCollapsedTopics] = useState<Set<string>>(new Set());
  const [loops, setLoops] = useState<Record<string, Loop>>({});
  const [scheduledQuadrants, setScheduledQuadrants] = useState<Record<string, string>>({});
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [hierarchyContextMenu, setHierarchyContextMenu] = useState<{ topic: ObjectTopic; x: number; y: number } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{ title: string; note: string; feedbackAction?: { object: string; actionId: string }; existingId?: string } | null>(null);
  const [scheduleDate, setScheduleDate] = useState(today);
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("10:00");
  const [scheduleRepeat, setScheduleRepeat] = useState<"none" | "daily" | "custom">("none");
  const [scheduleInterval, setScheduleInterval] = useState(2);
  const [scheduleUntil, setScheduleUntil] = useState("");
  const [scheduleSkipWeekdays, setScheduleSkipWeekdays] = useState<number[]>([]);
  const [scheduleExceptOpen, setScheduleExceptOpen] = useState(false);
  useEffect(() => {
    const refresh = () => setTasks(readTasks());
    const refreshQuadrants = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(MATRIX_QUADRANTS_KEY) || "{}");
        setScheduledQuadrants(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {});
      } catch { setScheduledQuadrants({}); }
    };
    const refreshLists = () => {
      try {
        const rawObjects = localStorage.getItem(OBJECTS_KEY) ?? localStorage.getItem(LEGACY_OBJECTS_KEY);
        const parsedObjects = rawObjects ? JSON.parse(rawObjects) : [];
        const nextObjects = Array.isArray(parsedObjects) ? Array.from(new Set(parsedObjects.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map((name) => name.trim()))) : [];
        setObjects(nextObjects);
        setObjectHierarchy(readObjectHierarchy(nextObjects));
      } catch { setObjects([]); }
      try {
        const saved = JSON.parse(localStorage.getItem(LOOPS_KEY) || "{}");
        setLoops(saved && typeof saved === "object" && !Array.isArray(saved)
          ? Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, { ...EMPTY_LOOP, ...(value as Partial<Loop>), readings: (value as Partial<Loop>).readings || [], versions: (value as Partial<Loop>).versions || [], inputs: (value as Partial<Loop>).inputs || [], actions: (value as Partial<Loop>).actions || [] }]))
          : {});
      }
      catch { setLoops({}); }
    };
    refresh();
    refreshQuadrants();
    refreshLists();
    window.addEventListener("storage", refresh);
    window.addEventListener("calendar-events-updated", refresh);
    window.addEventListener("storage", refreshLists);
    window.addEventListener("feedback-loops-updated", refreshLists);
    window.addEventListener("resources-mindmap-updated", refreshLists);
    window.addEventListener("eisenhower-quadrants-updated", refreshQuadrants);
    window.addEventListener("storage", refreshQuadrants);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("calendar-events-updated", refresh); window.removeEventListener("storage", refreshLists); window.removeEventListener("feedback-loops-updated", refreshLists); window.removeEventListener("resources-mindmap-updated", refreshLists); window.removeEventListener("eisenhower-quadrants-updated", refreshQuadrants); window.removeEventListener("storage", refreshQuadrants); };
  }, []);
  useEffect(() => {
    if (!hierarchyContextMenu) return;
    const close = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".tasks-hierarchy-context-menu")) setHierarchyContextMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setHierarchyContextMenu(null); };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", onKeyDown); };
  }, [hierarchyContextMenu]);
  const todayTasks = useMemo(() => tasks.filter((task) => occursOn(task, today)).sort((a, b) => (a.time || "").localeCompare(b.time || "") || a.title.localeCompare(b.title)), [tasks, today]);
  const nextTasks = useMemo(() => tasks.filter((task) => Array.from({ length: 7 }, (_, index) => dateKey(new Date(localDate(today).getTime() + index * 86400000))).some((day) => occursOn(task, day))), [tasks, today]);
  const visible = (view === "today" ? todayTasks : view === "next" ? nextTasks : tasks).filter((task) => showCompleted || !task.completedDates?.includes(today));
  const selected = visible.find((task) => task.id === selectedId) || visible[0];
  const taskCheckboxStyle = (taskId?: string): CSSProperties => ({ "--task-quadrant-color": QUADRANT_COLORS[taskId ? scheduledQuadrants[taskId] || "eliminate" : "eliminate"] || QUADRANT_COLORS.eliminate } as CSSProperties);
  const promoteTopicToObject = (name: string) => {
    const findTopic = (topics: ObjectTopic[]): ObjectTopic | undefined => {
      for (const topic of topics) {
        if (topic.text.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()) return topic;
        const child = findTopic(topic.children);
        if (child) return child;
      }
      return undefined;
    };
    const topic = findTopic(objectHierarchy);
    // Keep the central “You” node as the map root; every other selected hierarchy
    // node becomes an object once it has an action.
    if (!topic || topic.id === objectHierarchy[0]?.id || topic.isObject) return;
    const nextObjects = objects.some((object) => object.trim().toLocaleLowerCase() === topic.text.trim().toLocaleLowerCase()) ? objects : [...objects, topic.text];
    try {
      const rawIds = JSON.parse(localStorage.getItem(OBJECT_IDS_KEY) || "{}");
      const objectIds: Record<string, string> = rawIds && typeof rawIds === "object" && !Array.isArray(rawIds) ? rawIds : {};
      objectIds[topic.text.trim().toLocaleLowerCase()] = topic.id;
      const xml = localStorage.getItem(OBJECT_XML_KEY);
      if (xml) {
        const document = new DOMParser().parseFromString(xml, "text/xml");
        const node = Array.from(document.querySelectorAll("topic")).find((item) => item.getAttribute("id") === topic.id);
        if (node && !document.querySelector("parsererror")) {
          node.setAttribute("shape", "rounded rectangle");
          localStorage.setItem(OBJECT_XML_KEY, new XMLSerializer().serializeToString(document));
        }
      }
      localStorage.setItem(OBJECT_IDS_KEY, JSON.stringify(objectIds));
      localStorage.setItem(OBJECTS_KEY, JSON.stringify(nextObjects));
      localStorage.setItem(LEGACY_OBJECTS_KEY, JSON.stringify(nextObjects));
    } catch { /* Keep adding actions usable when browser storage is unavailable. */ }
    setObjects(nextObjects);
    setObjectHierarchy(readObjectHierarchy(nextObjects));
    window.dispatchEvent(new Event("resources-mindmap-updated"));
  };
  const addTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const title = draft.trim(); if (!title) return;
    if (selectedObject) {
      promoteTopicToObject(selectedObject);
      const key = selectedObject.trim().toLocaleLowerCase();
      const next = { ...loops, [key]: { ...loops[key], actions: [...(loops[key]?.actions || []), { id: crypto.randomUUID(), name: title, details: "", inputId: "", complete: false }] } };
      setLoops(next);
      try { localStorage.setItem(LOOPS_KEY, JSON.stringify(next)); window.dispatchEvent(new Event("feedback-loops-updated")); } catch { /* Keep the action list usable if storage is unavailable. */ }
      setDraft("");
      return;
    }
    const next = [{ id: crypto.randomUUID(), title, date: today }, ...tasks]; setTasks(next); saveTasks(next); setDraft("");
  };
  const toggle = (task: Task) => {
    const dates = new Set(task.completedDates || []); if (dates.has(today)) dates.delete(today); else dates.add(today);
    const next = tasks.map((item) => item.id === task.id ? { ...item, completedDates: Array.from(dates) } : item); setTasks(next); saveTasks(next);
  };
  const remove = (task: Task) => {
    const next = tasks.filter((item) => item.id !== task.id); setTasks(next); saveTasks(next);
  };
  const toggleAction = (object: string, action: LinkedAction) => {
    const key = object.trim().toLocaleLowerCase();
    const complete = !action.complete;
    const next = { ...loops, [key]: { ...loops[key], actions: (loops[key]?.actions || []).map((item) => item.id === action.id ? { ...item, complete, completedDate: complete ? today : undefined } : item) } };
    setLoops(next);
    try { localStorage.setItem(LOOPS_KEY, JSON.stringify(next)); window.dispatchEvent(new Event("feedback-loops-updated")); } catch { /* Keep the action list usable if storage is unavailable. */ }
  };
  const updateActionFactor = (object: string, actionId: string, inputId: string) => {
    const key = object.trim().toLocaleLowerCase();
    const next = { ...loops, [key]: { ...EMPTY_LOOP, ...loops[key], actions: (loops[key]?.actions || []).map((action) => action.id === actionId ? { ...action, inputId } : action) } };
    setLoops(next);
    try { localStorage.setItem(LOOPS_KEY, JSON.stringify(next)); window.dispatchEvent(new Event("feedback-loops-updated")); } catch { /* Keep the action list usable if storage is unavailable. */ }
  };
  const openSchedule = (target: { title: string; note?: string; feedbackAction?: { object: string; actionId: string }; existing?: Task }) => {
    setScheduleTarget({ title: target.title, note: target.note || "", feedbackAction: target.feedbackAction, existingId: target.existing?.id });
    setScheduleDate(target.existing?.date || today);
    setScheduleStart(target.existing?.time || "09:00");
    setScheduleEnd(target.existing?.endTime || "10:00");
    setScheduleRepeat(target.existing?.repeat ? (target.existing.repeat.interval === 1 ? "daily" : "custom") : "none");
    setScheduleInterval(target.existing?.repeat?.interval || 2);
    setScheduleUntil(target.existing?.repeat?.until || "");
    setScheduleSkipWeekdays(target.existing?.repeat?.skipWeekdays || []);
    setScheduleExceptOpen(false);
  };
  const saveSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scheduleTarget) return;
    const repeat = scheduleRepeat === "none" ? undefined : { interval: scheduleRepeat === "daily" ? 1 : Math.max(1, Math.min(365, scheduleInterval)), unit: "day" as const, ...(scheduleSkipWeekdays.length ? { skipWeekdays: scheduleSkipWeekdays } : {}), ...(scheduleUntil >= scheduleDate ? { until: scheduleUntil } : {}) };
    const existing = scheduleTarget.existingId ? tasks.find((task) => task.id === scheduleTarget.existingId) : undefined;
    const scheduled: Task = { id: existing?.id || crypto.randomUUID(), title: scheduleTarget.title, date: scheduleDate, time: scheduleStart, endTime: scheduleEnd, note: scheduleTarget.note, color: existing?.color, repeat, feedbackAction: scheduleTarget.feedbackAction, completedDates: existing?.completedDates || [] };
    const next = existing ? tasks.map((task) => task.id === existing.id ? scheduled : task) : [...tasks, scheduled];
    setTasks(next);
    saveTasks(next);
    setScheduleExceptOpen(false);
    setScheduleTarget(null);
  };
  const updateObjectLoop = (object: string, patch: Partial<Loop>) => {
    const key = object.trim().toLocaleLowerCase();
    const next = { ...loops, [key]: { ...EMPTY_LOOP, ...loops[key], ...patch } };
    setLoops(next);
    try { localStorage.setItem(LOOPS_KEY, JSON.stringify(next)); window.dispatchEvent(new Event("feedback-loops-updated")); } catch { /* Keep the feedback loop usable if storage is unavailable. */ }
  };
  const renameHierarchyTopic = async (topic: ObjectTopic) => {
    setHierarchyContextMenu(null);
    const name = (await dialogs.prompt({ title: "Rename node", message: "Enter a new name for this node", defaultValue: topic.text, confirmLabel: "Save" }))?.trim();
    if (!name || name === topic.text) return;
    const oldKey = topic.text.trim().toLocaleLowerCase();
    const newKey = name.toLocaleLowerCase();
    const findTopic = (topics: ObjectTopic[]): ObjectTopic | undefined => {
      for (const item of topics) { if (item.text.trim().toLocaleLowerCase() === newKey) return item; const nested = findTopic(item.children); if (nested) return nested; }
      return undefined;
    };
    if (findTopic(objectHierarchy)) {
      await dialogs.alert({ title: "Node already exists", message: `“${name}” already exists in this hierarchy.` });
      return;
    }
    const isListedObject = objects.some((object) => object.trim().toLocaleLowerCase() === oldKey);
    const nextObjects = isListedObject ? objects.map((object) => object.trim().toLocaleLowerCase() === oldKey ? name : object) : objects;
    try {
      const xml = localStorage.getItem(OBJECT_XML_KEY);
      if (xml) {
        const document = new DOMParser().parseFromString(xml, "text/xml");
        const node = Array.from(document.querySelectorAll("topic")).find((item) => item.getAttribute("id") === topic.id);
        if (node && !document.querySelector("parsererror")) {
          node.setAttribute("text", name);
          localStorage.setItem(OBJECT_XML_KEY, new XMLSerializer().serializeToString(document));
        }
      }
      const rawIds = JSON.parse(localStorage.getItem(OBJECT_IDS_KEY) || "{}");
      const ids: Record<string, string> = rawIds && typeof rawIds === "object" && !Array.isArray(rawIds) ? rawIds : {};
      if (ids[oldKey] === topic.id || topic.isObject) { delete ids[oldKey]; ids[newKey] = topic.id; }
      localStorage.setItem(OBJECT_IDS_KEY, JSON.stringify(ids));
      if (isListedObject) {
        localStorage.setItem(OBJECTS_KEY, JSON.stringify(nextObjects));
        localStorage.setItem(LEGACY_OBJECTS_KEY, JSON.stringify(nextObjects));
      }
    } catch { /* Keep the hierarchy usable for this session if storage is unavailable. */ }
    const nextLoops = { ...loops };
    if (oldKey !== newKey && nextLoops[oldKey]) {
      nextLoops[newKey] = { ...EMPTY_LOOP, ...nextLoops[newKey], ...nextLoops[oldKey] };
      delete nextLoops[oldKey];
      setLoops(nextLoops);
      try { localStorage.setItem(LOOPS_KEY, JSON.stringify(nextLoops)); window.dispatchEvent(new Event("feedback-loops-updated")); } catch { /* Keep current actions in memory. */ }
    }
    setObjects(nextObjects);
    setObjectHierarchy(readObjectHierarchy(nextObjects));
    setSelectedObject((current) => current?.trim().toLocaleLowerCase() === oldKey ? name : current);
    window.dispatchEvent(new Event("resources-mindmap-updated"));
  };
  const addObjectUnder = async (parent: ObjectTopic) => {
    const name = (await dialogs.prompt({ title: "Add object", message: `Add an object under ${parent.text}`, confirmLabel: "Add" }))?.trim();
    if (!name) return;
    if (objects.some((object) => object.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      await dialogs.alert({ title: "Object already exists", message: `“${name}” already exists in your object list.` });
      return;
    }
    const nextObjects = [...objects, name];
    try {
      const idMapValue = JSON.parse(localStorage.getItem(OBJECT_IDS_KEY) || "{}");
      const objectIds: Record<string, string> = idMapValue && typeof idMapValue === "object" && !Array.isArray(idMapValue) ? idMapValue : {};
      const parser = new DOMParser();
      let document = parser.parseFromString(localStorage.getItem(OBJECT_XML_KEY) || "", "text/xml");
      let root = Array.from(document.querySelectorAll("topic")).find((topic) => topic.getAttribute("central") === "true") || document.querySelector("topic");
      if (document.querySelector("parsererror") || !root) {
        document = parser.parseFromString('<map version="tango" theme="prism"><topic central="true" id="1" text="You"/></map>', "text/xml");
        root = document.querySelector("topic");
        let nextId = 2;
        const addTopics = (parentElement: Element, topics: ObjectTopic[]) => topics.forEach((topic) => {
          const node = document.createElement("topic");
          node.setAttribute("id", String(nextId++));
          node.setAttribute("order", String(Array.from(parentElement.children).filter((child) => child.tagName.toLocaleLowerCase() === "topic").length));
          node.setAttribute("text", topic.text);
          if (topic.isObject) {
            node.setAttribute("shape", "rounded rectangle");
            objectIds[topic.text.trim().toLocaleLowerCase()] = node.getAttribute("id") || "";
          }
          parentElement.appendChild(node);
          addTopics(node, topic.children);
        });
        if (root) addTopics(root, objectHierarchy[0]?.text === "You" ? objectHierarchy[0].children : objectHierarchy);
      }
      if (root) {
        const parentNode = Array.from(document.querySelectorAll("topic")).find((topic) => topic.getAttribute("id") === parent.id)
          || Array.from(document.querySelectorAll("topic")).find((topic) => topic.getAttribute("text")?.trim() === parent.text);
        if (parentNode) {
          const nextId = Array.from(document.querySelectorAll("topic")).reduce((max, topic) => Math.max(max, Number(topic.getAttribute("id")) || 0), 0) + 1;
          const child = document.createElement("topic");
          child.setAttribute("id", String(nextId));
          child.setAttribute("order", String(Array.from(parentNode.children).filter((item) => item.tagName.toLocaleLowerCase() === "topic").length));
          child.setAttribute("shape", "rounded rectangle");
          child.setAttribute("text", name);
          parentNode.appendChild(child);
          objectIds[name.toLocaleLowerCase()] = String(nextId);
        }
      }
      localStorage.setItem(OBJECT_IDS_KEY, JSON.stringify(objectIds));
      localStorage.setItem(OBJECT_XML_KEY, new XMLSerializer().serializeToString(document));
      localStorage.setItem(OBJECTS_KEY, JSON.stringify(nextObjects));
      localStorage.setItem(LEGACY_OBJECTS_KEY, JSON.stringify(nextObjects));
    } catch { /* Keep the hierarchy available in this session if browser storage is unavailable. */ }
    setObjects(nextObjects);
    setObjectHierarchy(readObjectHierarchy(nextObjects));
    setSelectedObject(name);
    setSelectedAction(null);
    window.dispatchEvent(new Event("resources-mindmap-updated"));
  };
  const objectActions = selectedObject ? (loops[selectedObject.trim().toLocaleLowerCase()]?.actions || []).filter((action) => Boolean(action.name?.trim() || action.details?.trim())) : [];
  const selectedActionSchedule = selectedAction ? [...tasks].reverse().find((task) => task.feedbackAction?.object.trim().toLocaleLowerCase() === selectedAction.object.trim().toLocaleLowerCase() && task.feedbackAction.actionId === selectedAction.action.id) : undefined;
  const taskActionNames = new Set(Object.values(loops).flatMap((loop) => loop.actions.map((action) => action.name?.trim().toLocaleLowerCase()).filter((value): value is string => Boolean(value))));
  const renderObjectTopics = (topics: ObjectTopic[], depth = 0): ReactNode => topics.filter((topic) => !taskActionNames.has(topic.text.trim().toLocaleLowerCase())).map((topic) => {
    const key = topic.text.trim().toLocaleLowerCase();
    const actionCount = (loops[key]?.actions || []).filter((action) => Boolean(action.name?.trim() || action.details?.trim())).length;
    const hasChildren = topic.children.length > 0;
    const isCollapsed = collapsedTopics.has(topic.id);
    const toggleCollapsed = () => setCollapsedTopics((current) => {
      const next = new Set(current);
      if (next.has(topic.id)) next.delete(topic.id); else next.add(topic.id);
      return next;
    });
    const disclosure = <button type="button" className="tasks-tree-disclosure" aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${topic.text}`} aria-expanded={!isCollapsed} disabled={!hasChildren} onClick={toggleCollapsed}>{hasChildren ? isCollapsed ? <ChevronRight size={13}/> : <ChevronDown size={13}/> : <span/>}</button>;
    const addButton = <button type="button" className="tasks-tree-add-object" title={`Add object under ${topic.text}`} aria-label={`Add object under ${topic.text}`} onClick={() => addObjectUnder(topic)}><Plus size={13} /></button>;
    const selectTopic = () => { setSelectedObject(topic.text); setSelectedAction(null); };
    return <div className={`tasks-object-tree-group ${depth === 0 ? "tasks-object-tree-root" : `tasks-object-tree-branch tasks-object-tree-level-${depth}`}`} key={topic.id} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedObject(topic.text); setSelectedAction(null); setHierarchyContextMenu({ topic, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 196)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 100)) }); }}>
      {topic.isObject
        ? <div className="tasks-object-tree-object-row">{disclosure}<button type="button" className={`tasks-list-link task-object-item task-tree-object ${selectedObject?.toLocaleLowerCase() === key ? "active" : ""}`} onClick={selectTopic}>{topic.text}<span>{actionCount || ""}</span></button>{addButton}</div>
        : <div className={`tasks-object-tree-label ${selectedObject?.toLocaleLowerCase() === key ? "active" : ""}`}>{disclosure}<button type="button" className="tasks-tree-node-select" onClick={selectTopic}>{depth === 0 && <UserRound size={14} aria-hidden="true" />}<span>{topic.text}</span></button>{addButton}</div>}
      {hasChildren && !isCollapsed && <div className={`tasks-object-tree-children tasks-object-tree-children-level-${depth + 1}`}>{renderObjectTopics(topic.children, depth + 1)}</div>}
    </div>;
  });
  return (
    <main className="home-page">
      <AppSidebar active="tasks" />
      <div className="home-main tasks-main tasks-shell task-list-page">
        <aside className="tasks-nav">
          <nav aria-label="Task views">
            <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}><CalendarDays size={16} />Today<span>{todayTasks.length || ""}</span></button>
            <button className={view === "next" ? "active" : ""} onClick={() => setView("next")}><CalendarRange size={16} />Next 7 Days<span>{nextTasks.length || ""}</span></button>
            <button className={view === "inbox" ? "active" : ""} onClick={() => setView("inbox")}><Inbox size={16} />Inbox<span>{tasks.length || ""}</span></button>
          </nav>
          <div className="tasks-nav-label"><span>Lists</span><div className="tasks-object-view-toggle" role="group" aria-label="Object view"><button type="button" className={objectView === "list" ? "active" : ""} aria-label="List view" title="List view" onClick={() => setObjectView("list")}><List size={13}/></button><button type="button" className={objectView === "hierarchy" ? "active" : ""} aria-label="Hierarchy view" title="Hierarchy view" onClick={() => setObjectView("hierarchy")}><GitBranch size={13}/></button></div></div>
          <div className="tasks-nav-list-scroll">
            {objectView === "list" && <><button className={`tasks-list-link ${view === "list" && !selectedObject ? "active" : ""}`} onClick={() => { setView("list"); setSelectedObject(null); setSelectedAction(null); }}><List size={16} />All Tasks<span>{tasks.length}</span></button>
            {objects.map((object) => {
              const key = object.trim().toLocaleLowerCase();
              const actionCount = (loops[key]?.actions || []).filter((action) => Boolean(action.name?.trim() || action.details?.trim())).length;
              return <button key={key} type="button" className={`tasks-list-link task-object-item ${selectedObject?.toLocaleLowerCase() === key ? "active" : ""}`} onClick={() => { setSelectedObject(object); setSelectedAction(null); }}><List size={15} />{object}<span>{actionCount || ""}</span></button>;
            })}</>}
            {objectView === "hierarchy" && <div className="tasks-object-tree">{renderObjectTopics(objectHierarchy)}</div>}
          </div>
          {hierarchyContextMenu && objectView === "hierarchy" && <div className="tasks-hierarchy-context-menu" style={{ left: hierarchyContextMenu.x, top: hierarchyContextMenu.y }} role="menu">
            <button type="button" role="menuitem" onClick={() => { const topic = hierarchyContextMenu.topic; setHierarchyContextMenu(null); void addObjectUnder(topic); }}><FolderPlus size={15} />Add child node</button>
            <button type="button" role="menuitem" onClick={() => void renameHierarchyTopic(hierarchyContextMenu.topic)}><Pencil size={15} />Rename node</button>
          </div>}
          <div className="tasks-nav-label">Filters</div>
          <button onClick={() => setShowCompleted((value) => !value)}>{showCompleted ? "Hide completed" : "Show completed"}</button>
        </aside>
        <section className="tasks-center">
          <header className="tasks-topline"><h1><span>☰</span>{selectedObject || "Tasks"}</h1></header>
          <form className="tasks-add-form" onSubmit={addTask}>
            <Plus size={17} />
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={selectedObject ? "Add action" : "Add Task"} aria-label={selectedObject ? `Add action to ${selectedObject}` : "New task"} />
            <button type="submit" disabled={!draft.trim()}><Plus size={17} /></button>
          </form>
          <div className="tasks-view-list">
            {selectedObject ? (
              <div className="today-task-list">
                {objectActions.length ? objectActions.map((action) => {
                  const factor = loops[selectedObject.trim().toLocaleLowerCase()]?.inputs.find((input) => input.id === action.inputId);
                  const linkedSchedule = [...tasks].reverse().find((task) => task.feedbackAction?.object.trim().toLocaleLowerCase() === selectedObject.trim().toLocaleLowerCase() && task.feedbackAction.actionId === action.id);
                  const actionFrequency = linkedSchedule ? scheduleFrequency(linkedSchedule) : action.details;
                  return <div className="task-action-item" key={action.id}>
                    <article onClick={() => setSelectedAction({ object: selectedObject, action })} className={`today-task-row ${action.complete ? "is-complete" : ""} ${selectedAction?.action.id === action.id ? "is-selected" : ""}`}>
                      <button type="button" className="today-task-check" style={taskCheckboxStyle(linkedSchedule?.id)} onClick={(event) => { event.stopPropagation(); toggleAction(selectedObject, action); setSelectedAction({ object: selectedObject, action: { ...action, complete: !action.complete, completedDate: !action.complete ? today : undefined } }); }} aria-label={action.complete ? `Mark ${action.name || action.details} incomplete` : `Mark ${action.name || action.details} complete`}>{action.complete && <Check size={14} />}</button>
                      <div className="today-task-copy"><strong>{action.name || action.details}</strong><small className="task-action-meta">{actionFrequency && <span>{actionFrequency}</span>}{factor && <span>{factor.name}: {factor.value || "value not set"}</span>}</small></div>
                      <div className="task-row-tools">
                        <button type="button" className="task-row-icon" title="Schedule action" aria-label={`Schedule ${action.name || "action"}`} onClick={(event) => { event.stopPropagation(); openSchedule({ title: action.name || action.details || "Feedback action", note: [selectedObject && `Feedback loop · ${selectedObject}`, action.details].filter(Boolean).join(" — "), feedbackAction: { object: selectedObject, actionId: action.id }, existing: linkedSchedule }); }}><CalendarPlus size={15} /></button>
                        <button type="button" className="task-row-icon" title="Choose the factor this action influences" aria-label={`Choose factor for ${action.name || "action"}`} aria-expanded={factorPickerActionId === action.id} onClick={(event) => { event.stopPropagation(); setFactorPickerActionId((current) => current === action.id ? null : action.id); }}><Wrench size={14} /></button>
                      </div>
                      {action.complete && <span className="today-task-time">{action.completedDate || "Completed"}</span>}
                    </article>
                    {factorPickerActionId === action.id && <div className="task-factor-picker" onClick={(event) => event.stopPropagation()}><label>Influences<select value={action.inputId || ""} onChange={(event) => updateActionFactor(selectedObject, action.id, event.target.value)}><option value="">No factor selected</option>{(loops[selectedObject.trim().toLocaleLowerCase()]?.inputs || []).map((input) => <option key={input.id} value={input.id}>{input.name || "Untitled factor"}</option>)}</select></label><button type="button" onClick={() => setFactorPickerActionId(null)}>Done</button></div>}
                  </div>;
                }) : <p className="tasks-detail-empty">No linked actions for this object.</p>}
              </div>
            ) : (
              <div className="today-task-list">
                {visible.length ? visible.map((task) => (
                  <article key={task.id} onClick={() => { setSelectedId(task.id); setSelectedObject(null); setSelectedAction(null); }} className={`today-task-row ${task.completedDates?.includes(today) ? "is-complete" : ""} ${selected?.id === task.id && !selectedAction ? "is-selected" : ""}`}>
                    <button type="button" className="today-task-check" style={taskCheckboxStyle(task.id)} onClick={(event) => { event.stopPropagation(); toggle(task); }} aria-label={`Toggle ${task.title}`}>{task.completedDates?.includes(today) && <Check size={14} />}</button>
                    <div className="today-task-copy"><strong>{task.title}</strong>{task.note && <small>{task.note}</small>}</div>
                    <span className="today-task-time">{task.date}</span>
                    <div className="task-row-tools"><button type="button" className="task-row-icon" title="Schedule task" aria-label={`Schedule ${task.title}`} onClick={(event) => { event.stopPropagation(); openSchedule({ title: task.title, note: task.note, existing: task }); }}><CalendarPlus size={15} /></button><button type="button" className="today-task-delete" onClick={(event) => { event.stopPropagation(); remove(task); }} aria-label={`Delete ${task.title}`}><Trash2 size={14} /></button></div>
                  </article>
                )) : <div className="tasks-empty"><span><Check size={24} /></span><strong>No tasks here</strong><p>Add a task above to get started.</p></div>}
              </div>
            )}
          </div>
        </section>
        <aside className={`tasks-detail ${selectedObject ? "object-loop-detail" : ""}`}>
          {selectedObject ? (
            <FeedbackLoopCard key={selectedObject.toLocaleLowerCase()} compact name={selectedObject} loop={loops[selectedObject.trim().toLocaleLowerCase()] || EMPTY_LOOP} onUpdate={(patch) => updateObjectLoop(selectedObject, patch)} />
          ) : selectedAction ? (
            <>
              <header><button className="detail-check" style={taskCheckboxStyle(selectedActionSchedule?.id)} onClick={() => { toggleAction(selectedAction.object, selectedAction.action); setSelectedAction((current) => current ? { ...current, action: { ...current.action, complete: !current.action.complete, completedDate: !current.action.complete ? today : undefined } } : null); }}>{selectedAction.action.complete && <Check size={13} />}</button><span className="detail-date">{selectedAction.object}</span></header>
              <h2>{selectedAction.action.name || selectedAction.action.details}</h2>
              {selectedAction.action.details && selectedAction.action.name && <p>{selectedAction.action.details}</p>}
            </>
          ) : selected ? (
            <>
              <header><button className="detail-check" style={taskCheckboxStyle(selected.id)} onClick={() => toggle(selected)}>{selected.completedDates?.includes(today) && <Check size={13} />}</button><span className="detail-date"><CalendarDays size={14} />{selected.date}</span></header>
              <h2>{selected.title}</h2>
              {selected.note && <p>{selected.note}</p>}
            </>
          ) : <p className="tasks-detail-empty">Select a task to see its details.</p>}
        </aside>
      </div>
      {scheduleTarget && <div className="calendar-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setScheduleTarget(null); }}><form className="calendar-event-modal" onSubmit={saveSchedule}>
        <header><div><span>{scheduleTarget.feedbackAction ? `FEEDBACK ACTION · ${scheduleTarget.feedbackAction.object}` : "TASK SCHEDULE"}</span><h2>Schedule task</h2></div><button type="button" className="icon-btn" aria-label="Close schedule" onClick={() => setScheduleTarget(null)}><X size={17} /></button></header>
        <label>Title<input required maxLength={100} value={scheduleTarget.title} onChange={(event) => setScheduleTarget((current) => current ? { ...current, title: event.target.value } : current)} /></label>
        <div className="calendar-modal-row calendar-modal-date-row"><label>Date<input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} required /></label><label>Start<input type="time" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} /></label><label>End<input type="time" value={scheduleEnd} onChange={(event) => setScheduleEnd(event.target.value)} /></label></div>
        <label>Note<input maxLength={240} value={scheduleTarget.note} onChange={(event) => setScheduleTarget((current) => current ? { ...current, note: event.target.value } : current)} placeholder="Optional details" /></label>
        <fieldset className="calendar-repeat-fieldset"><legend>Repeat</legend>
          <div className="calendar-modal-row calendar-repeat-frequency-row"><label>Frequency<select value={scheduleRepeat} onChange={(event) => { setScheduleRepeat(event.target.value as typeof scheduleRepeat); if (event.target.value === "none") setScheduleExceptOpen(false); }}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="custom">Custom interval</option></select></label>
            {scheduleRepeat === "custom" && <label>Repeat every<input type="number" min={1} max={365} value={scheduleInterval} onChange={(event) => setScheduleInterval(Number(event.target.value) || 1)} /></label>}
            {scheduleRepeat !== "none" && <div className="calendar-except-wrap"><span>Except</span><button type="button" className="calendar-except-trigger" aria-expanded={scheduleExceptOpen} onClick={() => setScheduleExceptOpen((open) => !open)}>{scheduleSkipWeekdays.length ? `${scheduleSkipWeekdays.length} days` : "Weekdays"}<ChevronDown size={13}/></button>{scheduleExceptOpen && <div className="calendar-except-menu" role="group" aria-label="Skip weekdays">{[[1,"Monday"],[2,"Tuesday"],[3,"Wednesday"],[4,"Thursday"],[5,"Friday"],[6,"Saturday"],[0,"Sunday"]].map(([day, label]) => <label key={day}><input type="checkbox" checked={scheduleSkipWeekdays.includes(Number(day))} onChange={() => setScheduleSkipWeekdays((current) => current.includes(Number(day)) ? current.filter((item) => item !== Number(day)) : [...current, Number(day)])}/>{label}</label>)}</div>}</div>}
          </div>
          {scheduleRepeat !== "none" && <div className="calendar-modal-row calendar-repeat-end"><label>Until (optional)<input type="date" min={scheduleDate} value={scheduleUntil} onChange={(event) => setScheduleUntil(event.target.value)} /></label></div>}
        </fieldset>
        <footer><button type="button" className="calendar-today-btn" onClick={() => setScheduleTarget(null)}>Cancel</button><button className="primary-btn" type="submit"><CalendarPlus size={15} /> Save schedule</button></footer>
      </form></div>}
    </main>
  );
}
