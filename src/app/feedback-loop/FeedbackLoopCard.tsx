"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarPlus, Check, ChevronLeft, ChevronRight, Pencil, Plus, Repeat2, Target, Trash2, Wrench } from "lucide-react";
import { taskScheduleSummary, type TaskScheduleSummaryInput } from "../../lib/taskScheduleSummary";

type Cadence = "day" | "week" | "month";
type Reading = { id: string; date: string; value: number; note?: string; inputValues?: Record<string, string> };
type PreparationRecord = { id: string; date: string; note: string };
type InputVariable = { id: string; name: string; value: string; strategy: string; resources: string };
type LoopAction = { id: string; name: string; details: string; inputId: string; complete: boolean; completedDate?: string; dueDate?: string };
type LoopVersion = { id: string; date: string; hypothesis: string; change: string; factorId?: string; learning?: string; adjustment?: string };
export type Loop = {
  situationContext?: string;
  situationProblem?: string;
  situationEvidence?: string;
  situationImpact?: string;
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
  inputs: Array<InputVariable & { tools?: string }>;
  actions: LoopAction[];
  readyBy?: string;
  readiness?: string;
  preparationRecords?: PreparationRecord[];
};
export const EMPTY_LOOP: Loop = { situationContext: "", situationProblem: "", situationEvidence: "", situationImpact: "", objective: "", objectiveType: "upgrade", metric: "Outcome", unit: "", baseline: "", target: "", cadence: "week", readings: [], versions: [], reviewLearning: "", nextAdjustment: "", inputs: [], actions: [], readyBy: "", readiness: "", preparationRecords: [] };
function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function scheduleActionUrl(object: string, action: LoopAction) {
  const params = new URLSearchParams({ actionTitle: action.name || "Feedback action", actionDetails: action.details || "", feedbackObject: object, feedbackActionId: action.id });
  return `/calendar?${params.toString()}`;
}
type LinkedSchedule = TaskScheduleSummaryInput & { feedbackAction: { object: string; actionId: string } };
export default function FeedbackLoopCard({ name, loop, onUpdate, compact = false, schedules = [] }: { name: string; loop: Loop; onUpdate: (patch: Partial<Loop>) => void; compact?: boolean; schedules?: LinkedSchedule[] }) {
  const [financeTotals, setFinanceTotals] = useState({ income: 0, cost: 0 });
  const [logDate, setLogDate] = useState(localDateKey);
  const [logValue, setLogValue] = useState("");
  const [logNote, setLogNote] = useState("");
  const [logInputValues, setLogInputValues] = useState<Record<string, string>>({});
  const [preparationRecordDate, setPreparationRecordDate] = useState(localDateKey);
  const [preparationRecordNote, setPreparationRecordNote] = useState("");
  const [experimentApproach, setExperimentApproach] = useState("");
  const [experimentExpectation, setExperimentExpectation] = useState("");
  const [experimentLearning, setExperimentLearning] = useState("");
  const [experimentNextStep, setExperimentNextStep] = useState("");
  useEffect(() => {
    const refreshFinance = () => {
      try {
        const stored = JSON.parse(localStorage.getItem("alleviate-finance-v1") || "{}");
        const objective = typeof loop.objective === "string" ? loop.objective : "";
        const record = stored && typeof stored === "object" ? stored[objective] : null;
        const entries = Array.isArray(record?.entries) ? record.entries : [];
        setFinanceTotals(entries.reduce((totals: { income: number; cost: number }, entry: { amount?: number; flow?: string }) => {
          const amount = Number(entry.amount) || 0;
          if (entry.flow === "inflow") totals.income += amount;
          if (entry.flow === "outflow") totals.cost += amount;
          return totals;
        }, { income: 0, cost: 0 }));
      } catch { setFinanceTotals({ income: 0, cost: 0 }); }
    };
    refreshFinance();
    window.addEventListener("storage", refreshFinance);
    window.addEventListener("finance-updated", refreshFinance);
    return () => { window.removeEventListener("storage", refreshFinance); window.removeEventListener("finance-updated", refreshFinance); };
  }, [loop.objective]);
  const [reviewInputId, setReviewInputId] = useState("");
  const [reviewNewFactorName, setReviewNewFactorName] = useState("");
  const [reviewValue, setReviewValue] = useState("");
  const [reviewExpectation, setReviewExpectation] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "log" | "review" | "setup" | "tasks" | "history" | "experiments">("overview");
  const [experimentRowsPerPage, setExperimentRowsPerPage] = useState(5);
  const [experimentPage, setExperimentPage] = useState(1);
  const [experimentFactorId, setExperimentFactorId] = useState("all");
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(5);
  const [historyPage, setHistoryPage] = useState(1);
  const [compactEditing, setCompactEditing] = useState<"situation" | "outcome" | "factors" | "actions" | null>(null);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [actionNameDraft, setActionNameDraft] = useState("");
  const actionNameInputRef = useRef<HTMLInputElement>(null);
  const isMaintenance = loop.objectiveType === "maintain";
  const isPrepare = loop.objectiveType === "prepare";
  const orderedReadings = [...(loop.readings || [])].sort((left, right) => left.date.localeCompare(right.date));
  const historyEntries = orderedReadings.slice().reverse();
  const preparationHistoryEntries = [...(loop.preparationRecords || [])].reverse();
  const preparationHistoryPageCount = Math.max(1, Math.ceil(preparationHistoryEntries.length / historyRowsPerPage));
  const currentPreparationHistoryPage = Math.min(historyPage, preparationHistoryPageCount);
  const visiblePreparationHistoryEntries = preparationHistoryEntries.slice((currentPreparationHistoryPage - 1) * historyRowsPerPage, currentPreparationHistoryPage * historyRowsPerPage);
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
  const getActionSchedule = (actionId: string) => [...schedules].reverse().find((schedule) => schedule.feedbackAction.object.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase() && schedule.feedbackAction.actionId === actionId);
  const cardStatus = isMaintenance ? loop.actions.length ? `${completedMaintenanceTasks} of ${loop.actions.length} tasks done` : "Add maintenance tasks" : isPrepare ? loop.actions.length ? `${completedMaintenanceTasks} of ${loop.actions.length} steps done` : loop.readyBy ? `Ready by ${loop.readyBy}` : "Add preparation steps" : outcomeStatus;
  const currentReviewInput = loop.inputs.find((input) => input.id === reviewInputId);
  const versions = loop.versions.length ? loop.versions : [{ id: "initial", date: localDateKey(), hypothesis: "Starting point", change: "Initial setup" }];
  const allExperimentEntries = versions.slice().reverse();
  const findVersionFactorId = (version: LoopVersion) => version.factorId || loop.inputs.find((input) => {
    const factorName = input.name.trim();
    return Boolean(factorName && (version.change.startsWith(`${factorName}:`) || version.change.startsWith(`New factor: ${factorName} →`)));
  })?.id;
  const experimentEntries = allExperimentEntries.filter((version) => experimentFactorId === "all" || findVersionFactorId(version) === experimentFactorId);
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
    });
    setLogValue(""); setLogNote("");
  };
  const addPreparationRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preparationRecordDate || !preparationRecordNote.trim()) return;
    onUpdate({ preparationRecords: [...(loop.preparationRecords || []), { id: crypto.randomUUID(), date: preparationRecordDate, note: preparationRecordNote.trim() }] });
    setPreparationRecordNote("");
  };
  const addPreparationExperiment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!experimentApproach.trim()) return;
    const existingVersions = loop.versions.length ? loop.versions : [{ id: "initial", date: localDateKey(), hypothesis: "Starting point", change: "Initial setup" }];
    onUpdate({ versions: [...existingVersions, { id: crypto.randomUUID(), date: localDateKey(), hypothesis: experimentExpectation.trim() || "No expectation recorded", change: experimentApproach.trim(), learning: experimentLearning.trim() || undefined, adjustment: experimentNextStep.trim() || undefined }] });
    setExperimentApproach(""); setExperimentExpectation(""); setExperimentLearning(""); setExperimentNextStep("");
  };
  const startReviewCycle = () => {
    if (reviewInputId === "__new__") {
      const name = reviewNewFactorName.trim();
      const nextValue = reviewValue.trim();
      if (!name || !nextValue) return;
      const input: InputVariable = { id: crypto.randomUUID(), name, value: nextValue, strategy: "", resources: "" };
      const version: LoopVersion = {
        id: crypto.randomUUID(), date: localDateKey(), hypothesis: reviewExpectation.trim() || "No expectation recorded",
        change: `New factor: ${name} → ${nextValue}`, factorId: input.id, learning: loop.reviewLearning.trim() || undefined, adjustment: loop.nextAdjustment.trim() || undefined,
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
      change, factorId: currentReviewInput.id, learning: loop.reviewLearning.trim() || undefined, adjustment: loop.nextAdjustment.trim() || undefined,
    };
    const existingVersions = loop.versions.length ? loop.versions : [{ id: "initial", date: localDateKey(), hypothesis: "Starting point", change: "Initial setup" }];
    onUpdate({
      inputs: loop.inputs.map((input) => input.id === currentReviewInput.id ? { ...input, value: nextValue } : input),
      versions: [...existingVersions, version], reviewLearning: "", nextAdjustment: "",
    });
    setLogInputValues((values) => ({ ...values, [currentReviewInput.id]: nextValue }));
    setReviewValue(""); setReviewExpectation("");
  };
  const addInput = () => onUpdate({ inputs: [...(loop.inputs || []), { id: crypto.randomUUID(), name: "", value: "", strategy: "", resources: "" }] });
  const updateInput = (id: string, patch: Partial<InputVariable>) => onUpdate({ inputs: (loop.inputs || []).map((input) => input.id === id ? { ...input, ...patch } : input) });
  const removeInput = (id: string) => {
    if (experimentFactorId === id) { setExperimentFactorId("all"); setExperimentPage(1); }
    onUpdate({
      inputs: (loop.inputs || []).filter((input) => input.id !== id),
      actions: (loop.actions || []).map((action) => action.inputId === id ? { ...action, inputId: "" } : action),
    });
  };
  const addAction = () => onUpdate({ actions: [...(loop.actions || []), { id: crypto.randomUUID(), name: "", details: "", inputId: "", complete: false }] });
  const updateAction = (id: string, patch: Partial<LoopAction>) => onUpdate({ actions: (loop.actions || []).map((action) => action.id === id ? { ...action, ...patch } : action) });
  const removeAction = (id: string) => onUpdate({ actions: (loop.actions || []).filter((action) => action.id !== id) });
  const startActionNameEdit = (action: LoopAction) => {
    setActionNameDraft(action.name);
    setEditingActionId(action.id);
    requestAnimationFrame(() => actionNameInputRef.current?.focus());
  };
  const commitActionNameEdit = () => {
    if (!editingActionId) return;
    const action = loop.actions.find((item) => item.id === editingActionId);
    if (action) updateAction(editingActionId, { name: actionNameDraft.trim() || action.name });
    setEditingActionId(null);
  };

  return (
    <article className="feedback-card">
      <header className="feedback-card-heading"><span className="feedback-object-icon"><Repeat2 size={19} /></span><div className="feedback-object-title"><small>OBJECT</small><h2>{name}</h2></div><div className="feedback-finance-totals" aria-label="Finance totals for this objective">{financeTotals.cost > 0 && <span><small>COST</small><strong>−{new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(financeTotals.cost)}</strong></span>}{financeTotals.income > 0 && <span><small>INCOME</small><strong>+{new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(financeTotals.income)}</strong></span>}</div><span className={`feedback-status ${((isMaintenance || isPrepare) && loop.actions.length > 0 && completedMaintenanceTasks === loop.actions.length) || (!isMaintenance && !isPrepare && targetReached) ? "is-complete" : ""}`}>{cardStatus}</span></header>
      <div className="feedback-tabs" role="tablist" aria-label={`${name} feedback loop`}>
        {(isPrepare ? ["overview", "setup", "tasks", "log", "review", "experiments", "history"] as const : isMaintenance ? ["overview", "setup", "log", "review"] as const : ["overview", "setup", "log", "review", "experiments", "history"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "is-active" : ""} onClick={() => setActiveTab(tab)}>{tab === "overview" ? "Overview" : tab === "setup" ? "Plan" : tab === "tasks" ? "Tasks" : tab === "log" ? isMaintenance ? "Tasks" : "Record" : tab === "review" ? isMaintenance ? "Status" : "Learn" : tab === "experiments" ? "Experiments" : "History"}</button>)}
      </div>

      {activeTab === "overview" && <section className="feedback-tab-panel feedback-overview" role="tabpanel" aria-label="Influences and actions overview">
        <div className="feedback-overview-outcome"><div className="feedback-overview-outcome-heading"><span>{isPrepare ? "PREPARATION" : "OUTCOME"}</span><button type="button" className="feedback-overview-edit" aria-label={isPrepare ? "Edit preparation plan" : "Edit outcome"} title={isPrepare ? "Edit preparation plan" : "Edit outcome"} onClick={() => { setCompactEditing("outcome"); setActiveTab("setup"); }}><Pencil size={14} /></button></div><strong>{loop.objective || (isPrepare ? "No preparation goal set yet" : "No outcome set yet")}</strong>{isPrepare && <div className="feedback-compact-metrics">{loop.readyBy && <span>Ready by <b>{loop.readyBy}</b></span>}{loop.readiness && <span>{loop.readiness}</span>}<span>{completedMaintenanceTasks} of {loop.actions.length} steps complete</span></div>}</div>
        <div className="feedback-overview-table-wrap"><table className="feedback-overview-table"><thead><tr>{isPrepare ? <><th scope="col">Preparation step</th><th scope="col">Due by</th><th scope="col">Status</th></> : <><th scope="col">Influence</th><th scope="col">Strategy</th><th scope="col">Resources</th><th scope="col">Actions</th></>}</tr></thead><tbody>
          {isPrepare ? loop.actions.length ? loop.actions.map((action) => <tr key={action.id}><th scope="row">{action.name || "Untitled step"}</th><td>{action.dueDate || <span className="feedback-overview-empty">—</span>}</td><td>{action.complete ? "Complete" : "To do"}</td></tr>) : <tr><td colSpan={3} className="feedback-overview-empty">Add preparation steps in Plan to see them here.</td></tr> : isMaintenance ? <tr><th scope="row">Maintenance</th><td><span className="feedback-overview-empty">—</span></td><td><span className="feedback-overview-empty">—</span></td><td>{loop.actions.length ? <ul>{loop.actions.map((action) => <li key={action.id}><strong>{action.name || "Untitled action"}</strong>{action.details && <span>{action.details}</span>}</li>)}</ul> : <span className="feedback-overview-empty">No actions added yet.</span>}</td></tr> : <>
            {loop.inputs.map((input) => {
              const linkedActions = loop.actions.filter((action) => action.inputId === input.id);
              return <tr key={input.id}><th scope="row"><strong>{input.name || "Untitled influence"}</strong>{input.value && <span className="feedback-overview-influence-value">{input.value}</span>}</th><td>{input.strategy || <span className="feedback-overview-empty">—</span>}</td><td>{input.resources || <span className="feedback-overview-empty">—</span>}</td><td>{linkedActions.length ? <ul>{linkedActions.map((action) => <li key={action.id}><strong>{action.name || "Untitled action"}</strong>{action.details && <span>{action.details}</span>}</li>)}</ul> : <span className="feedback-overview-empty">No actions linked.</span>}</td></tr>;
            })}
            {loop.actions.some((action) => !action.inputId || !loop.inputs.some((input) => input.id === action.inputId)) && <tr><th scope="row">No influence selected</th><td><span className="feedback-overview-empty">—</span></td><td><span className="feedback-overview-empty">—</span></td><td><ul>{loop.actions.filter((action) => !action.inputId || !loop.inputs.some((input) => input.id === action.inputId)).map((action) => <li key={action.id}><strong>{action.name || "Untitled action"}</strong>{action.details && <span>{action.details}</span>}</li>)}</ul></td></tr>}
            {!loop.inputs.length && !loop.actions.length && <tr><td colSpan={4} className="feedback-overview-empty">Add an influence and actions in Plan to see them here.</td></tr>}
          </>}
        </tbody></table></div>
      </section>}

      {activeTab === "setup" && <section className="feedback-tab-panel" role="tabpanel">
        {!compact && <><p className="feedback-panel-intro">Choose the kind of task first. The plan will only ask for details that fit that task.</p>
        <div className="feedback-task-type-picker"><label className="feedback-field"><span>What kind of task is this?</span><select value={loop.objectiveType} onChange={(event) => onUpdate({ objectiveType: event.target.value as Loop["objectiveType"] })}><option value="maintain">Maintain an asset or routine</option><option value="fix">Fix a problem</option><option value="upgrade">Improve an outcome</option><option value="create">Create something new</option><option value="prepare">Prepare for something</option></select></label><p>{isMaintenance ? "Use this for a car, house, equipment, or routine you want to keep in good condition. No starting or goal number is needed." : isPrepare ? "Plan what you need to do before an upcoming event, decision, or milestone." : "Set a result to track, note factors you can influence, and choose actions that may help."}</p></div>
        {!isMaintenance && !isPrepare && <div className="feedback-cause-flow" aria-label="Actions influence factors, which may affect the outcome"><span>Actions</span><ArrowRight size={16} /><span>Things you can change</span><ArrowRight size={16} /><span>Outcome you track</span></div>}</>}
        <section className="feedback-setup-section feedback-situation-section">
          <header><div><span className="feedback-step-number">1</span><h3>Situation</h3><p>Describe what is happening and why it matters.</p></div>{compact && <button type="button" className="secondary-btn" onClick={() => setCompactEditing(compactEditing === "situation" ? null : "situation")}>{compactEditing === "situation" ? "Done" : "Edit"}</button>}</header>
          {compact && compactEditing !== "situation" && <div className="feedback-compact-summary feedback-compact-situation">{([ ["Context", loop.situationContext], ["Problem", loop.situationProblem], ["Evidence", loop.situationEvidence], ["Impact", loop.situationImpact] ] as const).map(([label, value]) => <div className="feedback-compact-item" key={label}><strong>{label}</strong><span>{value || "Not added"}</span></div>)}</div>}
          {(!compact || compactEditing === "situation") && <div className="feedback-form-grid feedback-situation-grid">
            <label className="feedback-field"><span>Context</span><textarea value={loop.situationContext || ""} onChange={(event) => onUpdate({ situationContext: event.target.value })} placeholder="What is the current situation?" rows={2} /></label>
            <label className="feedback-field"><span>Problem</span><textarea value={loop.situationProblem || ""} onChange={(event) => onUpdate({ situationProblem: event.target.value })} placeholder="What is wrong, missing or needs improvement?" rows={2} /></label>
            <label className="feedback-field"><span>Evidence</span><textarea value={loop.situationEvidence || ""} onChange={(event) => onUpdate({ situationEvidence: event.target.value })} placeholder="What information confirms the problem exists?" rows={2} /></label>
            <label className="feedback-field"><span>Impact</span><textarea value={loop.situationImpact || ""} onChange={(event) => onUpdate({ situationImpact: event.target.value })} placeholder="Why does this problem matter?" rows={2} /></label>
          </div>}
        </section>
        <section className="feedback-setup-section feedback-outcome-section">
          <header><div><span className="feedback-step-number">2</span><h3>{compact ? isPrepare ? "Preparation" : "Outcome" : isMaintenance ? "Name what you are maintaining" : isPrepare ? "Plan your preparation" : loop.objectiveType === "fix" ? "Describe the problem" : loop.objectiveType === "create" ? "Describe what you want to create" : "Choose the outcome"}</h3><p>{compact ? isMaintenance ? "What you want to keep in good shape" : isPrepare ? "What you are getting ready for" : "The result you want to improve" : isMaintenance ? "For example: keep the car safe and reliable." : isPrepare ? "Define what ready looks like and when you need to be ready." : "This is the result you will track while you test changes."}</p></div>{compact && <button type="button" className="secondary-btn" onClick={() => setCompactEditing(compactEditing === "outcome" ? null : "outcome")}>{compactEditing === "outcome" ? "Done" : "Edit"}</button>}</header>
          {compact && compactEditing !== "outcome" && <div className="feedback-compact-summary feedback-compact-outcome"><strong>{loop.objective || (isMaintenance ? "No maintenance goal set" : isPrepare ? "No preparation goal set" : "No outcome set")}</strong>{isPrepare ? <div className="feedback-compact-metrics">{loop.readyBy && <span>Ready by <b>{loop.readyBy}</b></span>}{loop.readiness && <span>{loop.readiness}</span>}</div> : !isMaintenance && <div className="feedback-compact-metrics">{loop.metric && <span>{loop.metric}{loop.unit ? ` · ${loop.unit}` : ""}</span>}{loop.baseline && <span>Start <b>{loop.baseline}{loop.unit ? ` ${loop.unit}` : ""}</b></span>}{loop.target && <span>Goal <b>{loop.target}{loop.unit ? ` ${loop.unit}` : ""}</b></span>}</div>}</div>}
          {(!compact || compactEditing === "outcome") && <div className="feedback-form-grid">
            {compact && <label className="feedback-field"><span>Task type</span><select value={loop.objectiveType} onChange={(event) => onUpdate({ objectiveType: event.target.value as Loop["objectiveType"] })}><option value="maintain">Maintain</option><option value="fix">Fix</option><option value="upgrade">Improve outcome</option><option value="create">Create</option><option value="prepare">Prepare</option></select></label>}
            <label className="feedback-field feedback-objective-field"><span><Target size={14} /> {isMaintenance ? "What do you want to keep in good shape?" : isPrepare ? "What are you preparing for?" : loop.objectiveType === "fix" ? "What problem do you want to fix?" : loop.objectiveType === "create" ? "What do you want to create?" : "What result do you want?"}</span><input value={loop.objective} onChange={(event) => onUpdate({ objective: event.target.value })} placeholder={isMaintenance ? `e.g. Keep my ${name.toLowerCase()} safe and reliable` : isPrepare ? "e.g. Be ready for the exam" : loop.objectiveType === "fix" ? "e.g. Fix the leak in the roof" : loop.objectiveType === "create" ? "e.g. Build a portfolio website" : `e.g. Improve my ${name.toLowerCase()} or reduce weight`} /></label>
            {isPrepare ? <><label className="feedback-field"><span>Ready by</span><input type="date" value={loop.readyBy || ""} onChange={(event) => onUpdate({ readyBy: event.target.value })} /></label><label className="feedback-field feedback-objective-field"><span>What does ready look like?</span><textarea value={loop.readiness || ""} onChange={(event) => onUpdate({ readiness: event.target.value })} placeholder="e.g. Know the material and have all documents ready" rows={2} /></label></> : isMaintenance ? <label className="feedback-field"><span>How often should you check it?</span><select value={loop.cadence} onChange={(event) => onUpdate({ cadence: event.target.value as Cadence })}><option value="week">Every week</option><option value="month">Every month</option><option value="day">Every day</option></select></label> : <>
              <label className="feedback-field"><span>What will you measure?</span><input value={loop.metric} onChange={(event) => onUpdate({ metric: event.target.value })} placeholder={loop.objectiveType === "fix" ? "e.g. Number of leaks" : loop.objectiveType === "create" ? "e.g. Pages completed" : "e.g. Body weight"} /></label>
              <label className="feedback-field"><span>Unit</span><input value={loop.unit} onChange={(event) => onUpdate({ unit: event.target.value })} placeholder="e.g. kg, hours, %" /></label>
              <label className="feedback-field"><span>Starting value</span><input type="number" step="any" value={loop.baseline} onChange={(event) => onUpdate({ baseline: event.target.value })} placeholder="Where are you now?" /></label>
              <label className="feedback-field"><span>Goal value</span><input type="number" step="any" value={loop.target} onChange={(event) => onUpdate({ target: event.target.value })} placeholder="Where do you want to be?" /></label>
              <label className="feedback-field"><span>How often will you check?</span><select value={loop.cadence} onChange={(event) => onUpdate({ cadence: event.target.value as Cadence })}><option value="day">Every day</option><option value="week">Every week</option><option value="month">Every month</option></select></label>
            </>}
          </div>}
        </section>
        {!isMaintenance && <section className="feedback-setup-section">
          <header><div><span className="feedback-step-number">3</span><h3>{compact ? "Factors you can influence" : "Choose things you can influence"}</h3><p>{compact ? loop.inputs.length ? `${loop.inputs.length} ${loop.inputs.length === 1 ? "factor" : "factors"} tracked` : "No factors added yet" : isPrepare ? "Track things that affect your readiness, such as time, resources, support, or practice." : "These are independent variables: changeable factors that may affect your outcome, like exercise or sleep."}</p></div>{compact ? <div className="feedback-compact-actions"><button className="secondary-btn" type="button" onClick={() => setCompactEditing(compactEditing === "factors" ? null : "factors")}>{compactEditing === "factors" ? "Done" : "Edit"}</button>{compactEditing === "factors" && <button className="secondary-btn" type="button" onClick={addInput}><Plus size={14} /> Add</button>}</div> : <button className="secondary-btn" type="button" onClick={addInput}><Plus size={14} /> Add a factor</button>}</header>
          {compact && compactEditing !== "factors" && <div className="feedback-compact-summary feedback-compact-grid">{loop.inputs.map((input) => <div className="feedback-compact-item" key={input.id}><strong>{input.name || "Untitled factor"}</strong>{input.value && <span>{input.value}</span>}{input.strategy && <small>Strategy: {input.strategy}</small>}{input.resources && <small>Resources: {input.resources}</small>}</div>)}</div>}
          {(!compact || compactEditing === "factors") && (loop.inputs.length ? <div className="feedback-setup-list">{loop.inputs.map((input) => <div className="feedback-input-row" key={input.id}>
            <label className="feedback-field"><span>Factor you can change</span><input value={input.name} onChange={(event) => updateInput(input.id, { name: event.target.value })} placeholder="e.g. Workouts per week" /></label>
            <label className="feedback-field"><span>Current value</span><input value={input.value} onChange={(event) => updateInput(input.id, { value: event.target.value })} placeholder="e.g. 1 workout" /></label>
            <label className="feedback-field"><span>Strategy</span><input value={input.strategy} onChange={(event) => updateInput(input.id, { strategy: event.target.value })} placeholder="How will you influence this factor?" /></label>
            <label className="feedback-field"><span>Resources</span><input value={input.resources} onChange={(event) => updateInput(input.id, { resources: event.target.value })} placeholder="What will you need?" /></label>
            <button className="feedback-delete-button" type="button" aria-label={`Remove ${input.name || "input variable"}`} title="Remove input variable" onClick={() => removeInput(input.id)}><Trash2 size={14} /></button>
          </div>)}</div> : <p className="feedback-setup-empty">Add a factor you can change. For example, “workouts per week” may influence the outcome “body weight.”</p>)}
        </section>}
        {!compact && <section className="feedback-setup-section">
          <header><div><span className="feedback-step-number">{isMaintenance ? "2" : "3"}</span><h3>{compact ? isMaintenance ? "Maintenance tasks" : isPrepare ? "Preparation steps" : "Actions" : isMaintenance ? "Plan the maintenance tasks" : isPrepare ? "Plan the preparation steps" : "Pick actions to change a factor"}</h3><p>{compact ? loop.actions.length ? `${loop.actions.length} ${loop.actions.length === 1 ? isPrepare ? "step" : "task" : isPrepare ? "steps" : "tasks"} planned` : isPrepare ? "No preparation steps added yet" : "No actions added yet" : isMaintenance ? "Add each upkeep task, then schedule it on your calendar and choose how often it repeats." : isPrepare ? "Break the preparation into clear steps and add a due date when useful." : "Each action should connect to one factor. Actions influence factors; factors may influence the outcome."}</p></div>{compact ? <div className="feedback-compact-actions"><button className="secondary-btn" type="button" onClick={() => setCompactEditing(compactEditing === "actions" ? null : "actions")}>{compactEditing === "actions" ? "Done" : "Edit"}</button>{compactEditing === "actions" && <button className="secondary-btn" type="button" onClick={addAction}><Plus size={14} /> Add</button>}</div> : <button className="secondary-btn" type="button" onClick={addAction}><Plus size={14} /> Add a task</button>}</header>
          {compact && compactEditing !== "actions" && <div className="feedback-compact-summary feedback-compact-grid feedback-compact-action-grid">{loop.actions.map((action) => { const factor = loop.inputs.find((input) => input.id === action.inputId); return <div className={`feedback-compact-item ${action.complete ? "is-complete" : ""}`} key={action.id}><div className="feedback-compact-action-heading">{editingActionId === action.id ? <input ref={actionNameInputRef} className="feedback-inline-action-name" aria-label="Task name" value={actionNameDraft} onChange={(event) => setActionNameDraft(event.target.value)} onBlur={commitActionNameEdit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitActionNameEdit(); } if (event.key === "Escape") { setEditingActionId(null); } }} /> : <strong onDoubleClick={() => startActionNameEdit(action)} title="Double-click to edit task name">{action.name || "Untitled action"}</strong>}<div className="feedback-compact-action-tools"><button type="button" aria-label={`Edit ${action.name || "action"}`} title="Edit task details" onClick={() => setCompactEditing("actions")}><Pencil size={13} /></button><button type="button" aria-label={`Delete ${action.name || "action"}`} title="Delete task" onClick={() => removeAction(action.id)}><Trash2 size={13} /></button></div></div>{action.details && <span>{action.details}</span>}{isPrepare && action.dueDate && <small>Due {action.dueDate}</small>}{factor && <small>Changes {factor.name || "factor"}</small>}</div>; })}</div>}
          {(!compact || compactEditing === "actions") && (loop.actions.length ? <div className="feedback-setup-list">{loop.actions.map((action) => <div className={`feedback-action-row ${isMaintenance ? "is-maintenance-action" : isPrepare ? "is-prepare-action" : "is-planned-action"}`} key={action.id}>
            <label className="feedback-field"><span>{isMaintenance ? "Maintenance task" : isPrepare ? "Preparation step" : "What will you do?"}</span><input className={action.complete ? "is-complete" : ""} value={action.name} onChange={(event) => updateAction(action.id, { name: event.target.value })} placeholder={isMaintenance ? "e.g. Check tyre pressure" : isPrepare ? "e.g. Review chapter 1" : "e.g. Go to the gym"} /></label>
            {isPrepare ? <label className="feedback-field"><span>Due by (optional)</span><input type="date" value={action.dueDate || ""} onChange={(event) => updateAction(action.id, { dueDate: event.target.value })} /></label> : !isMaintenance && <label className="feedback-field"><span><Wrench size={12} /> Which factor will this change?</span><select value={action.inputId} onChange={(event) => updateAction(action.id, { inputId: event.target.value })} disabled={!loop.inputs.length}><option value="">{loop.inputs.length ? "Choose a factor" : "Add a factor first"}</option>{loop.inputs.map((input) => <option key={input.id} value={input.id}>{input.name || "Untitled factor"}</option>)}</select></label>}
            <Link className="feedback-schedule-action" href={scheduleActionUrl(name, action)} title={`Schedule ${action.name || "action"}`} aria-label={`Schedule ${action.name || "action"}`}><CalendarPlus size={14} /><span>Schedule</span></Link>
            <button className="feedback-delete-button" type="button" aria-label={`Remove ${action.name || "action"}`} title="Remove action" onClick={() => removeAction(action.id)}><Trash2 size={14} /></button>
          </div>)}</div> : <p className="feedback-setup-empty">Add a small action that changes one of your factors. Example: “Go to the gym” changes “workouts per week.”</p>)}
        </section>}
      </section>}

      {activeTab === "tasks" && isPrepare && <section className="feedback-tab-panel" role="tabpanel" aria-label="Preparation tasks">
        <div className="feedback-tab-intro"><h3>Preparation checklist</h3><p>Track each step and its due date. Your progress is saved with this object.</p></div>
        <div className="feedback-maintenance-summary"><strong>{loop.actions.length ? <>{completedMaintenanceTasks}<span> / {loop.actions.length}</span></> : "—"}</strong><div><b>{loop.actions.length ? "steps complete" : "No preparation steps yet"}</b><small>{loop.readyBy ? `Be ready by ${loop.readyBy}.` : "Add a ready-by date in Plan when you have one."}</small></div></div>
        {loop.actions.length ? <ul className="feedback-maintenance-list">{loop.actions.map((action) => <li key={action.id} className={action.complete ? "is-complete" : ""}><label><input type="checkbox" checked={action.complete} onChange={(event) => updateAction(action.id, { complete: event.target.checked, completedDate: event.target.checked ? localDateKey() : undefined })} /><span className="feedback-maintenance-checkmark"><Check size={15} /></span><span className="feedback-maintenance-copy"><strong>{action.name || "Unnamed preparation step"}</strong><small>{action.dueDate ? `Due ${action.dueDate}` : "No due date"}</small></span></label><Link className="feedback-schedule-action" href={scheduleActionUrl(name, action)} title={`Schedule ${action.name || "step"}`} aria-label={`Schedule ${action.name || "step"}`}><CalendarPlus size={14} /><span>Schedule</span></Link>{action.complete && <time>{action.completedDate || "Done"}</time>}</li>)}</ul> : <p className="feedback-history-empty">Add preparation steps in Plan to build your checklist.</p>}
      </section>}

      {activeTab === "log" && <section className="feedback-tab-panel" role="tabpanel">
        {isPrepare ? <>
          <div className="feedback-tab-intro"><h3>Readiness check-in</h3><p>Record what is ready and what still needs attention.</p></div>
          <div className="feedback-maintenance-summary"><strong>{loop.actions.length ? <>{completedMaintenanceTasks}<span> / {loop.actions.length}</span></> : "—"}</strong><div><b>{loop.actions.length ? "preparation steps complete" : "No preparation steps yet"}</b><small>{loop.readyBy ? `Ready by ${loop.readyBy}` : loop.readiness || "Update your readiness as you go."}</small></div></div>
          <form className="feedback-reading-form feedback-preparation-record-form" onSubmit={addPreparationRecord}>
            <label className="feedback-field"><span>Date checked</span><input type="date" value={preparationRecordDate} onChange={(event) => setPreparationRecordDate(event.target.value)} required /></label>
            <label className="feedback-field feedback-note-field"><span>Readiness update</span><textarea value={preparationRecordNote} onChange={(event) => setPreparationRecordNote(event.target.value)} placeholder="What is ready? What still needs attention?" rows={3} required /></label>
            <button className="primary-btn" type="submit">Save check-in <ArrowRight size={15} /></button>
          </form>
        </> : isMaintenance ? <>
          <div className="feedback-tab-intro"><h3>Maintenance checklist</h3><p>Check off each task when it is done. Your progress is saved with this object.</p></div>
          <div className="feedback-maintenance-summary"><strong>{completedMaintenanceTasks}<span> / {loop.actions.length}</span></strong><div><b>tasks complete</b><small>{loop.actions.length ? `Your check-in reminder is ${loop.cadence === "day" ? "daily" : loop.cadence === "month" ? "monthly" : "weekly"}.` : "Add upkeep tasks in Plan to get started."}</small></div></div>
          {loop.actions.length ? <ul className="feedback-maintenance-list">{loop.actions.map((action) => { const schedule = getActionSchedule(action.id); const scheduleDetails = schedule ? taskScheduleSummary(schedule).join(" | ") : ""; return <li key={action.id} className={action.complete ? "is-complete" : ""}><label><input type="checkbox" checked={action.complete} onChange={(event) => updateAction(action.id, { complete: event.target.checked, completedDate: event.target.checked ? localDateKey() : undefined })} /><span className="feedback-maintenance-checkmark"><Check size={15} /></span><span className="feedback-maintenance-copy"><strong>{action.name || "Unnamed maintenance task"}</strong><small>{scheduleDetails || action.details || "No schedule details yet"}</small></span></label><Link className="feedback-schedule-action" href={scheduleActionUrl(name, action)} title={`Schedule ${action.name || "task"}`} aria-label={`Schedule ${action.name || "task"}`}><CalendarPlus size={14} /><span>Schedule</span></Link>{action.complete && <time>{action.completedDate || "Done"}</time>}</li>; })}</ul> : <p className="feedback-setup-empty">Go to Plan and add the maintenance tasks you want to keep track of.</p>}
        </> : <>
        <div className="feedback-tab-intro"><h3>Record outcome</h3><p>Save an outcome and its factor values for this check-in.</p></div>
        <section className="feedback-progress-panel" aria-label={`${name} progress`}>
          <div className="feedback-progress-heading"><span><BarChart3 size={15} /> Outcome · {loop.metric || "Progress"}{loop.unit ? ` (${loop.unit})` : ""}</span><strong>{currentValue === undefined ? "No result yet" : `${currentValue}${loop.unit ? ` ${loop.unit}` : ""}`}</strong></div>
          {progress !== null ? <div className="feedback-progress-track"><span style={{ width: `${progress}%` }} /></div> : <div className="feedback-progress-track is-empty" />}
          <div className="feedback-progress-labels"><span>Starting point {loop.baseline || "—"}</span><span>Goal {loop.target || "—"}</span></div>
        </section>
        <form className="feedback-reading-form" onSubmit={addReading}>
          <label className="feedback-field"><span>Date checked</span><input type="date" value={logDate} onChange={(event) => setLogDate(event.target.value)} required /></label>
          <label className="feedback-field"><span>Outcome value · {loop.metric || "Result"}{loop.unit ? ` (${loop.unit})` : ""}</span><input type="number" step="any" value={logValue} onChange={(event) => setLogValue(event.target.value)} placeholder={loop.baseline ? `Starting value: ${loop.baseline}` : "Enter the result"} required /></label>
          <label className="feedback-field feedback-note-field"><span>Anything worth noting?</span><input value={logNote} onChange={(event) => setLogNote(event.target.value)} placeholder="Optional context for this result" /></label>
          {loop.inputs.length > 0 && <div className="feedback-log-inputs"><div><strong>Factors</strong><span>Saved with this check-in only.</span></div>{loop.inputs.map((input) => <label className="feedback-field" key={input.id}><span>{input.name || "Factor"}</span><input value={logInputValues[input.id] ?? input.value} onChange={(event) => setLogInputValues((values) => ({ ...values, [input.id]: event.target.value }))} placeholder="Value" /></label>)}</div>}
          <button className="primary-btn" type="submit">Save outcome <ArrowRight size={15} /></button>
        </form>
        </>}
      </section>}

      {activeTab === "experiments" && (!isMaintenance || isPrepare) && <section className="feedback-tab-panel" role="tabpanel" aria-label="Experiments">
        {isPrepare && <form className="feedback-version-form feedback-preparation-experiment-form" onSubmit={addPreparationExperiment}>
          <label className="feedback-field"><span>Preparation approach to try</span><input value={experimentApproach} onChange={(event) => setExperimentApproach(event.target.value)} placeholder="e.g. Study with practice questions" required /></label>
          <label className="feedback-field"><span>What do you expect?</span><input value={experimentExpectation} onChange={(event) => setExperimentExpectation(event.target.value)} placeholder="e.g. Recall key ideas more easily" /></label>
          <label className="feedback-field"><span>What did you learn?</span><input value={experimentLearning} onChange={(event) => setExperimentLearning(event.target.value)} placeholder="Optional" /></label>
          <label className="feedback-field"><span>What will you try next?</span><input value={experimentNextStep} onChange={(event) => setExperimentNextStep(event.target.value)} placeholder="Optional" /></label>
          <button className="primary-btn" type="submit" disabled={!experimentApproach.trim()}>Add experiment <Plus size={14} /></button>
        </form>}
        <section className="feedback-version-history feedback-experiment-history">
          <div className="feedback-table-heading">
          <h3>Experiments tried <span>{experimentEntries.filter((version) => version.id !== "initial").length}</span></h3>
          <div className="feedback-experiment-pagination">
            <label>Rows per page<select value={experimentRowsPerPage} onChange={(event) => { setExperimentRowsPerPage(Number(event.target.value)); setExperimentPage(1); }}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label>
            {!isPrepare && <label>Factor<select value={experimentFactorId} onChange={(event) => { setExperimentFactorId(event.target.value); setExperimentPage(1); }}><option value="all">All factors</option>{loop.inputs.map((input) => <option key={input.id} value={input.id}>{input.name || "Untitled factor"}</option>)}</select></label>}
            <span>{experimentEntries.length ? `${experimentPageStart + 1}–${Math.min(experimentPageStart + experimentRowsPerPage, experimentEntries.length)} of ${experimentEntries.length}` : "0 results"}</span>
            <div><button type="button" aria-label="Previous experiment page" title="Previous page" disabled={currentExperimentPage <= 1} onClick={() => setExperimentPage((page) => Math.max(1, page - 1))}><ChevronLeft size={14} /></button><span>Page {currentExperimentPage} of {experimentPageCount}</span><button type="button" aria-label="Next experiment page" title="Next page" disabled={currentExperimentPage >= experimentPageCount} onClick={() => setExperimentPage((page) => Math.min(experimentPageCount, page + 1))}><ChevronRight size={14} /></button></div>
          </div>
          </div>
          <div className="feedback-experiment-table-wrap">
            <table className="feedback-experiment-table">
              <thead><tr><th scope="col">Trial</th><th scope="col">Date</th><th scope="col">{isPrepare ? "Approach tried" : "Factor changed"}</th><th scope="col">Expected outcome</th><th scope="col">Learning &amp; next step</th></tr></thead>
              <tbody>{visibleExperimentEntries.map((version) => {
                const entryIndex = allExperimentEntries.findIndex((entry) => entry.id === version.id);
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
      {activeTab === "history" && (!isMaintenance || isPrepare) && <section className="feedback-tab-panel" role="tabpanel" aria-label={isPrepare ? "Preparation history" : "Outcome history"}>
        <section className="feedback-history">
          <div className="feedback-table-heading">
          <h3>{isPrepare ? "Readiness history" : "Outcome history"} <span>{isPrepare ? (loop.preparationRecords || []).length : orderedReadings.length}</span></h3>
            <div className="feedback-experiment-pagination">
              <label>Rows per page<select value={historyRowsPerPage} onChange={(event) => { setHistoryRowsPerPage(Number(event.target.value)); setHistoryPage(1); }}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label>
              <span>{isPrepare ? preparationHistoryEntries.length ? `${(currentPreparationHistoryPage - 1) * historyRowsPerPage + 1}–${Math.min(currentPreparationHistoryPage * historyRowsPerPage, preparationHistoryEntries.length)} of ${preparationHistoryEntries.length}` : "0 results" : historyEntries.length ? `${historyPageStart + 1}–${Math.min(historyPageStart + historyRowsPerPage, historyEntries.length)} of ${historyEntries.length}` : "0 results"}</span>
              <div><button type="button" aria-label="Previous history page" title="Previous page" disabled={isPrepare ? currentPreparationHistoryPage <= 1 : currentHistoryPage <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}><ChevronLeft size={14} /></button><span>Page {isPrepare ? currentPreparationHistoryPage : currentHistoryPage} of {isPrepare ? preparationHistoryPageCount : historyPageCount}</span><button type="button" aria-label="Next history page" title="Next page" disabled={isPrepare ? currentPreparationHistoryPage >= preparationHistoryPageCount : currentHistoryPage >= historyPageCount} onClick={() => setHistoryPage((page) => Math.min(isPrepare ? preparationHistoryPageCount : historyPageCount, page + 1))}><ChevronRight size={14} /></button></div>
            </div>
          </div>
          {isPrepare ? (loop.preparationRecords || []).length ? <div className="feedback-experiment-table-wrap"><table className="feedback-experiment-table"><thead><tr><th scope="col">Date</th><th scope="col">Readiness update</th><th scope="col"><span className="feedback-sr-only">Actions</span></th></tr></thead><tbody>{visiblePreparationHistoryEntries.map((record) => <tr key={record.id}><th scope="row">{record.date}</th><td>{record.note}</td><td><button type="button" className="feedback-history-delete" aria-label={`Delete readiness update from ${record.date}`} title="Delete check-in" onClick={() => onUpdate({ preparationRecords: (loop.preparationRecords || []).filter((item) => item.id !== record.id) })}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div> : <p className="feedback-history-empty">No readiness check-ins recorded yet. Add one in Record.</p> : <>
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
          </>}
        </section>
      </section>}

      {activeTab === "review" && <section className="feedback-tab-panel" role="tabpanel">
        {isMaintenance ? <>
          <div className="feedback-tab-intro"><h3>Maintenance status</h3><p>Keep a simple record of the upkeep that protects your {name.toLowerCase()}.</p></div>
          <div className="feedback-review-status"><span className={loop.actions.length > 0 && completedMaintenanceTasks === loop.actions.length ? "is-complete" : ""}>{cardStatus}</span><p>{loop.actions.length ? completedMaintenanceTasks === loop.actions.length ? "Everything on your maintenance list is up to date." : "Complete the listed upkeep tasks to keep this asset in good condition." : "Add maintenance tasks in Plan to start tracking upkeep."}</p></div>
          <div className="feedback-maintenance-summary"><strong>{completedMaintenanceTasks}<span> / {loop.actions.length}</span></strong><div><b>upkeep tasks complete</b><small>Check this list {loop.cadence === "day" ? "every day" : loop.cadence === "month" ? "every month" : "every week"}.</small></div></div>
          {loop.actions.length > 0 && <section className="feedback-version-history"><h3>Maintenance tasks</h3><ol>{loop.actions.map((action) => <li key={action.id}><span className={`feedback-version-number ${action.complete ? "is-done" : ""}`}>{action.complete ? <Check size={13} /> : "Next"}</span><div><strong>{action.name || "Unnamed task"}</strong><time>{action.complete ? action.completedDate || "Completed" : action.details || "Not completed yet"}</time></div></li>)}</ol></section>}
        </> : isPrepare ? <>
          <div className="feedback-tab-intro"><h3>Learn</h3><p>Review what helped you get ready and what still needs attention.</p></div>
          <div className="feedback-maintenance-summary"><strong>{loop.actions.length ? <>{completedMaintenanceTasks}<span> / {loop.actions.length}</span></> : "—"}</strong><div><b>{loop.actions.length ? "preparation steps complete" : "No preparation steps yet"}</b><small>{loop.readiness || (loop.readyBy ? `Working toward ${loop.readyBy}.` : "Add a ready-by date and readiness definition in Plan.")}</small></div></div>
          <div className="feedback-review-fields">
            <label className="feedback-field"><span>What helped?</span><textarea value={loop.reviewLearning} onChange={(event) => onUpdate({ reviewLearning: event.target.value })} placeholder="Approaches, resources, or support that helped" rows={3} /></label>
            <label className="feedback-field"><span>What still needs attention?</span><textarea value={loop.nextAdjustment} onChange={(event) => onUpdate({ nextAdjustment: event.target.value })} placeholder="Remaining gaps or next preparation steps" rows={3} /></label>
          </div>
        </> : <>
        <div className="feedback-tab-intro"><h3>Learn</h3><p>Review your results and choose what to try next.</p></div>
        <div className="feedback-learn-summary-card">
        <div className="feedback-review-status"><span className={targetReached ? "is-complete" : ""}>{outcomeStatus}</span><p>{targetReached ? "You reached your goal." : movingAwayFromTarget ? "Consider one small adjustment." : movingTowardTarget ? "Keep tracking to see if this continues." : latest ? "Try one change and track the result." : "Record outcomes to see progress."}</p></div>
        <div className="feedback-review-summary"><div><small>OUTCOME</small><strong>{loop.objective || "Add an outcome in Plan"}</strong><small>{loop.metric || "Result"}{loop.unit ? ` · ${loop.unit}` : ""}</small></div><div><small>LATEST</small><strong>{latest ? `${latest.value}${loop.unit ? ` ${loop.unit}` : ""} · ${latest.date}` : "No result yet"}</strong><small>{latest && chartReadings.length > 1 ? `${chartReadings.length} records` : `Start: ${loop.baseline || "not set"}`}</small></div><div><small>GOAL</small><strong>{loop.target ? `${loop.target}${loop.unit ? ` ${loop.unit}` : ""}` : "Not set"}</strong><small>{progress === null ? "Set a start and goal" : `${Math.round(progress)}% progress`}</small></div></div>
        {outcomeChange !== undefined && <div className="feedback-cause-comparison"><strong>Since last check-in</strong><span>Outcome: <b>{outcomeChange > 0 ? "+" : ""}{outcomeChange}{loop.unit ? ` ${loop.unit}` : ""}</b></span>{changedFactors.length ? <span>Changed: {changedFactors.map((factor) => `${factor.name} (${factor.before} → ${factor.after})`).join(" · ")}</span> : <span>No factor change recorded.</span>}</div>}
        {latest?.note && <p className="feedback-latest-note">Note: {latest.note}</p>}
        </div>
        <div className="feedback-review-fields">
          <label className="feedback-field"><span>What helped?</span><textarea value={loop.reviewLearning} onChange={(event) => onUpdate({ reviewLearning: event.target.value })} placeholder="Your observations" rows={3} /></label>
          <label className="feedback-field"><span>What will you change?</span><textarea value={loop.nextAdjustment} onChange={(event) => onUpdate({ nextAdjustment: event.target.value })} placeholder="One small next step" rows={3} /></label>
        </div>

        <section className="feedback-version-section">
          <header><div><h3>Try one change</h3><p>Choose a factor and note what you expect.</p></div></header>
          <div className="feedback-version-form">
            <label className="feedback-field"><span>Factor you can change</span><select value={reviewInputId} onChange={(event) => { const id = event.target.value; setReviewInputId(id); setReviewValue(loop.inputs.find((input) => input.id === id)?.value || ""); }}><option value="">Choose a factor</option>{loop.inputs.map((input) => <option key={input.id} value={input.id}>{input.name || "Untitled factor"}</option>)}<option value="__new__">＋ New factor</option></select></label>
            {reviewInputId === "__new__" && <label className="feedback-field"><span>New factor name</span><input value={reviewNewFactorName} onChange={(event) => setReviewNewFactorName(event.target.value)} placeholder="e.g. Sleep hours" /></label>}
            <label className="feedback-field"><span>New value</span><input value={reviewValue} onChange={(event) => setReviewValue(event.target.value)} placeholder="Value to try" /></label>
            <label className="feedback-field"><span>Expected result</span><input value={reviewExpectation} onChange={(event) => setReviewExpectation(event.target.value)} placeholder="Your prediction" /></label>
            <button className="primary-btn" type="button" onClick={startReviewCycle} disabled={reviewInputId === "__new__" ? !reviewNewFactorName.trim() || !reviewValue.trim() : !currentReviewInput || !reviewValue.trim()}>Save change <ArrowRight size={15} /></button>
          </div>
        </section>
        </>}
      </section>}
    </article>
  );
}
