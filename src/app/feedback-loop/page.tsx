"use client";

import Link from "next/link";
import AppSidebar from "../AppSidebar";
import FeedbackLoopCard from "./FeedbackLoopCard";
import { syncFeedbackActionTitle } from "../lib/feedbackActionSync";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BarChart3, CalendarPlus, Check, Plus, Repeat2, Target, Trash2, Wrench } from "lucide-react";

const RESOURCES_OBJECTS_KEY = "alleviate-resources-default-objects";
const LEGACY_OBJECTS_KEY = "alleviate-wisemapping-objects-v1";
const LOOPS_KEY = "alleviate-feedback-loops-v1";
type Cadence = "day" | "week" | "month";
type Reading = { id: string; date: string; value: number; note?: string; inputValues?: Record<string, string> };
type InputVariable = { id: string; name: string; value: string; tools: string };
type LoopAction = { id: string; name: string; details: string; inputId: string; complete: boolean; completedDate?: string; dueDate?: string };
type LoopVersion = { id: string; date: string; hypothesis: string; change: string; factorId?: string; learning?: string; adjustment?: string };
type Loop = {
  objective: string;
  objectiveType: "maintain" | "fix" | "upgrade" | "create" | "prepare";
  metric: string;
  unit: string;
  baseline: string;
  target: string;
  cadence: Cadence;
  readings: Reading[];
  versions: LoopVersion[];
  reviewLearning: string;
  nextAdjustment: string;
  inputs: InputVariable[];
  actions: LoopAction[];
  readyBy?: string;
  readiness?: string;
  preparationRecords?: { id: string; date: string; note: string }[];
};
type Loops = Record<string, Loop>;
const EMPTY_LOOP: Loop = { objective: "", objectiveType: "upgrade", metric: "Outcome", unit: "", baseline: "", target: "", cadence: "week", readings: [], versions: [], reviewLearning: "", nextAdjustment: "", inputs: [], actions: [], readyBy: "", readiness: "", preparationRecords: [] };

function objectKey(name: string) { return name.trim().toLocaleLowerCase(); }
function scheduleActionUrl(object: string, action: LoopAction) {
  const params = new URLSearchParams({ actionTitle: action.name || "Feedback action", actionDetails: action.details || "", feedbackObject: object, feedbackActionId: action.id });
  return `/calendar?${params.toString()}`;
}
function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function readObjects(): string[] {
  try {
    const stored = localStorage.getItem(RESOURCES_OBJECTS_KEY) ?? localStorage.getItem(LEGACY_OBJECTS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map((name) => name.trim())))
      : [];
  } catch { return []; }
}
function readLoops(): Loops {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOOPS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function withCurrentObjects(objects: string[], stored: Loops): Loops {
  const next = { ...stored };
  objects.forEach((name) => {
    const existing = next[objectKey(name)];
    next[objectKey(name)] = {
      ...EMPTY_LOOP,
      ...existing,
      readings: existing?.readings || [],
      versions: existing?.versions?.length ? existing.versions : [{ id: "initial", date: localDateKey(), hypothesis: "Starting point", change: "Initial setup" }],
      inputs: existing?.inputs || [],
      actions: existing?.actions || [],
      preparationRecords: existing?.preparationRecords || [],
    };
  });
  return next;
}

export default function FeedbackLoopsPage() {
  const [objects, setObjects] = useState<string[]>([]);
  const [loops, setLoops] = useState<Loops>({});
  const [activeObject, setActiveObject] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const names = readObjects();
    setObjects(names);
    setActiveObject(names[0] ? objectKey(names[0]) : "");
    setLoops(withCurrentObjects(names, readLoops()));
    setReady(true);
    const refreshObjects = (event: StorageEvent) => {
      if (!event.key || event.key === RESOURCES_OBJECTS_KEY || event.key === LEGACY_OBJECTS_KEY) setObjects(readObjects());
    };
    window.addEventListener("storage", refreshObjects);
    return () => window.removeEventListener("storage", refreshObjects);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoops((current) => withCurrentObjects(objects, current));
  }, [objects, ready]);

  useEffect(() => {
    if (!objects.some((name) => objectKey(name) === activeObject)) {
      setActiveObject(objects[0] ? objectKey(objects[0]) : "");
    }
  }, [activeObject, objects]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LOOPS_KEY, JSON.stringify(loops));
      window.dispatchEvent(new Event("feedback-loops-updated"));
      Object.entries(loops).forEach(([object, loop]) => {
        loop.actions?.forEach((action) => {
          if (action.id && action.name?.trim()) syncFeedbackActionTitle(object, action.id, action.name);
        });
      });
    } catch { /* Keep the current session usable if storage is unavailable. */ }
  }, [loops, ready]);

  const updateLoop = useCallback((name: string, patch: Partial<Loop>) => {
    const key = objectKey(name);
    setLoops((current) => ({ ...current, [key]: { ...EMPTY_LOOP, ...current[key], ...patch } }));
  }, []);

  if (!ready) return <main className="loading-screen">Opening feedback loops…</main>;

  return (
    <>
    <AppSidebar active="feedback-loop" />
    <main className="feedback-page">
      <header className="feedback-topbar">
        <Link className="mindmap-back" href="/mind-map"><ArrowLeft size={17} /><span>Mind Maps</span></Link>
        <Link className="mindmap-brand" href="/">Alleviate <span>/</span> Feedback Loops</Link>
        <Link className="secondary-btn feedback-resource-link" href="/mind-map">Manage Resources objects</Link>
      </header>
      <section className="feedback-content">
        <span className="eyebrow">Built from your Resources mind map</span>
        <div className="feedback-heading">
          <div><h1>Feedback loops</h1><p>Choose an outcome, track the factors you can influence, and learn which small changes may help.</p></div>
          <span className="feedback-count">{objects.length} {objects.length === 1 ? "object" : "objects"}</span>
        </div>
        {objects.length ? (
          <>
            <div className="feedback-object-tabs" role="tablist" aria-label="Resources objects">
              {objects.map((name) => <button key={objectKey(name)} type="button" role="tab" aria-selected={activeObject === objectKey(name)} className={activeObject === objectKey(name) ? "is-active" : ""} onClick={() => setActiveObject(objectKey(name))}>{name}</button>)}
            </div>
            {objects.find((name) => objectKey(name) === activeObject) && (() => {
              const name = objects.find((item) => objectKey(item) === activeObject)!;
              return <FeedbackLoopCard key={activeObject} name={name} loop={loops[activeObject] || EMPTY_LOOP} onUpdate={(patch) => updateLoop(name, patch)} />;
            })()}
          </>
        ) : (
          <div className="feedback-empty"><span className="feedback-empty-icon"><Repeat2 size={22} /></span><h2>No Resources objects yet</h2><p>Add objects to the Resources mind map and a feedback loop will be created for each one.</p><Link className="primary-btn" href="/mind-map">Open Resources</Link></div>
        )}
      </section>
    </main>
    </>
  );
}
