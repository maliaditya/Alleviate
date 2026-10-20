"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Cake, Check, ChevronDown, Gift, Heart, Hourglass, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import AppSidebar from "../AppSidebar";

type CountdownKind = "countdown" | "anniversary" | "birthday" | "holiday";
type CountdownFilter = "all" | CountdownKind | "life";
type CountdownEvent = { id: string; name: string; date: string; kind: CountdownKind; reminder?: string; repeat?: string; display?: string };
const STORAGE_KEY = "alleviate-countdowns-v1";
const kinds: Array<{ id: CountdownKind; label: string; Icon: typeof Hourglass }> = [
  { id: "countdown", label: "Countdown", Icon: Hourglass },
  { id: "anniversary", label: "Anniversary", Icon: Heart },
  { id: "birthday", label: "Birthday", Icon: Cake },
  { id: "holiday", label: "Holiday", Icon: Gift },
];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day, 12); };
const dayDifference = (a: Date, b: Date) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
function getEventDay(event: CountdownEvent, today: Date) {
  const enteredDate = parseDate(event.date);
  const isBirthday = /\b(birthday|bday)\b/i.test(event.name);
  if (event.kind === "countdown" && !isBirthday) return dayDifference(enteredDate, today);
  let next = new Date(today.getFullYear(), enteredDate.getMonth(), enteredDate.getDate(), 12);
  if (dayDifference(next, today) < 0) next = new Date(today.getFullYear() + 1, enteredDate.getMonth(), enteredDate.getDate(), 12);
  return dayDifference(next, today);
}
const formatDate = (date: Date) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
function getProfileBirthDate() {
  try {
    const username = String(JSON.parse(localStorage.getItem("alleviate_current_user") || "null")?.username || "").trim().toLowerCase() || "guest";
    const profile = JSON.parse(localStorage.getItem(`alleviate-profile-v1:${username}`) || "{}");
    return typeof profile.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate) ? profile.birthDate : "";
  } catch { return ""; }
}

function getLifeMilestones(birthDate: string, today: Date) {
  if (!birthDate) return [];
  const birth = parseDate(birthDate);
  if (Number.isNaN(birth.getTime()) || birth > today) return [];
  return Array.from({ length: 8 }, (_, index) => (index + 2) * 10)
    .map((age) => {
      const year = birth.getFullYear() + age;
      const month = birth.getMonth();
      const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
      const date = new Date(year, month, Math.min(birth.getDate(), lastDayOfMonth), 12);
      return { age, date };
    })
    .filter(({ date }) => dayDifference(date, today) >= 0);
}

function getDistanceParts(start: Date, end: Date) {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  const anchor = new Date(start.getFullYear(), start.getMonth() + months, start.getDate(), 12);
  if (anchor > end) months -= 1;
  const monthDate = new Date(start.getFullYear(), start.getMonth() + months, start.getDate(), 12);
  const days = dayDifference(end, monthDate);
  const years = Math.floor(months / 12);
  return { years, months: months % 12, days };
}

export default function CountdownPage() {
  const [events, setEvents] = useState<CountdownEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<CountdownFilter>("all");
  const [profileBirthDate, setProfileBirthDate] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftKind, setDraftKind] = useState<CountdownKind>("countdown");
  const [draftName, setDraftName] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftReminder, setDraftReminder] = useState("day-and-3-days-early");
  const [draftRepeat, setDraftRepeat] = useState("yearly");
  const [draftDisplay, setDraftDisplay] = useState("on-day-smart-list");
  const [openDropdown, setOpenDropdown] = useState<"repeat" | "display" | null>(null);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) setEvents(saved.filter((event): event is CountdownEvent => event && typeof event.id === "string" && typeof event.name === "string" && typeof event.date === "string" && kinds.some((kind) => kind.id === event.kind)));
    } catch { /* Ignore invalid saved countdowns. */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); }, [events, ready]);
  useEffect(() => {
    const refreshBirthday = () => {
      const birthDate = getProfileBirthDate();
      setProfileBirthDate(birthDate);
      if (!birthDate) setFilter((current) => current === "life" ? "all" : current);
    };
    refreshBirthday();
    window.addEventListener("alleviate:profile-updated", refreshBirthday);
    window.addEventListener("alleviate:auth-change", refreshBirthday);
    window.addEventListener("storage", refreshBirthday);
    return () => {
      window.removeEventListener("alleviate:profile-updated", refreshBirthday);
      window.removeEventListener("alleviate:auth-change", refreshBirthday);
      window.removeEventListener("storage", refreshBirthday);
    };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("pointerdown", close); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", onKey); };
  }, [menuOpen]);
  useEffect(() => {
    if (!dialogOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { if (openDropdown) setOpenDropdown(null); else setDialogOpen(false); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen, openDropdown]);

  const today = useMemo(() => new Date(), [ready, events]);
  const visibleEvents = events.filter((event) => filter === "all" || event.kind === filter).sort((a, b) => getEventDay(a, today) - getEventDay(b, today));
  const lifeMilestones = getLifeMilestones(profileBirthDate, today);
  const openAdd = (kind: CountdownKind) => { setDraftKind(kind); setDraftName(""); setDraftDate(""); setDraftReminder("day-and-3-days-early"); setDraftRepeat(kind === "countdown" ? "none" : "yearly"); setDraftDisplay("on-day-smart-list"); setOpenDropdown(null); setError(""); setMenuOpen(false); setDialogOpen(true); };
  const addEvent = (event: FormEvent) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) { setError("Enter a name for this event."); return; }
    if (!draftDate) { setError("Choose a date."); return; }
    const isBirthday = draftKind === "countdown" && /\b(birthday|bday)\b/i.test(name);
    setEvents((current) => [...current, { id: crypto.randomUUID(), name, date: draftDate, kind: isBirthday ? "birthday" : draftKind, reminder: draftReminder, repeat: draftRepeat, display: draftDisplay }]);
    setDialogOpen(false);
  };
  const removeEvent = (id: string) => setEvents((current) => current.filter((event) => event.id !== id));

  return <main className="countdown-page">
    <AppSidebar active="countdown" />
    <div className="countdown-main">
      <header className="countdown-header">
        <div className="countdown-title-wrap"><h1>Countdown</h1><ChevronDown size={15}/></div>
        <div className="countdown-header-actions">
          <button type="button" className="countdown-add" aria-label="Add countdown" title="Add countdown" onClick={() => openAdd("countdown")}><Plus size={21}/></button>
          <div className="countdown-menu-wrap" ref={menuRef}>
            <button type="button" className="countdown-menu-button" aria-label="More countdown options" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={21}/></button>
            {menuOpen && <div className="countdown-context-menu" role="menu" aria-label="Add event type">{kinds.map(({ id, label, Icon }) => <button key={id} type="button" role="menuitem" onClick={() => openAdd(id)}><Icon size={16}/><span>{label}</span></button>)}</div>}
          </div>
        </div>
      </header>
      <section className="countdown-content">
        <nav className="countdown-tabs" aria-label="Filter countdowns">{[{ id: "all", label: "All" }, { id: "countdown", label: "Countdown" }, { id: "anniversary", label: "Anniversary" }, { id: "holiday", label: "Holiday" }, ...(profileBirthDate ? [{ id: "life", label: "Life" }] : [])].map(({ id, label }) => <button key={id} type="button" className={filter === id ? "is-active" : ""} onClick={() => setFilter(id as CountdownFilter)}>{label}</button>)}</nav>
        {filter === "life" ? !ready ? <div className="countdown-empty">Loading your life countdown…</div> : lifeMilestones.length ? <div className="countdown-grid countdown-life-grid">{lifeMilestones.map(({ age, date }) => {
          const distance = getDistanceParts(today, date);
          const totalDays = Math.max(0, dayDifference(date, today));
          const totalMonths = distance.years * 12 + distance.months;
          const totalWeeks = Math.floor(totalDays / 7);
          const yearsDisplay = `${distance.years}.${distance.months}`;
          return <article className="countdown-card countdown-life-card" key={age}>
            <div className="countdown-card-heading"><span className="countdown-event-icon is-birthday"><Cake size={13}/></span><strong>Age {age}</strong></div>
            <p className="countdown-life-date">Turns {age} on {formatDate(date)}</p>
            <div className="countdown-life-units">{[{ value: yearsDisplay, label: "Years" }, { value: totalMonths, label: "Months" }, { value: totalWeeks, label: "Weeks" }, { value: totalDays, label: "Days" }].map((unit) => <div key={unit.label}><strong>{unit.value}</strong><span>{unit.label}</span></div>)}</div>
          </article>;
        })}</div> : <div className="countdown-empty"><span className="countdown-empty-icon"><Cake size={22}/></span><h2>No upcoming life milestones</h2><p>Life countdowns are shown through age 90.</p></div> : !ready ? <div className="countdown-empty">Loading your dates…</div> : visibleEvents.length ? <div className="countdown-grid">{visibleEvents.map((event) => {
          const kind = kinds.find((item) => item.id === event.kind)!;
          const isBirthday = /\b(birthday|bday)\b/i.test(event.name);
          const Icon = isBirthday ? Cake : kind.Icon;
          const target = parseDate(event.date);
          const days = getEventDay(event, today);
          const repeatsYearly = event.kind !== "countdown" || isBirthday || event.repeat === "yearly";
          const dateLabel = new Date(today.getFullYear(), target.getMonth(), target.getDate(), 12);
          if (repeatsYearly && dayDifference(dateLabel, today) < 0) dateLabel.setFullYear(dateLabel.getFullYear() + 1);
          const distance = days < 0 ? getDistanceParts(target, today) : getDistanceParts(today, dateLabel);
          return <article className="countdown-card" key={event.id}>
            <div className="countdown-card-heading"><span className={`countdown-event-icon is-${isBirthday ? "birthday" : event.kind}`}><Icon size={13}/></span><strong>{event.name}</strong><button type="button" aria-label={`Delete ${event.name}`} title="Delete event" onClick={() => removeEvent(event.id)}><Trash2 size={14}/></button></div>
            <div className="countdown-number">{distance.years > 0 ? <><span>{distance.years}</span><small>Y</small>{distance.months > 0 && <><span>{distance.months}</span><small>M</small></>}{distance.days > 0 && <><span>{distance.days}</span><small>D</small></>}</> : distance.months > 0 ? <><span>{distance.months}</span><small>M</small>{distance.days > 0 && <><span>{distance.days}</span><small>D</small></>}</> : Math.abs(days)}</div>
            <p>{days < 0 && !repeatsYearly ? `Days since ${formatDate(target)}` : days === 0 ? "Today" : `Days until ${formatDate(dateLabel)}`}</p>
          </article>;
        })}</div> : <div className="countdown-empty"><span className="countdown-empty-icon"><Hourglass size={22}/></span><h2>{filter === "all" ? "No countdowns yet" : `No ${filter} dates yet`}</h2><p>Add an important date to see how many days remain.</p><button type="button" onClick={() => openAdd(filter === "all" ? "countdown" : filter)}><Plus size={15}/> Add a date</button></div>}
      </section>
    </div>
    {dialogOpen && <div className="countdown-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
      <form className="countdown-dialog" role="dialog" aria-modal="true" aria-labelledby="countdown-dialog-title" onSubmit={addEvent}>
        <header><h2 id="countdown-dialog-title">Add</h2><button type="button" className="countdown-dialog-close" aria-label="Close" onClick={() => setDialogOpen(false)}><X size={17}/></button></header>
        <div className="countdown-dialog-name-row"><span className={`countdown-dialog-kind-icon is-${draftKind}`}>{draftKind === "countdown" ? "⌛" : draftKind === "anniversary" ? "💞" : draftKind === "birthday" ? "🎂" : "🌺"}</span><input autoFocus aria-label="Name" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Name" maxLength={80}/></div>
        <label>Date<input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)}/></label>
        <label>Reminder<select value={draftReminder} onChange={(event) => setDraftReminder(event.target.value)}><option value="day-and-3-days-early">On the day, 3 days early</option><option value="on-day">On the day</option><option value="1-day-early">1 day early</option><option value="3-days-early">3 days early</option><option value="none">None</option></select></label>
        <label>Repeat<div className={`countdown-select-wrap${openDropdown === "repeat" ? " is-open" : ""}`}>
          <button type="button" className="countdown-select-button" aria-haspopup="listbox" aria-expanded={openDropdown === "repeat"} onClick={() => setOpenDropdown((open) => open === "repeat" ? null : "repeat")}>
            <span>{draftRepeat === "none" ? "None" : draftRepeat === "daily" ? "Daily" : draftRepeat === "weekly" ? `Weekly${draftDate ? ` (${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(parseDate(draftDate))})` : ""}` : draftRepeat === "monthly" ? `Monthly${draftDate ? ` (${parseDate(draftDate).getDate()}${parseDate(draftDate).getDate() % 10 === 1 && parseDate(draftDate).getDate() !== 11 ? "st" : parseDate(draftDate).getDate() % 10 === 2 && parseDate(draftDate).getDate() !== 12 ? "nd" : parseDate(draftDate).getDate() % 10 === 3 && parseDate(draftDate).getDate() !== 13 ? "rd" : "th"})` : ""}` : draftRepeat === "custom" ? "Custom" : `Yearly${draftDate ? ` (${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(parseDate(draftDate))})` : ""}`}</span><ChevronDown size={14}/>
          </button>
          {openDropdown === "repeat" && <div className="countdown-select-menu" role="listbox" aria-label="Repeat">
            {[{ value: "none", label: "None" }, { value: "daily", label: "Daily" }, { value: "weekly", label: `Weekly${draftDate ? ` (${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(parseDate(draftDate))})` : ""}` }, { value: "monthly", label: `Monthly${draftDate ? ` (${parseDate(draftDate).getDate()}${parseDate(draftDate).getDate() % 10 === 1 && parseDate(draftDate).getDate() !== 11 ? "st" : parseDate(draftDate).getDate() % 10 === 2 && parseDate(draftDate).getDate() !== 12 ? "nd" : parseDate(draftDate).getDate() % 10 === 3 && parseDate(draftDate).getDate() !== 13 ? "rd" : "th"})` : ""}` }, { value: "yearly", label: `Yearly${draftDate ? ` (${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(parseDate(draftDate))})` : ""}` }, { value: "custom", label: "Custom" }].map((option) => <button type="button" role="option" aria-selected={draftRepeat === option.value} className={draftRepeat === option.value ? "is-selected" : ""} key={option.value} onClick={() => { setDraftRepeat(option.value); setOpenDropdown(null); }}><span>{option.label}</span>{draftRepeat === option.value && <Check size={14}/>}</button>)}
          </div>}
        </div></label>
        <label>Type<select value={draftKind} onChange={(event) => { const kind = event.target.value as CountdownKind; setDraftKind(kind); if (kind !== "countdown" && draftRepeat === "none") setDraftRepeat("yearly"); }}><option value="countdown">Countdown</option><option value="anniversary">Anniversary</option><option value="birthday">Birthday</option><option value="holiday">Holiday</option></select></label>
        <label>Display<div className={`countdown-select-wrap${openDropdown === "display" ? " is-open" : ""}`}>
          <button type="button" className="countdown-select-button" aria-haspopup="listbox" aria-expanded={openDropdown === "display"} onClick={() => setOpenDropdown((open) => open === "display" ? null : "display")}>
            <span>{draftDisplay === "on-day-smart-list" ? "Show on the day in the Smart List" : draftDisplay === "3-days-early" ? "Show 3 days early in the Smart List" : draftDisplay === "7-days-early" ? "Show 7 days early in the Smart List" : draftDisplay === "always-smart-list" ? "Always show in the Smart List" : "Do not show"}</span><ChevronDown size={14}/>
          </button>
          {openDropdown === "display" && <div className="countdown-select-menu countdown-display-menu" role="listbox" aria-label="Display"><div className="countdown-select-menu-heading">In the Smart List</div>
            {[{ value: "on-day-smart-list", label: "On the day" }, { value: "3-days-early", label: "3 days early" }, { value: "7-days-early", label: "7 days early" }, { value: "always-smart-list", label: "Always show" }, { value: "hide-smart-list", label: "Do not show" }].map((option) => <button type="button" role="option" aria-selected={draftDisplay === option.value} className={draftDisplay === option.value ? "is-selected" : ""} key={option.value} onClick={() => { setDraftDisplay(option.value); setOpenDropdown(null); }}><span>{option.label}</span>{draftDisplay === option.value && <Check size={14}/>}</button>)}
          </div>}
        </div></label>
        {error && <p className="countdown-form-error" role="alert">{error}</p>}
        <footer><button type="submit" className="countdown-submit" disabled={!draftName.trim() || !draftDate}>Next</button><button type="button" className="countdown-cancel" onClick={() => setDialogOpen(false)}>Cancel</button></footer>
      </form>
    </div>}
  </main>;
}
