const EVENTS_KEY = "alleviate-calendar-events-v1";
const LOOPS_KEY = "alleviate-feedback-loops-v1";

type LinkedItem = { feedbackAction?: { object?: string; actionId?: string }; title?: string };
type FeedbackLoopStore = Record<string, { actions?: Array<{ id?: string; name?: string }> }>;

/** Repair older linked schedules that still contain a copied, stale action name. */
export function syncAllFeedbackActionTitles() {
  try {
    const rawLoops = JSON.parse(localStorage.getItem(LOOPS_KEY) || "{}");
    const loops: FeedbackLoopStore = rawLoops && typeof rawLoops === "object" && !Array.isArray(rawLoops) ? rawLoops : {};
    const titles = new Map<string, string>();
    Object.entries(loops).forEach(([object, loop]) => loop.actions?.forEach((action) => {
      if (action.id && action.name?.trim()) titles.set(`${object.trim().toLocaleLowerCase()}\u0000${action.id}`, action.name.trim());
    }));
    const rawEvents = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
    if (!Array.isArray(rawEvents)) return;
    let changed = false;
    const events = rawEvents.map((item) => {
      const event = item as LinkedItem;
      const objectKey = event.feedbackAction?.object?.trim().toLocaleLowerCase();
      const actionId = event.feedbackAction?.actionId;
      const title = objectKey && actionId ? titles.get(`${objectKey}\u0000${actionId}`) : undefined;
      if (!title || event.title === title) return item;
      changed = true;
      return { ...event, title };
    });
    if (changed) {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
      window.dispatchEvent(new Event("calendar-events-updated"));
    }
  } catch { /* Leave existing labels alone if browser storage is unavailable. */ }
}

/** Keep a linked action's label identical in its feedback loop and scheduled entries. */
export function syncFeedbackActionTitle(object: string, actionId: string, title: string) {
  const objectKey = object.trim().toLocaleLowerCase();
  const nextTitle = title.trim();
  if (!objectKey || !actionId || !nextTitle) return;

  try {
    const rawLoops = JSON.parse(localStorage.getItem(LOOPS_KEY) || "{}");
    const loops: FeedbackLoopStore = rawLoops && typeof rawLoops === "object" && !Array.isArray(rawLoops) ? rawLoops : {};
    const loop = loops[objectKey];
    if (loop?.actions?.some((action) => action.id === actionId && action.name !== nextTitle)) {
      loops[objectKey] = { ...loop, actions: loop.actions?.map((action) => action.id === actionId ? { ...action, name: nextTitle } : action) };
      localStorage.setItem(LOOPS_KEY, JSON.stringify(loops));
      window.dispatchEvent(new Event("feedback-loops-updated"));
    }
  } catch { /* Keep the task title usable if local storage is unavailable. */ }

  try {
    const rawEvents = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
    if (!Array.isArray(rawEvents)) return;
    let changed = false;
    const events = rawEvents.map((item) => {
      const event = item as LinkedItem;
      if (event.feedbackAction?.object?.trim().toLocaleLowerCase() !== objectKey || event.feedbackAction.actionId !== actionId || event.title === nextTitle) return item;
      changed = true;
      return { ...event, title: nextTitle };
    });
    if (changed) {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
      window.dispatchEvent(new Event("calendar-events-updated"));
    }
  } catch { /* Keep the task title usable if local storage is unavailable. */ }
}
