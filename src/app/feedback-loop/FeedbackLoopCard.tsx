"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarPlus, Check, ChevronLeft, ChevronRight, Plus, Repeat2, Target, Trash2, Wrench } from "lucide-react";

type Cadence = "day" | "week" | "month";
type Reading = { id: string; date: string; value: number; note?: string; inputValues?: Record<string, string> };
type InputVariable = { id: string; name: string; value: string; tools: string };
type LoopAction = { id: string; name: string; details: string; inputId: string; complete: boolean; completedDate?: string };
type LoopVersion = { id: string; date: string; hypothesis: string; change: string; learning?: string; adjustment?: string };
export type Loop = {
  objective: string;
  objectiveType: "maintain" | "fix" | "upgrade" | "create";
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
};
export const EMPTY_LOOP: Loop = { objective: "", objectiveType: "upgrade", metric: "Outcome", unit: "", baseline: "", target: "", cadence: "week", readings: [], versions: [], reviewLearning: "", nextAdjustment: "", inputs: [], actions: [] };
function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function scheduleActionUrl(object: string, action: LoopAction) {
  const params = new URLSearchParams({ actionTitle: action.name || "Feedback action", actionDetails: action.details || "", feedbackObject: object, feedbackActionId: action.id });
  return `/calendar?${params.toString()}`;
}
export default function FeedbackLoopCard({ name, loop, onUpdate, compact = false }: { name: string; loop: Loop; onUpdate: (patch: Partial<Loop>) => void; compact?: boolean }) {
  const [logDate, setLogDate] = useState(localDateKey);
  const [logValue, setLogValue] = useState("");
  const [logNote, setLogNote] = useState("");
  const [logInputValues, setLogInputValues] = useState<Record<string, string>>({});
  const [reviewInputId, setReviewInputId] = useState("");
  const [reviewNewFactorName, setReviewNewFactorName] = useState("");
  const [reviewValue, setReviewValue] = useState("");
  const [reviewExpectation, setReviewExpectation] = useState("");
  const [activeTab, setActiveTab] = useState<"log" | "review" | "setup" | "history" | "experiments">(() => compact ? "setup" : loop.objective ? "log" : "setup");
  const [experimentRowsPerPage, setExperimentRowsPerPage] = useState(5);
  const [experimentPage, setExperimentPage] = useState(1);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(5);
  const [historyPage, setHistoryPage] = useState(1);
  const [compactEditing, setCompactEditing] = useState<"outcome" | "factors" | "actions" | null>(null);
  const isMaintenance = loop.objectiveType === "maintain";
  const orderedReadings = [...(loop.readings || [])].sort((left, right) => left.date.localeCompare(right.date));
  const historyEntries = orderedReadings.slice().reverse();
  const historyPageCount = Math.max(1, Math.ceil(historyEntries.length / historyRowsPerPage));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const historyPageStart = (currentHistoryPage - 1) * historyRowsPerPage;
  const visibleHistoryEntries = historyEntries.slice(historyPageStart, historyPageStart + historyRowsPerPage);
  const latest = orderedReadings[orderedReadings.length - 1];
  const baseline = Number(loop.baseline);
  const target = Number(loop.target);
  const currentValue = latest?.value ?? (loop.baseline === "" ? undefined : baseline);
  const hasTarget = loop.target.trim() !== "" && loop.baseline.trim() !== "" && target !== baseline;
  const rawProgress = hasTarget && currentValue !== undefined ? ((currentValue - baseline) / (target - baseline)) * 100 : null;
  const progress = rawProgress === null ? null : Math.max(0, Math.min(100, rawProgress));
  const targetReached = rawProgress !== null && rawProgress >= 100;
  const movingTowardTarget = rawProgress !== null && rawProgress > 0 && rawProgress < 100;
  const movingAwayFromTarget = rawProgress !== null && rawProgress < 0;
  const outcomeStatus = targetReached ? "Goal reached" : movingAwayFromTarget ? "Moving away from goal" : movingTowardTarget ? "Moving toward goal" : latest ? "No change yet" : "Ready to record outcome";
  const completedMaintenanceTasks = loop.actions.filter((action) => action.complete).length;
  const cardStatus = isMaintenance ? loop.actions.length ? `${completedMaintenanceTasks} of ${loop.actions.length} tasks done` : "Add maintenance tasks" : outcomeStatus;
  const currentReviewInput = loop.inputs.find((input) => input.id === reviewInputId);
  const versions = loop.versions.length ? loop.versions : [{ id: "initial", date: localDateKey(), hypothesis: "Starting point", change: "Initial setup" }];
  const experimentEntries = versions.slice().reverse();
  const experimentPageCount = Math.max(1, Math.ceil(experimentEntries.length / experimentRowsPerPage));
  const currentExperimentPage = Math.min(experimentPage, experimentPageCount);
  const experimentPageStart = (currentExperimentPage - 1) * experimentRowsPerPage;
  const visibleExperimentEntries = experimentEntries.slice(experimentPageStart, experimentPageStart + experimentRowsPerPage);
  const chartReadings = orderedReadings.filter((reading) => Number.isFinite(reading.value));
  const previousReading = chartReadings.length > 1 ? chartReadings[chartReadings.length - 2] : undefined;
  const outcomeChange = previousReading && latest ? latest.value - previousReading.value : undefined;
  const changedFactors = previousReading && latest ? loop.inputs.map((input) => ({
    name: input.name || "Factor",
    before: previousReading.inputValues?.[input.id],
    after: latest.inputValues?.[input.id],
  })).filter((factor) => factor.before !== undefined && factor.after !== undefined && factor.before !== factor.after) : [];
  const chartValues = [...chartReadings.map((reading) => reading.value), ...(loop.baseline.trim() ? [Number(loop.baseline)] : []), ...(loop.target.trim() ? [Number(loop.target)] : [])].filter(Number.isFinite);
  const chartMin = chartValues.length ? Math.min(...chartValues) : 0;
  const chartMax = chartValues.length ? Math.max(...chartValues) : 1;
  const chartRange = chartMax === chartMin ? Math.max(Math.abs(chartMax) * 0.15, 1) : (chartMax - chartMin) * 0.15;
  const chartY = (value: number) => 90 - ((value - (chartMin - chartRange)) / ((chartMax + chartRange) - (chartMin - chartRange))) * 72;
  const chartAxisTop = chartMax + chartRange;
  const chartAxisBottom = chartMin - chartRange;
  const chartTicks = [chartAxisTop, (chartAxisTop + chartAxisBottom) / 2, chartAxisBottom];
  const formatChartTick = (value: number) => Number(value.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const chartPoints = chartReadings.map((reading, index) => ({ reading, x: chartReadings.length === 1 ? 221 : 52 + index * 338 / (chartReadings.length - 1), y: chartY(reading.value) }));

  const addReading = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!logDate || logValue.trim() === "" || !Number.isFinite(Number(logValue))) return;
    const inputValues = Object.fromEntries(loop.inputs.map((input) => [input.id, logInputValues[input.id] ?? input.value]));
    onUpdate({
      readings: [...(loop.readings || []), { id: crypto.randomUUID(), date: logDate, value: Number(logValue), note: logNote.trim() || undefined, inputValues }],
      inputs: loop.inputs.map((input) => ({ ...input, value: inputValues[input.id] ?? input.value })),
    });
    setLogValue(""); setLogNote("");
  };
  const startReviewCycle = () => {
    if (reviewInputId === "__new__") {
      const name = reviewNewFactorName.trim();
      const nextValue = reviewValue.trim();
      if (!name || !nextValue) return;
      const input: InputVariable = { id: crypto.randomUUID(), name, value: nextValue, tools: "" };
      const version: LoopVersion = {
        id: crypto.randomUUID(), date: localDateKey(), hypothesis: reviewExpectation.trim() || "No expectation recorded",
        change: `New factor: ${name} → ${nextValue}`, learning: loop.reviewLearning.trim() || undefined, adjustment: loop.nextAdjustment.trim() || undefined,
      };
      const existingVersions = loop.versions.length ? loop.versions : [{ id: "initial", date: localDateKey(), hypothesis: "Starting point", change: "Initial setup" }];
      onUpdate({ inputs: [...loop.inputs, input], versions: [...existingVersions, version], reviewLearning: "", nextAdjustment: "" });
      setLogInputValues((values) => ({ ...values, [input.id]: nextValue }));
      setReviewInputId(input.id); setReviewNewFactorName(""); setReviewValue(""); setReviewExpectation("");
      return;
    }
    if (!currentReviewInput || !reviewValue.trim()) return;
    const previousValue = currentReviewInput.value || "not set";
    const nextValue = reviewValue.trim();
    const change = `${currentReviewInput.name || "Input"}: ${previousValue} → ${nextValue}`;
    const version: LoopVersion = {
      id: crypto.randomUUID(), date: localDateKey(), hypothesis: reviewExpectation.trim() || "No expectation recorded",
      change, learning: loop.reviewLearning.trim() || undefined, adjustment: loop.nextAdjustment.trim() || undefined,
    };
    const existingVersions = loop.versions.length ? loop.versions : [{ id: "initial", date: localDateKey(), hypothesis: "Starting point", change: "Initial setup" }];
    onUpdate({
      inputs: loop.inputs.map((input) => input.id === currentReviewInput.id ? { ...input, value: nextValue } : input),
      versions: [...existingVersions, version], reviewLearning: "", nextAdjustment: "",
    });
    setLogInputValues((values) => ({ ...values, [currentReviewInput.id]: nextValue }));
    setReviewValue(""); setReviewExpectation("");
  };
  const addInput = () => onUpdate({ inputs: [...(loop.inputs || []), { id: crypto.randomUUID(), name: "", value: "", tools: "" }] });
  const updateInput = (id: string, patch: Partial<InputVariable>) => onUpdate({ inputs: (loop.inputs || []).map((input) => input.id === id ? { ...input, ...patch } : input) });
  const removeInput = (id: string) => onUpdate({
    inputs: (loop.inputs || []).filter((input) => input.id !== id),
    actions: (loop.actions || []).map((action) => action.inputId === id ? { ...action, inputId: "" } : action),
  });
  const addAction = () => onUpdate({ actions: [...(loop.actions || []), { id: crypto.randomUUID(), name: "", details: "", inputId: "", complete: false }] });
  const updateAction = (id: string, patch: Partial<LoopAction>) => onUpdate({ actions: (loop.actions || []).map((action) => action.id === id ? { ...action, ...patch } : action) });
  const removeAction = (id: string) => onUpdate({ actions: (loop.actions || []).filter((action) => action.id !== id) });

  return (
    <article className="feedback-card">
      <header className="feedback-card-heading"><span className="feedback-object-icon"><Repeat2 size={19} /></span><div><small>OBJECT</small><h2>{name}</h2></div><span className={`feedback-status ${isMaintenance && loop.actions.length > 0 && completedMaintenanceTasks === loop.actions.length ? "is-complete" : !isMaintenance && targetReached ? "is-complete" : ""}`}>{cardStatus}</span></header>
      <div className="feedback-tabs" role="tablist" aria-label={`${name} feedback loop`}>
        {(isMaintenance ? ["setup", "log", "review"] as const : ["setup", "log", "review", "experiments", "history"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "is-active" : ""} onClick={() => setActiveTab(tab)}>{tab === "setup" ? "Plan" : tab === "log" ? isMaintenance ? "Tasks" : "Record" : tab === "review" ? isMaintenance ? "Status" : "Learn" : tab === "experiments" ? "Experiments" : "History"}</button>)}
      </div>

      {activeTab === "setup" && <section className="feedback-tab-panel" role="tabpanel">
        {!compact && <><p className="feedback-panel-intro">Choose the kind of task first. The plan will only ask for details that fit that task.</p>
        <div className="feedback-task-type-picker"><label className="feedback-field"><span>What kind of task is this?</span><select value={loop.objectiveType} onChange={(event) => onUpdate({ objectiveType: event.target.value as Loop["objectiveType"] })}><option value="maintain">Maintain an asset or routine</option><option value="fix">Fix a problem</option><option value="upgrade">Improve an outcome</option><option value="create">Create something new</option></select></label><p>{isMaintenance ? "Use this for a car, house, equipment, or routine you want to keep in good condition. No starting or goal number is needed." : "Set a result to track, note factors you can influence, and choose actions that may help."}</p></div>
        {!isMaintenance && <div className="feedback-cause-flow" aria-label="Actions influence factors, which may affect the outcome"><span>Actions</span><ArrowRight size={16} /><span>Things you can change</span><ArrowRight size={16} /><span>Outcome you track</span></div>}</>}
        <section className="feedback-setup-section">
          <header><div><span className="feedback-step-number">1</span><h3>{compact ? "Outcome" : isMaintenance ? "Name what you are maintaining" : loop.objectiveType === "fix" ? "Describe the problem" : loop.objectiveType === "create" ? "Describe what you want to create" : "Choose the outcome"}</h3><p>{compact ? isMaintenance ? "What you want to keep in good shape" : "The result you want to improve" : isMaintenance ? "For example: keep the car safe and reliable." : "This is the result you will track while you test changes."}</p></div>{compact && <button type="button" className="secondary-btn" onClick={() => setCompactEditing(compactEditing === "outcome" ? null : "outcome")}>{compactEditing === "outcome" ? "Done" : "Edit"}</button>}</header>
          {compact && compactEditing !== "outcome" && <div className="feedback-compact-summary feedback-compact-outcome"><strong>{loop.objective || (isMaintenance ? "No maintenance goal set" : "No outcome set")}</strong>{!isMaintenance && <div className="feedback-compact-metrics">{loop.metric && <span>{loop.metric}{loop.unit ? ` · ${loop.unit}` : ""}</span>}{loop.baseline && <span>Start <b>{loop.baseline}{loop.unit ? ` ${loop.unit}` : ""}</b></span>}{loop.target && <span>Goal <b>{loop.target}{loop.unit ? ` ${loop.unit}` : ""}</b></span>}</div>}</div>}
          {(!compact || compactEditing === "outcome") && <div className="feedback-form-grid">
            {compact && <label className="feedback-field"><span>Task type</span><select value={loop.objectiveType} onChange={(event) => onUpdate({ objectiveType: event.target.value as Loop["objectiveType"] })}><option value="maintain">Maintain</option><option value="fix">Fix</option><option value="upgrade">Improve outcome</option><option value="create">Create</option></select></label>}
            <label className="feedback-field feedback-objective-field"><span><Target size={14} /> {isMaintenance ? "What do you want to keep in good shape?" : loop.objectiveType === "fix" ? "What problem do you want to fix?" : loop.objectiveType === "create" ? "What do you want to create?" : "What result do you want?"}</span><input value={loop.objective} onChange={(event) => onUpdate({ objective: event.target.value })} placeholder={isMaintenance ? `e.g. Keep my ${name.toLowerCase()} safe and reliable` : loop.objectiveType === "fix" ? "e.g. Fix the leak in the roof" : loop.objectiveType === "create" ? "e.g. Build a portfolio website" : `e.g. Improve my ${name.toLowerCase()} or reduce weight`} /></label>
            {isMaintenance ? <label className="feedback-field"><span>How often should you check it?</span><select value={loop.cadence} onChange={(event) => onUpdate({ cadence: event.target.value as Cadence })}><option value="week">Every week</option><option value="month">Every month</option><option value="day">Every day</option></select></label> : <>
              <label className="feedback-field"><span>What will you measure?</span><input value={loop.metric} onChange={(event) => onUpdate({ metric: event.target.value })} placeholder={loop.objectiveType === "fix" ? "e.g. Number of leaks" : loop.objectiveType === "create" ? "e.g. Pages completed" : "e.g. Body weight"} /></label>
              <label className="feedback-field"><span>Unit</span><input value={loop.unit} onChange={(event) => onUpdate({ unit: event.target.value })} placeholder="e.g. kg, hours, %" /></label>
              <label className="feedback-field"><span>Starting value</span><input type="number" step="any" value={loop.baseline} onChange={(event) => onUpdate({ baseline: event.target.value })} placeholder="Where are you now?" /></label>
              <label className="feedback-field"><span>Goal value</span><input type="number" step="any" value={loop.target} onChange={(event) => onUpdate({ target: event.target.value })} placeholder="Where do you want to be?" /></label>
              <label className="feedback-field"><span>How often will you check?</span><select value={loop.cadence} onChange={(event) => onUpdate({ cadence: event.target.value as Cadence })}><option value="day">Every day</option><option value="week">Every week</option><option value="month">Every month</option></select></label>
            </>}
          </div>}
        </section>
        {!isMaintenance && <section className="feedback-setup-section">
          <header><div><span className="feedback-step-number">2</span><h3>{compact ? "Factors you can influence" : "Choose things you can influence"}</h3><p>{compact ? loop.inputs.length ? `${loop.inputs.length} ${loop.inputs.length === 1 ? "factor" : "factors"} tracked` : "No factors added yet" : "These are independent variables: changeable factors that may affect your outcome, like exercise or sleep."}</p></div>{compact ? <div className="feedback-compact-actions"><button className="secondary-btn" type="button" onClick={() => setCompactEditing(compactEditing === "factors" ? null : "factors")}>{compactEditing === "factors" ? "Done" : "Edit"}</button>{compactEditing === "factors" && <button className="secondary-btn" type="button" onClick={addInput}><Plus size={14} /> Add</button>}</div> : <button className="secondary-btn" type="button" onClick={addInput}><Plus size={14} /> Add a factor</button>}</header>
          {compact && compactEditing !== "factors" && <div className="feedback-compact-summary feedback-compact-grid">{loop.inputs.map((input) => <div className="feedback-compact-item" key={input.id}><strong>{input.name || "Untitled factor"}</strong>{input.value && <span>{input.value}</span>}{input.tools && <small>{input.tools}</small>}</div>)}</div>}
          {(!compact || compactEditing === "factors") && (loop.inputs.length ? <div className="feedback-setup-list">{loop.inputs.map((input) => <div className="feedback-input-row" key={input.id}>
            <label className="feedback-field"><span>Factor you can change</span><input value={input.name} onChange={(event) => updateInput(input.id, { name: event.target.value })} placeholder="e.g. Workouts per week" /></label>
            <label className="feedback-field"><span>Current value</span><input value={input.value} onChange={(event) => updateInput(input.id, { value: event.target.value })} placeholder="e.g. 1 workout" /></label>
            <label className="feedback-field"><span>What could help?</span><input value={input.tools} onChange={(event) => updateInput(input.id, { tools: event.target.value })} placeholder="e.g. Gym membership" /></label>
            <button className="feedback-delete-button" type="button" aria-label={`Remove ${input.name || "input variable"}`} title="Remove input variable" onClick={() => removeInput(input.id)}><Trash2 size={14} /></button>
          </div>)}</div> : <p className="feedback-setup-empty">Add a factor you can change. For example, “workouts per week” may influence the outcome “body weight.”</p>)}
        </section>}
        <section className="feedback-setup-section">
          <header><div><span className="feedback-step-number">{isMaintenance ? "2" : "3"}</span><h3>{compact ? isMaintenance ? "Maintenance tasks" : "Actions" : isMaintenance ? "Plan the maintenance tasks" : "Pick actions to change a factor"}</h3><p>{compact ? loop.actions.length ? `${loop.actions.length} ${loop.actions.length === 1 ? "task" : "tasks"} planned` : "No actions added yet" : isMaintenance ? "Add each upkeep task, then schedule it on your calendar and choose how often it repeats." : "Each action should connect to one factor. Actions influence factors; factors may influence the outcome."}</p></div>{compact ? <div className="feedback-compact-actions"><button className="secondary-btn" type="button" onClick={() => setCompactEditing(compactEditing === "actions" ? null : "actions")}>{compactEditing === "actions" ? "Done" : "Edit"}</button>{compactEditing === "actions" && <button className="secondary-btn" type="button" onClick={addAction}><Plus size={14} /> Add</button>}</div> : <button className="secondary-btn" type="button" onClick={addAction}><Plus size={14} /> Add a task</button>}</header>
          {compact && compactEditing !== "actions" && <div className="feedback-compact-summary feedback-compact-grid feedback-compact-action-grid">{loop.actions.map((action) => { const factor = loop.inputs.find((input) => input.id === action.inputId); return <div className={`feedback-compact-item ${action.complete ? "is-complete" : ""}`} key={action.id}><strong>{action.name || "Untitled action"}</strong>{action.details && <span>{action.details}</span>}{factor && <small>Changes {factor.name || "factor"}</small>}</div>; })}</div>}
          {(!compact || compactEditing === "actions") && (loop.actions.length ? <div className="feedback-setup-list">{loop.actions.map((action) => <div className={`feedback-action-row ${isMaintenance ? "is-maintenance-action" : "is-planned-action"}`} key={action.id}>
            <label className="feedback-field"><span>{isMaintenance ? "Maintenance task" : "What will you do?"}</span><input className={action.complete ? "is-complete" : ""} value={action.name} onChange={(event) => updateAction(action.id, { name: event.target.value })} placeholder={isMaintenance ? "e.g. Check tyre pressure" : "e.g. Go to the gym"} /></label>
            {isMaintenance && <label className="feedback-field"><span>When or how often?</span><input value={action.details} onChange={(event) => updateAction(action.id, { details: event.target.value })} placeholder="e.g. Every 6 months or 10,000 km" /></label>}
            {!isMaintenance && <label className="feedback-field"><span><Wrench size={12} /> Which factor will this change?</span><select value={action.inputId} onChange={(event) => updateAction(action.id, { inputId: event.target.value })} disabled={!loop.inputs.length}><option value="">{loop.inputs.length ? "Choose a factor" : "Add a factor first"}</option>{loop.inputs.map((input) => <option key={input.id} value={input.id}>{input.name || "Untitled factor"}</option>)}</select></label>}
            <Link className="feedback-schedule-action" href={scheduleActionUrl(name, action)} title={`Schedule ${action.name || "action"}`} aria-label={`Schedule ${action.name || "action"}`}><CalendarPlus size={14} /><span>Schedule</span></Link>
            <button className="feedback-delete-button" type="button" aria-label={`Remove ${action.name || "action"}`} title="Remove action" onClick={() => removeAction(action.id)}><Trash2 size={14} /></button>
          </div>)}</div> : <p className="feedback-setup-empty">Add a small action that changes one of your factors. Example: “Go to the gym” changes “workouts per week.”</p>)}
        </section>
      </section>}

      {activeTab === "log" && <section className="feedback-tab-panel" role="tabpanel">
        {isMaintenance ? <>
          <div className="feedback-tab-intro"><h3>Maintenance checklist</h3><p>Check off each task when it is done. Your progress is saved with this object.</p></div>
          <div className="feedback-maintenance-summary"><strong>{completedMaintenanceTasks}<span> / {loop.actions.length}</span></strong><div><b>tasks complete</b><small>{loop.actions.length ? `Your check-in reminder is ${loop.cadence === "day" ? "daily" : loop.cadence === "month" ? "monthly" : "weekly"}.` : "Add upkeep tasks in Plan to get started."}</small></div></div>
          {loop.actions.length ? <ul className="feedback-maintenance-list">{loop.actions.map((action) => <li key={action.id} className={action.complete ? "is-complete" : ""}><label><input type="checkbox" checked={action.complete} onChange={(event) => updateAction(action.id, { complete: event.target.checked, completedDate: event.target.checked ? localDateKey() : undefined })} /><span className="feedback-maintenance-checkmark"><Check size={15} /></span><span className="feedback-maintenance-copy"><strong>{action.name || "Unnamed maintenance task"}</strong><small>{action.details || "No schedule details yet"}</small></span></label><Link className="feedback-schedule-action" href={scheduleActionUrl(name, action)} title={`Schedule ${action.name || "task"}`} aria-label={`Schedule ${action.name || "task"}`}><CalendarPlus size={14} /><span>Schedule</span></Link>{action.complete && <time>{action.completedDate || "Done"}</time>}</li>)}</ul> : <p className="feedback-setup-empty">Go to Plan and add the maintenance tasks you want to keep track of.</p>}
        </> : <>
        <div className="feedback-tab-intro"><h3>Record your outcome</h3><p>Log the result you are tracking. At the same time, note your current factors so you can compare what changed.</p></div>
        <section className="feedback-progress-panel" aria-label={`${name} progress`}>
          <div className="feedback-progress-heading"><span><BarChart3 size={15} /> Outcome · {loop.metric || "Progress"}{loop.unit ? ` (${loop.unit})` : ""}</span><strong>{currentValue === undefined ? "No result yet" : `${currentValue}${loop.unit ? ` ${loop.unit}` : ""}`}</strong></div>
          {progress !== null ? <div className="feedback-progress-track"><span style={{ width: `${progress}%` }} /></div> : <div className="feedback-progress-track is-empty" />}
          <div className="feedback-progress-labels"><span>Starting point {loop.baseline || "—"}</span><span>Goal {loop.target || "—"}</span></div>
        </section>
        <form className="feedback-reading-form" onSubmit={addReading}>
          <label className="feedback-field"><span>Date checked</span><input type="date" value={logDate} onChange={(event) => setLogDate(event.target.value)} required /></label>
          <label className="feedback-field"><span>Outcome value · {loop.metric || "Result"}{loop.unit ? ` (${loop.unit})` : ""}</span><input type="number" step="any" value={logValue} onChange={(event) => setLogValue(event.target.value)} placeholder={loop.baseline ? `Starting value: ${loop.baseline}` : "Enter the result"} required /></label>
          <label className="feedback-field feedback-note-field"><span>Anything worth noting?</span><input value={logNote} onChange={(event) => setLogNote(event.target.value)} placeholder="Optional context for this result" /></label>
          <button className="primary-btn" type="submit">Save outcome <ArrowRight size={15} /></button>
          {loop.inputs.length > 0 && <div className="feedback-log-inputs"><div><strong>Factors you can influence</strong><span>Record each factor's value today. This helps you see what changed alongside the outcome.</span></div>{loop.inputs.map((input) => <label className="feedback-field" key={input.id}><span>{input.name || "Factor"}{input.tools ? ` · ${input.tools}` : ""}</span><input value={logInputValues[input.id] ?? input.value} onChange={(event) => setLogInputValues((values) => ({ ...values, [input.id]: event.target.value }))} placeholder="Value today" /></label>)}</div>}
        </form>
        </>}
      </section>}

      {activeTab === "experiments" && !isMaintenance && <section className="feedback-tab-panel" role="tabpanel" aria-label="Experiments">
        <section className="feedback-version-history feedback-experiment-history">
          <div className="feedback-table-heading">
          <h3>Experiments tried <span>{versions.filter((version) => version.id !== "initial").length}</span></h3>
          <div className="feedback-experiment-pagination">
            <label>Rows per page<select value={experimentRowsPerPage} onChange={(event) => { setExperimentRowsPerPage(Number(event.target.value)); setExperimentPage(1); }}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label>
            <span>{experimentEntries.length ? `${experimentPageStart + 1}–${Math.min(experimentPageStart + experimentRowsPerPage, experimentEntries.length)} of ${experimentEntries.length}` : "0 results"}</span>
            <div><button type="button" aria-label="Previous experiment page" title="Previous page" disabled={currentExperimentPage <= 1} onClick={() => setExperimentPage((page) => Math.max(1, page - 1))}><ChevronLeft size={14} /></button><span>Page {currentExperimentPage} of {experimentPageCount}</span><button type="button" aria-label="Next experiment page" title="Next page" disabled={currentExperimentPage >= experimentPageCount} onClick={() => setExperimentPage((page) => Math.min(experimentPageCount, page + 1))}><ChevronRight size={14} /></button></div>
          </div>
          </div>
          <div className="feedback-experiment-table-wrap">
            <table className="feedback-experiment-table">
              <thead><tr><th scope="col">Trial</th><th scope="col">Date</th><th scope="col">Factor changed</th><th scope="col">Expected outcome</th><th scope="col">Learning &amp; next step</th></tr></thead>
              <tbody>{visibleExperimentEntries.map((version, index) => {
                const entryIndex = experimentPageStart + index;
                const trial = version.id === "initial" ? "Start" : `Try ${versions.length - entryIndex - (versions[0]?.id === "initial" ? 1 : 0)}`;
                return <tr key={version.id}>
                  <th scope="row"><span className={`feedback-experiment-trial ${version.id === "initial" ? "is-start" : ""}`}>{trial}</span></th>
                  <td>{version.date}</td><td>{version.change}</td>
                  <td>{version.hypothesis === "No expectation recorded" ? "Not recorded" : version.hypothesis}</td>
                  <td><div className="feedback-experiment-learning">{version.learning && <span><b>Learned:</b> {version.learning}</span>}{version.adjustment && <span><b>Next:</b> {version.adjustment}</span>}{!version.learning && !version.adjustment && <span className="is-empty">—</span>}</div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>

        </section>
      </section>}
      {activeTab === "history" && !isMaintenance && <section className="feedback-tab-panel" role="tabpanel" aria-label="Outcome history">
        <section className="feedback-history">
          <div className="feedback-table-heading">
          <h3>Outcome history <span>{orderedReadings.length}</span></h3>
            <div className="feedback-experiment-pagination">
              <label>Rows per page<select value={historyRowsPerPage} onChange={(event) => { setHistoryRowsPerPage(Number(event.target.value)); setHistoryPage(1); }}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label>
              <span>{historyEntries.length ? `${historyPageStart + 1}–${Math.min(historyPageStart + historyRowsPerPage, historyEntries.length)} of ${historyEntries.length}` : "0 results"}</span>
              <div><button type="button" aria-label="Previous history page" title="Previous page" disabled={currentHistoryPage <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}><ChevronLeft size={14} /></button><span>Page {currentHistoryPage} of {historyPageCount}</span><button type="button" aria-label="Next history page" title="Next page" disabled={currentHistoryPage >= historyPageCount} onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}><ChevronRight size={14} /></button></div>
            </div>
          </div>
          {chartPoints.length > 0 && <div className="feedback-chart-wrap" role="img" aria-label={`${loop.metric || "Progress"}${loop.unit ? ` in ${loop.unit}` : ""} by date, ${chartPoints.length} readings`}><svg viewBox="0 0 400 108" preserveAspectRatio="none">
            {[18, 54, 90].map((y) => <line key={y} x1="48" x2="390" y1={y} y2={y} className="feedback-chart-gridline" />)}
            <line x1="48" x2="48" y1="18" y2="90" className="feedback-chart-axis" />
            <line x1="48" x2="390" y1="90" y2="90" className="feedback-chart-axis" />
            {chartTicks.map((tick, index) => <text key={index} x="42" y={[21, 57, 93][index]} textAnchor="end" className="feedback-chart-tick">{formatChartTick(tick)}</text>)}
            <text x="10" y="54" textAnchor="middle" transform="rotate(-90 10 54)" className="feedback-chart-axis-label">{loop.metric}{loop.unit ? ` (${loop.unit})` : ""}</text>
            {loop.target.trim() !== "" && <line x1="48" x2="390" y1={chartY(Number(loop.target))} y2={chartY(Number(loop.target))} className="feedback-chart-target" />}
            {chartPoints.length > 1 && <polyline points={chartPoints.map((point) => `${point.x},${point.y}`).join(" ")} className="feedback-chart-line" />}
            {chartPoints.map(({ reading, x, y }) => <circle key={reading.id} cx={x} cy={y} r="4" className="feedback-chart-dot"><title>{`${reading.date}: ${reading.value}${loop.unit ? ` ${loop.unit}` : ""}`}</title></circle>)}
          </svg><div className="feedback-chart-dates"><span>{chartReadings[0]?.date}</span><span>Date</span><span>{chartReadings[chartReadings.length - 1]?.date}</span></div></div>}
          {historyEntries.length ? <>
            <div className="feedback-history-table-wrap"><table className="feedback-history-table">
              <thead><tr><th scope="col">Date</th><th scope="col">Outcome</th><th scope="col">Factors recorded</th><th scope="col">Note</th><th scope="col"><span className="feedback-sr-only">Actions</span></th></tr></thead>
              <tbody>{visibleHistoryEntries.map((reading) => <tr key={reading.id}>
                <td>{reading.date}</td>
                <th scope="row">{reading.value}{loop.unit ? ` ${loop.unit}` : ""}</th>
                <td><div className="feedback-history-factor-values">{loop.inputs.map((input) => { const value = reading.inputValues?.[input.id]; return value ? <span key={input.id}><b>{input.name || "Factor"}:</b> {value}</span> : null; })}{!loop.inputs.some((input) => reading.inputValues?.[input.id]) && <span className="is-empty">—</span>}</div></td>
                <td>{reading.note || <span className="is-empty">—</span>}</td>
                <td><button type="button" className="feedback-history-delete" aria-label={`Delete reading from ${reading.date}`} title="Delete reading" onClick={() => onUpdate({ readings: (loop.readings || []).filter((item) => item.id !== reading.id) })}><Trash2 size={14} /></button></td>
              </tr>)}</tbody>
            </table></div>

          </> : <p className="feedback-history-empty">No outcomes recorded yet. Add one in Record to start building your history.</p>}
        </section>
      </section>}

      {activeTab === "review" && <section className="feedback-tab-panel" role="tabpanel">
        {isMaintenance ? <>
          <div className="feedback-tab-intro"><h3>Maintenance status</h3><p>Keep a simple record of the upkeep that protects your {name.toLowerCase()}.</p></div>
          <div className="feedback-review-status"><span className={loop.actions.length > 0 && completedMaintenanceTasks === loop.actions.length ? "is-complete" : ""}>{cardStatus}</span><p>{loop.actions.length ? completedMaintenanceTasks === loop.actions.length ? "Everything on your maintenance list is up to date." : "Complete the listed upkeep tasks to keep this asset in good condition." : "Add maintenance tasks in Plan to start tracking upkeep."}</p></div>
          <div className="feedback-maintenance-summary"><strong>{completedMaintenanceTasks}<span> / {loop.actions.length}</span></strong><div><b>upkeep tasks complete</b><small>Check this list {loop.cadence === "day" ? "every day" : loop.cadence === "month" ? "every month" : "every week"}.</small></div></div>
          {loop.actions.length > 0 && <section className="feedback-version-history"><h3>Maintenance tasks</h3><ol>{loop.actions.map((action) => <li key={action.id}><span className={`feedback-version-number ${action.complete ? "is-done" : ""}`}>{action.complete ? <Check size={13} /> : "Next"}</span><div><strong>{action.name || "Unnamed task"}</strong><time>{action.complete ? action.completedDate || "Completed" : action.details || "Not completed yet"}</time></div></li>)}</ol></section>}
        </> : <>
        <div className="feedback-tab-intro"><h3>Learn from what happened</h3><p>Compare your outcome with the factors you tracked. A pattern is a useful clue, but it does not prove one factor caused the change.</p></div>
        <div className="feedback-review-status"><span className={targetReached ? "is-complete" : ""}>{outcomeStatus}</span><p>{targetReached ? "Your latest outcome reached the goal you set." : movingAwayFromTarget ? "Your latest outcome moved away from the goal. Look at what changed and choose one small adjustment to try." : movingTowardTarget ? "Your outcome is moving toward the goal. Keep recording the same factors to see whether the pattern continues." : latest ? "Your outcome is at the starting point. Try changing one factor and watch what happens." : "Start by recording an outcome. After two or more records, you can compare what changed."}</p></div>
        <div className="feedback-review-summary"><div><small>OUTCOME YOU WANT</small><strong>{loop.objective || "Add an outcome in Plan"}</strong><small>Measured as {loop.metric || "your result"}{loop.unit ? ` (${loop.unit})` : ""}</small></div><div><small>MOST RECENT OUTCOME</small><strong>{latest ? `${latest.value}${loop.unit ? ` ${loop.unit}` : ""} · ${latest.date}` : "No outcome recorded yet"}</strong><small>{latest && chartReadings.length > 1 ? `${chartReadings.length} records so far` : `Starting value: ${loop.baseline || "not set"}`}</small></div><div><small>GOAL</small><strong>{loop.target ? `${loop.target}${loop.unit ? ` ${loop.unit}` : ""}` : "Add a goal in Plan"}</strong><small>{progress === null ? "Progress appears after setting a start and goal" : `${Math.round(progress)}% of the way from start to goal`}</small></div></div>
        {outcomeChange !== undefined && <div className="feedback-cause-comparison"><strong>Since your previous record</strong><span>Outcome changed by <b>{outcomeChange > 0 ? "+" : ""}{outcomeChange}{loop.unit ? ` ${loop.unit}` : ""}</b></span>{changedFactors.length ? <span>Factors that changed: {changedFactors.map((factor) => `${factor.name} (${factor.before} → ${factor.after})`).join(" · ")}</span> : <span>No tracked factor changed, or factor values were not recorded both times.</span>}</div>}
        {latest?.note && <p className="feedback-latest-note">Your note: {latest.note}</p>}
        <div className="feedback-review-fields">
          <label className="feedback-field"><span>What do you think may have helped?</span><textarea value={loop.reviewLearning} onChange={(event) => onUpdate({ reviewLearning: event.target.value })} placeholder="Note what you noticed, even if you are not sure yet." rows={3} /></label>
          <label className="feedback-field"><span>What small change will you try next?</span><textarea value={loop.nextAdjustment} onChange={(event) => onUpdate({ nextAdjustment: event.target.value })} placeholder="Choose one factor or action to adjust." rows={3} /></label>
        </div>

        <section className="feedback-version-section">
          <header><div><h3>Plan one small experiment</h3><p>Update one factor, then record the outcome you expect.</p></div></header>
          <div className="feedback-version-form">
            <label className="feedback-field"><span>Which factor will you change?</span><select value={reviewInputId} onChange={(event) => { const id = event.target.value; setReviewInputId(id); setReviewValue(loop.inputs.find((input) => input.id === id)?.value || ""); }}><option value="">Choose a factor</option>{loop.inputs.map((input) => <option key={input.id} value={input.id}>{input.name || "Untitled factor"} (now: {input.value || "not set"})</option>)}<option value="__new__">＋ New factor</option></select></label>
            {reviewInputId === "__new__" && <label className="feedback-field"><span>New factor name</span><input value={reviewNewFactorName} onChange={(event) => setReviewNewFactorName(event.target.value)} placeholder="e.g. Sleep hours" /></label>}
            <label className="feedback-field"><span>What will you change it to?</span><input value={reviewValue} onChange={(event) => setReviewValue(event.target.value)} placeholder="New factor value" /></label>
            <label className="feedback-field"><span>What outcome do you expect?</span><input value={reviewExpectation} onChange={(event) => setReviewExpectation(event.target.value)} placeholder="Your best guess" /></label>
            <button className="primary-btn" type="button" onClick={startReviewCycle} disabled={reviewInputId === "__new__" ? !reviewNewFactorName.trim() || !reviewValue.trim() : !currentReviewInput || !reviewValue.trim()}>Save experiment <ArrowRight size={15} /></button>
          </div>
        </section>
        </>}
      </section>}
    </article>
  );
}
