"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus, Trash2, Wallet } from "lucide-react";
import AppSidebar from "../AppSidebar";

const KEY = "alleviate-finance-v1";
const RESOURCES_KEY = "alleviate-resources-default-objects";
const LEGACY_RESOURCES_KEY = "alleviate-wisemapping-objects-v1";
const FEEDBACK_LOOPS_KEY = "alleviate-feedback-loops-v1";
type Kind = "asset" | "liability" | "leisure";
type Entry = { id: string; name: string; factor: string; amount: number; flow: "inflow" | "outflow"; date: string; recurrence?: { intervalMonths: number } | null; note?: string };
type DebtPlan = { principal: number; monthlyEmi?: number; annualRate?: number; termMonths: number; startDate: string; paidMonths: number[] };
type Objective = { kind: Kind; entries: Entry[]; debt?: DebtPlan };
type FinanceData = Record<string, Objective>;
type FinanceOption = { value: string; label: string; factor: string };
type FinanceTab = "cash-flow" | "monthly-expenses" | "month-view" | "debt-tracker";
const emptyObjective = (): Objective => ({ kind: "asset", entries: [] });
const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
function calculateEmi(principal: number, annualRate: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  const rate = annualRate / 1200;
  return rate === 0 ? principal / months : principal * rate * ((1 + rate) ** months) / (((1 + rate) ** months) - 1);
}
function impliedAnnualRate(principal: number, emi: number, months: number) {
  if (principal <= 0 || emi <= 0 || months <= 0 || emi <= principal / months) return 0;
  const paymentAtRate = (monthlyRate: number) => principal * monthlyRate * ((1 + monthlyRate) ** months) / (((1 + monthlyRate) ** months) - 1);
  let low = 0;
  let high = 1;
  while (paymentAtRate(high) < emi && high < 1000) high *= 2;
  for (let index = 0; index < 100; index += 1) {
    const middle = (low + high) / 2;
    if (paymentAtRate(middle) < emi) low = middle;
    else high = middle;
  }
  return (low + high) * 600;
}
function debtEmi(plan: DebtPlan) { return plan.monthlyEmi || calculateEmi(plan.principal, plan.annualRate || 0, plan.termMonths); }
function debtRate(plan: DebtPlan) { return plan.monthlyEmi ? impliedAnnualRate(plan.principal, plan.monthlyEmi, plan.termMonths) : plan.annualRate || 0; }
function debtSchedule(plan: DebtPlan) {
  const payment = debtEmi(plan);
  const monthlyRate = debtRate(plan) / 1200;
  let balance = plan.principal;
  return Array.from({ length: plan.termMonths }, (_, index) => {
    const [year, month, day] = plan.startDate.split("-").map(Number);
    const date = new Date(year, month - 1 + index, Math.min(day || 1, new Date(year, month + index, 0).getDate()));
    const interest = balance * monthlyRate;
    const principalPaid = Math.min(balance, Math.max(0, payment - interest));
    const emi = index === plan.termMonths - 1 ? balance + interest : payment;
    balance = Math.max(0, balance - principalPaid);
    return { month: date.toLocaleDateString(undefined, { month: "short", year: "numeric" }), yearMonth: date.getFullYear() * 12 + date.getMonth(), emi, interest, principal: index === plan.termMonths - 1 ? Math.min(balance + principalPaid, emi - interest) : principalPaid, balance, paid: plan.paidMonths.includes(index + 1), number: index + 1 };
  });
}

function readResources(): string[] {
  try {
    const saved = localStorage.getItem(RESOURCES_KEY) ?? localStorage.getItem(LEGACY_RESOURCES_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? Array.from(new Set(parsed.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map((name) => name.trim()))) : [];
  } catch { return []; }
}
function readFinanceOptions(objectiveName: string): FinanceOption[] {
  try {
    const loops = JSON.parse(localStorage.getItem(FEEDBACK_LOOPS_KEY) || "{}");
    const key = objectiveName.trim().toLocaleLowerCase();
    const loop = loops && typeof loops === "object" && !Array.isArray(loops)
      ? Object.entries(loops).map(([name, value]) => ({ name, value: value as { objective?: string; inputs?: unknown[] } }))
        .find(({ name, value }) => value.objective?.trim().toLocaleLowerCase() === key || name.trim().toLocaleLowerCase() === key)?.value
      : null;
    const inputs = Array.isArray((loop as { inputs?: unknown[] } | null)?.inputs) ? (loop as { inputs: Array<{ id?: string; name?: string; resources?: string }> }).inputs : [];
    const options: FinanceOption[] = [];
    inputs.forEach((input) => {
      const factor = input.name?.trim();
      if (!factor) return;
      options.push({ value: `factor:${input.id || factor}`, label: `${factor} · Factor`, factor });
      (input.resources || "").split(/[,;\n]+/).map((resource) => resource.trim()).filter(Boolean).forEach((resource) => {
        options.push({ value: `resource:${input.id || factor}:${resource.toLocaleLowerCase()}`, label: `${resource} · ${factor}`, factor });
      });
    });
    return Array.from(new Map(options.map((option) => [option.value, option])).values());
  } catch { return []; }
}
function readFinance(): FinanceData {
  try { const value = JSON.parse(localStorage.getItem(KEY) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}
function readFinanceObjectives(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FEEDBACK_LOOPS_KEY) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    return Object.values(raw).map((value) => (value as { objective?: unknown })?.objective).filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim());
  } catch { return []; }
}
function readObjectiveForResource(resourceName: string): string {
  try {
    const raw = JSON.parse(localStorage.getItem(FEEDBACK_LOOPS_KEY) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "—";
    const match = Object.entries(raw).find(([name, value]) => name.trim().toLocaleLowerCase() === resourceName.trim().toLocaleLowerCase() || (value as { resource?: string })?.resource?.trim().toLocaleLowerCase() === resourceName.trim().toLocaleLowerCase());
    const objective = (match?.[1] as { objective?: unknown } | undefined)?.objective;
    return typeof objective === "string" && objective.trim() ? objective.trim() : "—";
  } catch { return "—"; }
}
function readResourceForObjective(objectiveName: string): string {
  try {
    const raw = JSON.parse(localStorage.getItem(FEEDBACK_LOOPS_KEY) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "—";
    const match = Object.entries(raw).find(([, value]) => (value as { objective?: unknown })?.objective && typeof (value as { objective: string }).objective === "string" && (value as { objective: string }).objective.trim().toLocaleLowerCase() === objectiveName.trim().toLocaleLowerCase());
    return match ? match[0] : "—";
  } catch { return "—"; }
}

export default function FinancePage() {
  const [resources, setResources] = useState<string[]>([]);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [financeOptions, setFinanceOptions] = useState<FinanceOption[]>([]);
  const [data, setData] = useState<FinanceData>({});
  const [activeTab, setActiveTab] = useState<FinanceTab>("cash-flow");
  const [dataReady, setDataReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [selected, setSelected] = useState("");
  const [selectedDebtObject, setSelectedDebtObject] = useState("");
  const [debtPage, setDebtPage] = useState<number | null>(null);
  const [showAllDebtMonths, setShowAllDebtMonths] = useState(false);
  const [includePeriodicMonthlyEquivalent, setIncludePeriodicMonthlyEquivalent] = useState(false);
  const [selectedExpenseMonth, setSelectedExpenseMonth] = useState(() => { const date = new Date(); return date.getFullYear() * 12 + date.getMonth(); });
  const [draftName, setDraftName] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftFlow, setDraftFlow] = useState<Entry["flow"]>("outflow");
  const [draftDate, setDraftDate] = useState(today());
  const [draftRecurrence, setDraftRecurrence] = useState("0");
  const [customMonths, setCustomMonths] = useState("1");
  useEffect(() => {
    const refreshResources = () => setResources(readResources());
    const refreshObjectives = () => setObjectives(readFinanceObjectives());
    const refreshFinance = (event: StorageEvent) => { if (event.key === KEY) setData(readFinance()); };
    setData(readFinance());
    setDataReady(true);
    refreshResources(); refreshObjectives();
    window.addEventListener("storage", refreshResources);
    window.addEventListener("storage", refreshFinance);
    window.addEventListener("resources-mindmap-updated", refreshResources);
    window.addEventListener("feedback-loops-updated", refreshObjectives);
    return () => { window.removeEventListener("storage", refreshResources); window.removeEventListener("storage", refreshFinance); window.removeEventListener("resources-mindmap-updated", refreshResources); window.removeEventListener("feedback-loops-updated", refreshObjectives); };
  }, []);
  useEffect(() => {
    const refreshOptions = () => setFinanceOptions(readFinanceOptions(selected));
    refreshOptions();
    window.addEventListener("storage", refreshOptions);
    window.addEventListener("feedback-loops-updated", refreshOptions);
    return () => { window.removeEventListener("storage", refreshOptions); window.removeEventListener("feedback-loops-updated", refreshOptions); };
  }, [selected]);
  useEffect(() => {
    if (!dataReady) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      setSaveError("");
      window.dispatchEvent(new Event("finance-updated"));
    } catch {
      setSaveError("Finance changes could not be saved in this browser.");
    }
  }, [data, dataReady]);
  useEffect(() => { if (!selected || !objectives.includes(selected)) setSelected(objectives[0] || ""); }, [objectives, selected]);
  useEffect(() => { if (!selectedDebtObject || !resources.includes(selectedDebtObject)) setSelectedDebtObject(resources[0] || ""); }, [resources, selectedDebtObject]);
  useEffect(() => { setFinanceOptions(readFinanceOptions(selected)); setDraftName(""); }, [selected]);
  const current = data[selected] || emptyObjective();
  const debtObjective = data[selectedDebtObject] || emptyObjective();
  const currentDebtSchedule = debtObjective.debt?.principal ? debtSchedule(debtObjective.debt) : [];
  const currentMonthIndex = new Date().getFullYear() * 12 + new Date().getMonth();
  const currentDebtIndex = Math.max(0, currentDebtSchedule.findIndex((installment) => installment.yearMonth >= currentMonthIndex) < 0
    ? currentDebtSchedule.length - 1
    : currentDebtSchedule.findIndex((installment) => installment.yearMonth >= currentMonthIndex));
  const debtPageSize = 12;
  const debtPageCount = Math.max(1, Math.ceil(currentDebtSchedule.length / debtPageSize));
  const activeDebtPage = Math.min(debtPage ?? Math.floor(currentDebtIndex / debtPageSize), debtPageCount - 1);
  const visibleDebtSchedule = showAllDebtMonths ? currentDebtSchedule : currentDebtSchedule.slice(activeDebtPage * debtPageSize, (activeDebtPage + 1) * debtPageSize);
  const previousUnpaidInstallments = currentDebtSchedule.filter((installment) => installment.yearMonth < currentMonthIndex && !installment.paid);
  const updateCurrent = (update: Partial<Objective>) => setData((previous) => ({ ...previous, [selected]: { ...(previous[selected] || emptyObjective()), ...update } }));
  const totals = useMemo(() => objectives.reduce((summary, resource) => {
    const objective = data[resource] || emptyObjective();
    objective.entries.forEach((entry) => { summary[entry.flow] += Number(entry.amount) || 0; });
    summary.net += objective.entries.reduce((sum, entry) => sum + (entry.flow === "inflow" ? 1 : -1) * (Number(entry.amount) || 0), 0);
    return summary;
  }, { inflow: 0, outflow: 0, net: 0 }), [data, objectives]);
  const addEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(draftAmount);
    const option = financeOptions.find((item) => item.value === draftName);
    if (!selected || !option || !Number.isFinite(amount) || amount < 0) return;
    const intervalMonths = draftRecurrence === "custom" ? Number(customMonths) : Number(draftRecurrence);
    if (!Number.isInteger(intervalMonths) || intervalMonths < 0) return;
    updateCurrent({ entries: [{ id: crypto.randomUUID(), name: option.label.replace(/ · (Factor|.*)$/, ""), factor: option.factor, amount, flow: draftFlow, date: draftDate || today(), recurrence: intervalMonths ? { intervalMonths } : null }, ...current.entries] });
    setDraftName(""); setDraftAmount("");
  };
  const removeEntry = (entryId: string) => updateCurrent({ entries: current.entries.filter((entry) => entry.id !== entryId) });
  const currentInflow = current.entries.filter((entry) => entry.flow === "inflow").reduce((sum, entry) => sum + entry.amount, 0);
  const currentOutflow = current.entries.filter((entry) => entry.flow === "outflow").reduce((sum, entry) => sum + entry.amount, 0);
  const expenseGroups = useMemo(() => {
    type ExpenseRow = { id: string; objective: string; name: string; amount: number; date: string; interval: number; detail?: string };
    const groups: Record<"monthly" | "periodic" | "oneTime", ExpenseRow[]> = { monthly: [], periodic: [], oneTime: [] };
    objectives.forEach((objectiveName) => (data[objectiveName]?.entries || []).filter((entry) => entry.flow === "outflow").forEach((entry) => {
      const interval = entry.recurrence?.intervalMonths || 0;
      const row = { id: entry.id, objective: objectiveName, name: entry.name, amount: entry.amount, date: entry.date, interval };
      if (interval === 1) groups.monthly.push(row);
      else if (interval > 1) groups.periodic.push(row);
      else groups.oneTime.push(row);
    }));
    resources.forEach((objectName) => {
      const plan = data[objectName]?.debt;
      if (!plan?.principal || !plan.termMonths) return;
      const emi = debtEmi(plan);
      if (emi + 0.01 < plan.principal / plan.termMonths) return;
      groups.monthly.push({ id: `debt-${objectName}`, objective: objectName, name: `${objectName} loan EMI`, amount: emi, date: plan.startDate, interval: 1, detail: `Debt payment · ${plan.termMonths} months` });
    });
    return groups;
  }, [data, objectives, resources]);
  const monthExpenseRows = useMemo(() => {
    const rows: Array<{ id: string; name: string; object: string; objective: string; amount: number; date: string; detail: string }> = [];
    objectives.forEach((objectiveName) => (data[objectiveName]?.entries || []).filter((entry) => entry.flow === "outflow").forEach((entry) => {
      const interval = entry.recurrence?.intervalMonths || 0;
      if (interval <= 0) return;
      const [year, month, day] = entry.date.split("-").map(Number);
      const startMonth = year * 12 + month - 1;
      if (selectedExpenseMonth < startMonth || (selectedExpenseMonth - startMonth) % interval !== 0) return;
      const dueDate = new Date(Math.floor(selectedExpenseMonth / 12), selectedExpenseMonth % 12, Math.min(day || 1, new Date(Math.floor(selectedExpenseMonth / 12), selectedExpenseMonth % 12 + 1, 0).getDate()));
      rows.push({ id: entry.id, name: entry.name, object: readResourceForObjective(objectiveName), objective: objectiveName, amount: entry.amount, date: dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }), detail: interval === 1 ? "Monthly expense" : `Every ${interval} months` });
    }));
    resources.forEach((objectName) => {
      const plan = data[objectName]?.debt;
      if (!plan?.principal || !plan.termMonths) return;
      const installment = debtSchedule(plan).find((item) => item.yearMonth === selectedExpenseMonth && !item.paid);
      if (installment) rows.push({ id: `debt-${objectName}`, name: `${objectName} loan EMI`, object: objectName, objective: readObjectiveForResource(objectName), amount: installment.emi, date: installment.month, detail: "Monthly debt repayment" });
    });
    return rows;
  }, [data, objectives, resources, selectedExpenseMonth]);
  const monthExpenseObjectRows = useMemo(() => {
    const grouped = new Map<string, { object: string; objective: string; items: typeof monthExpenseRows; amount: number }>();
    monthExpenseRows.forEach((row) => {
      const key = row.object.trim().toLocaleLowerCase();
      const group = grouped.get(key) || { object: resources.find((resource) => resource.trim().toLocaleLowerCase() === key) || row.object, objective: row.objective, items: [], amount: 0 };
      group.items.push(row);
      group.amount += row.amount;
      grouped.set(key, group);
    });
    return Array.from(grouped.values());
  }, [monthExpenseRows, resources]);
  const debtRows = useMemo(() => resources.flatMap((name) => { const objective = data[name]; return objective?.debt && objective.debt.principal > 0 && objective.debt.termMonths > 0 ? [{ name, plan: objective.debt, schedule: debtSchedule(objective.debt) }] : []; }), [data, resources]);
  const debtTotals = useMemo(() => debtRows.reduce((summary, debt) => {
    const unpaid = debt.schedule.filter((installment) => !installment.paid);
    summary.monthlyEmi += unpaid.length ? debtEmi(debt.plan) : 0;
    summary.outstanding += unpaid.reduce((total, installment) => total + installment.emi, 0);
    return summary;
  }, { monthlyEmi: 0, outstanding: 0 }), [debtRows]);
  const routineMaintenance = totals.outflow;
  const updateDebt = (patch: Partial<DebtPlan>, objectName = selectedDebtObject) => {
    if (!objectName) return;
    setData((previous) => {
      const objective = previous[objectName] || emptyObjective();
      return { ...previous, [objectName]: { ...objective, ...(Number(patch.principal) > 0 ? { kind: "liability" as const } : {}), debt: { principal: 0, monthlyEmi: 0, annualRate: 0, termMonths: 12, startDate: today(), paidMonths: [], ...objective.debt, ...patch } } };
    });
  };

  return <div className="finance-shell"><AppSidebar active="finance" /><main className="finance-main">
    <header className="finance-topbar"><span>FINANCE</span></header>
    <section className="finance-content">
      <nav className="finance-tabs" role="tablist" aria-label="Finance sections">
        <button type="button" role="tab" aria-selected={activeTab === "cash-flow"} className={activeTab === "cash-flow" ? "is-active" : ""} onClick={() => setActiveTab("cash-flow")}>Cash flow</button>
        <button type="button" role="tab" aria-selected={activeTab === "monthly-expenses"} className={activeTab === "monthly-expenses" ? "is-active" : ""} onClick={() => setActiveTab("monthly-expenses")}>Routine expense</button>
        <button type="button" role="tab" aria-selected={activeTab === "month-view"} className={activeTab === "month-view" ? "is-active" : ""} onClick={() => { setSelectedExpenseMonth(new Date().getFullYear() * 12 + new Date().getMonth()); setActiveTab("month-view"); }}>Monthly expense</button>
        <button type="button" role="tab" aria-selected={activeTab === "debt-tracker"} className={activeTab === "debt-tracker" ? "is-active" : ""} onClick={() => setActiveTab("debt-tracker")}>Debt tracker</button>
      </nav>
      {activeTab === "cash-flow" && <section className="finance-summary" aria-label="Finance totals">
        <article><span>Total inflow</span><strong>{money(totals.inflow)}</strong><small>Across all objectives</small></article>
        <article><span>Total outflow</span><strong>{money(routineMaintenance + debtTotals.monthlyEmi)}</strong><small>Costs and spending, including EMIs</small><div className="finance-outflow-breakdown"><span>Routine maintenance: {money(routineMaintenance)}</span><span>Monthly EMIs: {money(debtTotals.monthlyEmi)}</span></div></article>
        <article><span>Net cash flow</span><strong className={totals.inflow - routineMaintenance - debtTotals.monthlyEmi >= 0 ? "is-positive" : "is-negative"}>{money(totals.inflow - routineMaintenance - debtTotals.monthlyEmi)}</strong><small>Inflow minus outflow, including EMIs</small></article>
        <article><span>Outstanding debt</span><strong className="is-negative">{money(debtTotals.outstanding)}</strong><small>Remaining unpaid repayments</small></article>
      </section>}
      {saveError && <p className="finance-save-error" role="alert">{saveError}</p>}
      {activeTab === "cash-flow" && (!objectives.length ? <section className="finance-empty"><Wallet size={24}/><h2>Add an outcome to a Feedback Loop</h2><p>Finance objectives come from the outcomes you set for each Resources object. Add an outcome and its factors and resources in Feedback Loops to start tracking costs.</p><Link href="/feedback-loop">Open Feedback Loops</Link></section> : <section className="finance-workspace">
        <aside className="finance-objectives"><div className="finance-section-heading"><div><span>OBJECTIVES</span><h2>Tracked outcomes</h2></div><small>{objectives.length}</small></div>
          {objectives.map((resource) => { const objective = data[resource] || emptyObjective(); const net = objective.entries.reduce((sum, entry) => sum + (entry.flow === "inflow" ? entry.amount : -entry.amount), 0); return { resource, objective, net }; }).sort((a, b) => a.net - b.net).map(({ resource, objective, net }) => <button key={resource} type="button" className={`finance-objective ${selected === resource ? "is-selected" : ""}`} onClick={() => setSelected(resource)}><span className={`finance-kind-dot ${objective.kind}`}/><span className="finance-objective-name">{resource}</span><span className={net >= 0 ? "is-positive" : "is-negative"}>{money(net)}</span></button>)}
        </aside>
        <section className="finance-detail"><header className="finance-detail-heading"><div><span>OBJECTIVE</span><h2>{selected}</h2></div><label className="finance-kind-select"><span>Classify as</span><select value={current.kind} onChange={(event) => updateCurrent({ kind: event.target.value as Kind })}><option value="asset">Asset</option><option value="liability">Liability</option><option value="leisure">Leisure resource</option></select></label></header>
          <div className="finance-objective-totals"><div><span>Inflow</span><strong className="is-positive">{money(currentInflow)}</strong></div><div><span>Outflow</span><strong>{money(currentOutflow)}</strong></div><div><span>Net</span><strong className={currentInflow - currentOutflow >= 0 ? "is-positive" : "is-negative"}>{money(currentInflow - currentOutflow)}</strong></div></div>
          <form className="finance-entry-form" onSubmit={addEntry}><div className="finance-entry-form-heading"><div><span>ADD TO {selected.toLocaleUpperCase()}</span><h3>Record a resource or cash flow</h3></div></div>
            <div className="finance-entry-fields"><label><span>Resource / factor</span><select required value={draftName} onChange={(event) => setDraftName(event.target.value)}><option value="">{financeOptions.length ? "Select a factor or resource" : "Add factors and resources in Feedback Loops"}</option>{financeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>Amount (₹)</span><input required type="number" min="0" step="0.01" value={draftAmount} onChange={(event) => setDraftAmount(event.target.value)} placeholder="0"/></label><label><span>Direction</span><select value={draftFlow} onChange={(event) => setDraftFlow(event.target.value as Entry["flow"])}><option value="outflow">Outflow / cost</option><option value="inflow">Inflow / income</option></select></label><label><span>Date</span><input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)}/></label><label><span>Recurrence</span><select value={draftRecurrence} onChange={(event) => setDraftRecurrence(event.target.value)}><option value="0">One-time</option><option value="1">Every month</option><option value="2">Every 2 months</option><option value="3">Every 3 months</option><option value="6">Every 6 months</option><option value="12">Every 12 months</option><option value="custom">Custom interval…</option></select></label>{draftRecurrence === "custom" && <label><span>Every X months</span><input required type="number" min="1" step="1" value={customMonths} onChange={(event) => setCustomMonths(event.target.value)}/></label>}<button className="finance-add-button" type="submit" disabled={!financeOptions.length}><Plus size={15}/> Add entry</button></div>
          </form>
          <section className="finance-entries"><header><div><span>ACTIVITY</span><h3>Income and costs</h3></div><small>{current.entries.length} entries</small></header>
            {current.entries.length ? <div className="finance-entry-list">{current.entries.slice().sort((a,b) => b.date.localeCompare(a.date)).map((entry) => <article key={entry.id} className="finance-entry"><span className={`finance-flow-mark ${entry.flow}`}>{entry.flow === "inflow" ? "+" : "−"}</span><div className="finance-entry-copy"><strong>{entry.name}</strong><small>{entry.date}{entry.recurrence && entry.recurrence.intervalMonths > 0 ? ` · Every ${entry.recurrence.intervalMonths} month${entry.recurrence.intervalMonths === 1 ? "" : "s"}` : " · One-time"}</small></div><strong className={entry.flow === "inflow" ? "is-positive" : ""}>{entry.flow === "inflow" ? "+" : "−"}{money(entry.amount)}</strong><button type="button" aria-label={`Delete ${entry.name}`} title="Delete entry" onClick={() => removeEntry(entry.id)}><Trash2 size={15}/></button></article>)}</div> : <p className="finance-no-entries">No activity yet. Add an income or cost above to start this objective's ledger.</p>}
          </section>
        </section>
      </section>)}
      {activeTab === "monthly-expenses" && <section className="finance-tab-panel">
        <header className="finance-panel-heading"><div><span>SPENDING OVER TIME</span><h1>Routine expense</h1><p>Recurring costs grouped by how often they are due.</p></div></header>
        <div className="finance-expense-columns">
          {([ ["monthly", "Every month", "Recurring monthly costs"], ["periodic", "Every X months", "Periodic costs"], ["oneTime", "One-time / irregular", "Costs without a recurrence"] ] as const).map(([key, heading, description]) => {
            const rows = key === "monthly" && includePeriodicMonthlyEquivalent
              ? [...expenseGroups.monthly, ...expenseGroups.periodic.map((row) => ({ ...row, id: `monthly-equivalent-${row.id}`, amount: row.amount / Math.max(1, row.interval), detail: `${row.detail || `${row.objective} · ${row.date}`} · ${money(row.amount)} every ${row.interval} months` }))]
              : expenseGroups[key];
            const total = rows.reduce((sum, row) => sum + row.amount, 0);
            return <section className="finance-expense-group" key={key}><header><div><h2>{heading}</h2><p>{description}</p>{key === "monthly" && <label className="finance-expense-toggle"><input type="checkbox" checked={includePeriodicMonthlyEquivalent} onChange={(event) => setIncludePeriodicMonthlyEquivalent(event.target.checked)}/><span>Include periodic monthly equivalent</span></label>}</div><strong>{money(total)}<small>{key === "monthly" ? "per month" : key === "periodic" ? "per occurrence" : "total recorded"}</small></strong></header>{rows.length ? <div className="finance-expense-list">{rows.map(({ objective, id, name, date, amount, interval, detail }) => <article key={`${objective}-${id}`}><div><strong>{name}</strong><small>{detail || `${objective} · ${date}${key === "periodic" ? ` · Every ${interval} months` : ""}`}</small></div><div className="finance-expense-amount"><b>{money(amount)}</b></div></article>)}</div> : <p className="finance-empty-inline">No expenses in this group yet.</p>}</section>;
          })}
        </div>
      </section>}
      {activeTab === "month-view" && <section className="finance-tab-panel">
        <header className="finance-panel-heading"><div><span>MONTHLY OVERVIEW</span><h1>Monthly expense</h1><p>See recurring costs and loan EMIs scheduled for each month.</p></div></header>
        <section className="finance-month-expenses">
          <header className="finance-month-expenses-heading"><div><span>SELECT MONTH</span><h2>{new Date(Math.floor(selectedExpenseMonth / 12), selectedExpenseMonth % 12, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2></div><div className="finance-month-switch"><button type="button" onClick={() => setSelectedExpenseMonth((month) => month - 1)} aria-label="Previous month"><ChevronLeft size={16}/></button><button type="button" className={selectedExpenseMonth === new Date().getFullYear() * 12 + new Date().getMonth() ? "is-current" : ""} onClick={() => setSelectedExpenseMonth(new Date().getFullYear() * 12 + new Date().getMonth())}>Current month</button><button type="button" onClick={() => setSelectedExpenseMonth((month) => month + 1)} aria-label="Next month"><ChevronRight size={16}/></button></div></header>
          <div className="finance-month-total"><div><span>Total due this month</span><strong>{money(monthExpenseObjectRows.reduce((sum, row) => sum + row.amount, 0))}</strong></div><small>{monthExpenseObjectRows.length} {monthExpenseObjectRows.length === 1 ? "object" : "objects"}</small></div>
          {monthExpenseObjectRows.length ? <div className="finance-month-expense-table"><div className="finance-month-expense-table-head"><span>Object</span><span>Objective</span><span>Cost</span></div><div className="finance-month-expense-list">{monthExpenseObjectRows.map((row) => <article key={row.object}><div className="finance-month-object"><strong>{row.object}</strong></div><div className="finance-month-objective"><strong>{row.objective}</strong><small>{row.items.map((item) => `${item.name} · ${item.date} · ${item.detail}`).join("  |  ")}</small></div><b>{money(row.amount)}</b></article>)}</div></div> : <p className="finance-empty-inline">No recurring expenses or EMI payments are due this month.</p>}
        </section>
      </section>}
      {activeTab === "debt-tracker" && <section className="finance-tab-panel">
        <header className="finance-panel-heading"><div><span>LIABILITIES AND REPAYMENT</span><h1>Debt tracker</h1><p>Set a loan for an object to calculate EMI, interest, total payable, and monthly repayment progress.</p></div><label className="finance-debt-object-select"><span>Object</span><select value={selectedDebtObject} onChange={(event) => { setSelectedDebtObject(event.target.value); setDebtPage(null); setShowAllDebtMonths(false); }}>{resources.map((objectName) => <option key={objectName} value={objectName}>{objectName}</option>)}</select></label></header>
        {selectedDebtObject ? <>
          <section className="finance-debt-setup"><header><div><span>LOAN DETAILS</span><h2>{selectedDebtObject}</h2></div><small>Interest is inferred from principal, EMI, and term using a reducing-balance estimate.</small></header><div className="finance-debt-fields"><label><span>Principal amount (₹)</span><input type="number" min="0" step="1000" value={debtObjective.debt?.principal || ""} onChange={(event) => updateDebt({ principal: Number(event.target.value) || 0 })} placeholder="e.g. 500000"/></label><label><span>Monthly EMI (₹)</span><input type="number" min={debtObjective.debt?.principal && debtObjective.debt.termMonths ? debtObjective.debt.principal / debtObjective.debt.termMonths : 0} step="100" value={debtObjective.debt?.monthlyEmi ?? (debtObjective.debt?.principal ? calculateEmi(debtObjective.debt.principal, debtObjective.debt.annualRate || 0, debtObjective.debt.termMonths) : "")} onChange={(event) => updateDebt({ monthlyEmi: Number(event.target.value) || 0, annualRate: undefined })} placeholder="e.g. 15000"/></label><label><span>Term (months)</span><input type="number" min="1" step="1" value={debtObjective.debt?.termMonths ?? 12} onChange={(event) => updateDebt({ termMonths: Math.max(1, Number(event.target.value) || 1) })}/></label><label><span>First EMI date</span><input type="date" value={debtObjective.debt?.startDate || today()} onChange={(event) => updateDebt({ startDate: event.target.value })}/></label></div></section>
          {debtObjective.debt?.principal ? (() => { const emi = debtEmi(debtObjective.debt); const minimumEmi = debtObjective.debt.principal / debtObjective.debt.termMonths; const validEmi = emi + 0.01 >= minimumEmi; const schedule = validEmi ? currentDebtSchedule : []; const impliedRate = debtRate(debtObjective.debt); const totalInterest = schedule.reduce((sum, installment) => sum + installment.interest, 0); const totalPaid = schedule.filter((installment) => installment.paid).reduce((sum, installment) => sum + installment.emi, 0); return <>
            {validEmi ? <>
            <section className="finance-debt-metrics"><article><span>Monthly EMI</span><strong>{money(emi)}</strong></article><article><span>Implied annual rate</span><strong>{impliedRate.toFixed(2)}%</strong></article><article><span>Total interest</span><strong>{money(totalInterest)}</strong></article><article><span>Total payable</span><strong>{money(debtObjective.debt!.principal + totalInterest)}</strong></article><article><span>Paid so far</span><strong>{money(totalPaid)}</strong></article></section>
            <section className="finance-debt-schedule"><header><div><span>PAYMENT PLAN</span><h2>Monthly repayments</h2></div><small>{debtObjective.debt.termMonths} installments · {debtObjective.debt.paidMonths.length} paid</small></header><div className="finance-debt-pagination"><div className="finance-debt-page-controls"><button type="button" aria-label="First 12 installments" title="First page" disabled={showAllDebtMonths || activeDebtPage === 0} onClick={() => setDebtPage(0)}><ChevronsLeft size={15}/></button><button type="button" aria-label="Previous 12 installments" title="Previous page" disabled={showAllDebtMonths || activeDebtPage === 0} onClick={() => setDebtPage(Math.max(0, activeDebtPage - 1))}><ChevronLeft size={15}/></button><select aria-label="Repayment schedule page" value={activeDebtPage} disabled={showAllDebtMonths} onChange={(event) => setDebtPage(Number(event.target.value))}>{Array.from({ length: debtPageCount }, (_, page) => { const first = currentDebtSchedule[page * debtPageSize]; const last = currentDebtSchedule[Math.min((page + 1) * debtPageSize - 1, currentDebtSchedule.length - 1)]; return <option key={page} value={page}>{first?.month} – {last?.month}</option>; })}</select><button type="button" aria-label="Next 12 installments" title="Next page" disabled={showAllDebtMonths || activeDebtPage >= debtPageCount - 1} onClick={() => setDebtPage(Math.min(debtPageCount - 1, activeDebtPage + 1))}><ChevronRight size={15}/></button><button type="button" aria-label="Last 12 installments" title="Last page" disabled={showAllDebtMonths || activeDebtPage >= debtPageCount - 1} onClick={() => setDebtPage(debtPageCount - 1)}><ChevronsRight size={15}/></button></div><span>{showAllDebtMonths ? `All ${currentDebtSchedule.length} months` : `Page ${activeDebtPage + 1} of ${debtPageCount}`}</span>{previousUnpaidInstallments.length > 0 && <button type="button" className="finance-debt-show-all" onClick={() => updateDebt({ paidMonths: Array.from(new Set([...debtObjective.debt!.paidMonths, ...previousUnpaidInstallments.map((installment) => installment.number)])) })}>Mark previous as paid ({previousUnpaidInstallments.length})</button>}<button type="button" className={`finance-debt-show-all ${showAllDebtMonths ? "is-active" : ""}`} aria-pressed={showAllDebtMonths} onClick={() => setShowAllDebtMonths((showAll) => !showAll)}>{showAllDebtMonths ? "Show pages" : "Show all"}</button></div><div className="finance-debt-table-wrap"><table><thead><tr><th>Month</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Balance</th><th>Status</th></tr></thead><tbody>{visibleDebtSchedule.map((installment) => <tr key={installment.number} className={installment.yearMonth === currentMonthIndex ? "is-current-month" : ""}><td>{installment.month}{installment.yearMonth === currentMonthIndex && <span className="finance-current-month-tag">Current</span>}</td><td>{money(installment.emi)}</td><td>{money(installment.principal)}</td><td>{money(installment.interest)}</td><td>{money(installment.balance)}</td><td><button type="button" className={`finance-payment-toggle ${installment.paid ? "is-paid" : ""}`} onClick={() => updateDebt({ paidMonths: installment.paid ? debtObjective.debt!.paidMonths.filter((month) => month !== installment.number) : [...debtObjective.debt!.paidMonths, installment.number] })}>{installment.paid ? "Paid" : "Mark paid"}</button></td></tr>)}</tbody></table></div></section>
            </> : <p className="finance-debt-validation">EMI must be at least {money(minimumEmi)} per month to repay the principal within {debtObjective.debt.termMonths} months.</p>}
          </>; })() : <p className="finance-empty-inline">Enter a principal amount to build this objective’s repayment schedule.</p>}
        </> : <section className="finance-empty"><h2>No Resources objects yet</h2><p>Add objects to the Resources mind map before setting up debt tracking.</p><Link href="/feedback-loop">Open Feedback Loops</Link></section>}
        {debtRows.length > 1 && <p className="finance-debt-count">{debtRows.length} objects have debt plans · showing {selectedDebtObject}.</p>}
      </section>}
    </section>
  </main></div>;
}
