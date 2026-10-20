"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Activity, Apple, Baby, Banknote, BedDouble, Bike, BookOpen, Brain, Briefcase, BriefcaseBusiness, Building, Building2, Bus, Camera, Car, ChartNoAxesCombined, Check, ChevronDown, ChevronUp, Circle, CreditCard, Dumbbell, Flower2, Footprints, Gamepad2, GraduationCap, HandHeart, Heart, HeartHandshake, House, KeyRound, Laptop, Languages, Lightbulb, Mountain, MousePointer2, Music, NotebookPen, Palette, PiggyBank, Plane, Presentation, Receipt, Settings2, Sofa, Target, TrainFront, Trees, TrendingUp, Utensils, UserRound, Users, Wallet, Ticket, type LucideIcon } from "lucide-react";

const RESOURCES_MAP_ID = "alleviate-resources-default";
const OBJECTS_KEY = `${RESOURCES_MAP_ID}-objects`;
const LEGACY_OBJECTS_KEY = "alleviate-wisemapping-objects-v1";
const OBJECT_IDS_KEY = `${RESOURCES_MAP_ID}-object-ids`;
const ACTION_NODE_IDS_KEY = `${RESOURCES_MAP_ID}-feedback-action-node-ids`;
const OBJECT_ICONS_KEY = `${RESOURCES_MAP_ID}-object-icons`;
const SEEDED_KEY = `${RESOURCES_MAP_ID}-default-seeded`;
const FEEDBACK_LOOPS_KEY = "alleviate-feedback-loops-v1";
const CALENDAR_EVENTS_KEY = "alleviate-calendar-events-v1";
const SCHEDULED_QUADRANTS_KEY = "alleviate-eisenhower-calendar-quadrants-v1";
const DEFAULT_OBJECTS = ["Body", "Mind", "Job", "Freelancing", "Heart", "House", "Land", "Bike", "Car"];
const OBJECT_ICONS: Record<string, LucideIcon> = {
  body: Dumbbell,
  mind: Brain,
  job: Briefcase,
  freelancing: Laptop,
  heart: Heart,
  house: House,
  land: Mountain,
  bike: Bike,
  car: Car,
};
const DEFAULT_OBJECT_ICON_IDS: Record<string, string> = { body: "dumbbell", mind: "brain", job: "briefcase", freelancing: "laptop", heart: "heart", house: "house", land: "mountain", bike: "bike", car: "car" };
const ICON_CATEGORIES = ["Wellbeing", "Work", "Relationships", "Home", "Money", "Transport", "Growth", "Leisure"] as const;
type IconCategory = typeof ICON_CATEGORIES[number];
const ICON_CATEGORY_BY_OBJECT: Record<string, IconCategory> = { body: "Wellbeing", mind: "Wellbeing", job: "Work", freelancing: "Work", heart: "Relationships", house: "Home", land: "Home", bike: "Transport", car: "Transport" };
const OBJECT_ICON_OPTIONS: Array<{ id: string; label: string; category: IconCategory; Icon: LucideIcon }> = [
  { id: "dumbbell", label: "Fitness", category: "Wellbeing", Icon: Dumbbell }, { id: "activity", label: "Activity", category: "Wellbeing", Icon: Activity }, { id: "brain", label: "Mind", category: "Wellbeing", Icon: Brain }, { id: "bed-double", label: "Sleep", category: "Wellbeing", Icon: BedDouble }, { id: "apple", label: "Nutrition", category: "Wellbeing", Icon: Apple }, { id: "utensils", label: "Meals", category: "Wellbeing", Icon: Utensils }, { id: "circle", label: "Generic", category: "Wellbeing", Icon: Circle },
  { id: "briefcase", label: "Career", category: "Work", Icon: Briefcase }, { id: "laptop", label: "Freelance", category: "Work", Icon: Laptop }, { id: "building2", label: "Office", category: "Work", Icon: Building2 }, { id: "briefcase-business", label: "Business", category: "Work", Icon: BriefcaseBusiness }, { id: "presentation", label: "Present", category: "Work", Icon: Presentation }, { id: "chart", label: "Projects", category: "Work", Icon: ChartNoAxesCombined }, { id: "circle", label: "Generic", category: "Work", Icon: Circle },
  { id: "heart", label: "Love", category: "Relationships", Icon: Heart }, { id: "users", label: "Family", category: "Relationships", Icon: Users }, { id: "heart-handshake", label: "Connection", category: "Relationships", Icon: HeartHandshake }, { id: "user-round", label: "Friend", category: "Relationships", Icon: UserRound }, { id: "baby", label: "Children", category: "Relationships", Icon: Baby }, { id: "hand-heart", label: "Care", category: "Relationships", Icon: HandHeart }, { id: "circle", label: "Generic", category: "Relationships", Icon: Circle },
  { id: "house", label: "Home", category: "Home", Icon: House }, { id: "building", label: "Property", category: "Home", Icon: Building }, { id: "mountain", label: "Land", category: "Home", Icon: Mountain }, { id: "trees", label: "Garden", category: "Home", Icon: Trees }, { id: "key-round", label: "Keys", category: "Home", Icon: KeyRound }, { id: "sofa", label: "Living", category: "Home", Icon: Sofa }, { id: "circle", label: "Generic", category: "Home", Icon: Circle },
  { id: "wallet", label: "Wallet", category: "Money", Icon: Wallet }, { id: "piggy-bank", label: "Savings", category: "Money", Icon: PiggyBank }, { id: "credit-card", label: "Card", category: "Money", Icon: CreditCard }, { id: "banknote", label: "Income", category: "Money", Icon: Banknote }, { id: "receipt", label: "Bills", category: "Money", Icon: Receipt }, { id: "trending-up", label: "Invest", category: "Money", Icon: TrendingUp }, { id: "circle", label: "Generic", category: "Money", Icon: Circle },
  { id: "bike", label: "Bike", category: "Transport", Icon: Bike }, { id: "car", label: "Car", category: "Transport", Icon: Car }, { id: "bus", label: "Bus", category: "Transport", Icon: Bus }, { id: "plane", label: "Travel", category: "Transport", Icon: Plane }, { id: "train", label: "Train", category: "Transport", Icon: TrainFront }, { id: "footprints", label: "Walking", category: "Transport", Icon: Footprints }, { id: "circle", label: "Generic", category: "Transport", Icon: Circle },
  { id: "book-open", label: "Study", category: "Growth", Icon: BookOpen }, { id: "graduation-cap", label: "Learning", category: "Growth", Icon: GraduationCap }, { id: "lightbulb", label: "Ideas", category: "Growth", Icon: Lightbulb }, { id: "languages", label: "Language", category: "Growth", Icon: Languages }, { id: "notebook-pen", label: "Journal", category: "Growth", Icon: NotebookPen }, { id: "target", label: "Goals", category: "Growth", Icon: Target }, { id: "circle", label: "Generic", category: "Growth", Icon: Circle },
  { id: "palette", label: "Art", category: "Leisure", Icon: Palette }, { id: "music", label: "Music", category: "Leisure", Icon: Music }, { id: "camera", label: "Photography", category: "Leisure", Icon: Camera }, { id: "gamepad2", label: "Games", category: "Leisure", Icon: Gamepad2 }, { id: "ticket", label: "Events", category: "Leisure", Icon: Ticket }, { id: "flower2", label: "Hobbies", category: "Leisure", Icon: Flower2 }, { id: "circle", label: "Generic", category: "Leisure", Icon: Circle },
];
const QUADRANT_COLORS: Record<string, string> = { do: "#fb596b", schedule: "#f5ae18", delegate: "#4779ff", eliminate: "#32c9a6" };

type Topic = { id: string; text: string; children: Topic[]; isObject?: boolean };
type PositionedTopic = Topic & { x: number; y: number; width: number; height: number; color: string };
type ObjectFeedback = { objective?: string; objectiveType?: string; actions?: Array<{ id?: string; name?: string; details?: string; complete?: boolean; completedDate?: string }> };
type ScheduledTask = { id?: string; date?: string; repeat?: { interval?: number; until?: string; skipWeekdays?: number[] }; completedDates?: string[]; feedbackAction?: { object?: string; actionId?: string } };
type TaskProgress = Record<string, { completed: number; total: number }>;
const BRANCH_COLORS = ["#e84f8a", "#8d5ceb", "#f2a21c", "#e64b44", "#27aaa1", "#528dd7"];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const localDate = (key: string) => new Date(`${key}T12:00:00`);
function scheduledOn(task: ScheduledTask, day: string) {
  if (!task.date || day < task.date || (task.repeat?.until && day > task.repeat.until)) return false;
  if (task.repeat?.skipWeekdays?.includes(localDate(day).getDay())) return false;
  if (!task.repeat) return task.date === day;
  const daysApart = Math.round((localDate(day).getTime() - localDate(task.date).getTime()) / 86400000);
  return daysApart >= 0 && daysApart % Math.max(1, task.repeat.interval || 1) === 0;
}

function createFallbackMap(): Topic {
  let objects = DEFAULT_OBJECTS;
  try {
    const saved = localStorage.getItem(OBJECTS_KEY) ?? localStorage.getItem(LEGACY_OBJECTS_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      objects = Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map((name) => name.trim()) : [];
      if (!objects.length && !localStorage.getItem(SEEDED_KEY)) objects = DEFAULT_OBJECTS;
    }
  } catch { /* Show the central topic when storage is unavailable. */ }
  const objectSet = new Set(objects.map((name) => name.toLocaleLowerCase()));
  const object = (id: number, text: string): Topic => ({ id: String(id), text, children: [], isObject: objectSet.has(text.toLocaleLowerCase()) });
  const group = (id: number, text: string, children: Topic[]): Topic => ({ id: String(id), text, children });
  const knownNames = new Set(DEFAULT_OBJECTS.map((name) => name.toLocaleLowerCase()));
  const defaultChildren = [
    group(2, "Personal Wellbeing", [object(3, "Body"), object(4, "Mind")]),
    group(5, "Value Creation", [object(6, "Job"), object(7, "Freelancing")]),
    group(8, "Relations", [object(9, "Heart")]),
    group(10, "Resources", [
      group(11, "Property", [object(12, "House"), object(13, "Land")]),
      group(14, "Vehicles", [object(15, "Bike"), object(16, "Car")]),
    ]),
  ];
  const extras = objects.filter((name) => !knownNames.has(name.toLocaleLowerCase())).map((name, index) => object(17 + index, name));
  return { id: "1", text: "You", children: [...defaultChildren, ...extras] };
}

function parseTopic(element: Element, objectIds: Set<string>, hiddenTopicIds: Set<string>): Topic {
  const text = element.getAttribute("text")?.trim() || "Untitled";
  return {
    id: element.getAttribute("id") || crypto.randomUUID(),
    text,
    isObject: objectIds.has(element.getAttribute("id") || ""),
    children: Array.from(element.children).filter((child) => child.tagName.toLocaleLowerCase() === "topic" && !child.hasAttribute("feedback-action-id") && !hiddenTopicIds.has(child.getAttribute("id") || "")).map((child) => parseTopic(child, objectIds, hiddenTopicIds)),
  };
}

function readResourceMap(): Topic {
  try {
    const savedObjects = localStorage.getItem(OBJECTS_KEY) ?? localStorage.getItem(LEGACY_OBJECTS_KEY);
    const parsedObjects = savedObjects ? JSON.parse(savedObjects) : [];
    let parsedIds: unknown = {};
    try { parsedIds = JSON.parse(localStorage.getItem(OBJECT_IDS_KEY) || "{}"); } catch { /* Legacy maps use object names below. */ }
    const objectIds = new Set(parsedIds && typeof parsedIds === "object" && !Array.isArray(parsedIds)
      ? Object.values(parsedIds).filter((id): id is string => typeof id === "string")
      : []);
    let parsedActionNodeIds: unknown = {};
    try { parsedActionNodeIds = JSON.parse(localStorage.getItem(ACTION_NODE_IDS_KEY) || "{}"); } catch { /* Legacy maps do not have generated action topics. */ }
    const hiddenTopicIds = new Set(parsedActionNodeIds && typeof parsedActionNodeIds === "object" && !Array.isArray(parsedActionNodeIds)
      ? Object.values(parsedActionNodeIds).flatMap((actions) => actions && typeof actions === "object" && !Array.isArray(actions) ? Object.values(actions).filter((id): id is string => typeof id === "string") : [])
      : []);
    const objectNames = new Set(Array.isArray(parsedObjects)
      ? parsedObjects.filter((name): name is string => typeof name === "string").map((name) => name.trim().toLocaleLowerCase())
      : []);
    const xml = localStorage.getItem(`${RESOURCES_MAP_ID}-xml`);
    if (xml) {
      const document = new DOMParser().parseFromString(xml, "text/xml");
      if (!document.querySelector("parsererror")) {
        const root = Array.from(document.querySelectorAll("topic")).find((topic) => topic.getAttribute("central") === "true") || document.querySelector("topic");
        if (root && !Array.from(root.children).some((child) => child.tagName.toLocaleLowerCase() === "topic") && !localStorage.getItem(SEEDED_KEY)) return createFallbackMap();
        if (root) {
          const parsed = parseTopic(root, objectIds, hiddenTopicIds);
          if (!objectIds.size) {
            const markLegacyObjects = (parent: Topic) => parent.children.forEach((child) => {
              child.isObject = objectNames.has(child.text.toLocaleLowerCase());
              markLegacyObjects(child);
            });
            markLegacyObjects(parsed);
          }
          return parsed;
        }
      }
    }
  } catch { /* Fall back to the shared object list. */ }
  return createFallbackMap();
}

function countLeaves(topic: Topic): number {
  return topic.children.length ? topic.children.reduce((sum, child) => sum + countLeaves(child), 0) : 1;
}

function maxDepth(topic: Topic): number {
  return topic.children.length ? 1 + Math.max(...topic.children.map(maxDepth)) : 0;
}

function findTopicById(topic: Topic | null, id: string | null): Topic | undefined {
  if (!topic || !id) return undefined;
  if (topic.id === id) return topic;
  for (const child of topic.children) {
    const match = findTopicById(child, id);
    if (match) return match;
  }
  return undefined;
}

function getCurrentWeekDays() {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)));
}

function getNodeWidth(text: string) {
  return Math.min(220, Math.max(58, text.length * 7 + 22));
}

function getActionPanelHeight(actionCount: number) {
  return actionCount ? Math.min(320, 54 + actionCount * 32) : 0;
}

function layoutTree(root: Topic, taskProgress: TaskProgress, expandedPanelHeights: Record<string, number>) {
  let objectIndex = 0;
  const nextObjectColor = () => BRANCH_COLORS[objectIndex++ % BRANCH_COLORS.length];
  // Keep the default Resources map's actual left/right split. The serialized
  // topic order can change independently of a branch's side, so side is
  // assigned by its top-level branch rather than by array position.
  const leftSideBranches = new Set(["resources", "value creation"]);
  const rightSideBranches = new Set(["personal wellbeing", "relations"]);
  const branches = root.children.map((topic) => {
    const branchName = topic.text.trim().toLocaleLowerCase().replace(/\s+/g, " ");
    const side = leftSideBranches.has(branchName) ? -1 : 1;
    return {
      topic,
      side,
      color: topic.isObject ? nextObjectColor() : "#778391",
    };
  });
  const sideGroups = [-1, 1].map((side) => branches.filter((branch) => branch.side === side).reverse());
  const expandedExtra = (topic: Topic): number => expandedPanelHeights[topic.id] ? expandedPanelHeights[topic.id] + 54 : topic.children.reduce((sum, child) => sum + expandedExtra(child), 0);
  const branchHeight = (topic: Topic) => countLeaves(topic) * 56 + expandedExtra(topic);
  const sideHeights = sideGroups.map((groups) => groups.reduce((sum, branch) => sum + branchHeight(branch.topic), 0) + Math.max(0, groups.length - 1) * 30);
  const depth = maxDepth(root);
  const height = Math.max(340, Math.max(...sideHeights, 0) + 84, root.children.length ? 0 : 340);
  const radius = 105 + Math.max(0, depth - 1) * 174;
  const width = Math.max(920, radius * 2 + 500);
  const centerX = width / 2;
  const centerY = height / 2;
  const positions: PositionedTopic[] = [];
  const links: Array<{ from: PositionedTopic; to: PositionedTopic }> = [];
  const rootPosition: PositionedTopic = { ...root, x: centerX, y: centerY, width: getNodeWidth(root.text), height: 40, color: "#f4c644" };
  positions.push(rootPosition);

  const visit = (topic: Topic, level: number, side: number, color: string, yStart: number, leafState: { index: number; extraOffset: number }): PositionedTopic => {
    const nodeColor = topic.isObject ? nextObjectColor() : color;
    const children = topic.children.map((child) => visit(child, level + 1, side, nodeColor, yStart, leafState));
    const y = children.length
      ? children.reduce((sum, child) => sum + child.y, 0) / children.length
      : yStart + 28 + leafState.index++ * 56 + leafState.extraOffset;
    if (!children.length && expandedPanelHeights[topic.id]) leafState.extraOffset += expandedPanelHeights[topic.id] + 54;
    const x = centerX + side * (level === 1 ? 105 : 105 + (level - 1) * 174);
    const width = getNodeWidth(topic.text) + (topic.isObject ? 28 : 0) + (topic.isObject && taskProgress[topic.text.trim().toLocaleLowerCase()] ? 34 : 0);
    const positioned = { ...topic, x, y, width, height: 36, color: nodeColor };
    positions.push(positioned);
    if (level === 1) links.push({ from: rootPosition, to: positioned });
    children.forEach((child) => links.push({ from: positioned, to: child }));
    return positioned;
  };

  sideGroups.forEach((groups, groupIndex) => {
    const sideHeight = sideHeights[groupIndex];
    const groupGap = 30;
    let yStart = (height - sideHeight) / 2;
    groups.forEach((branch) => {
      const currentBranchHeight = branchHeight(branch.topic);
      const state = { index: 0, extraOffset: 0 };
      visit(branch.topic, 1, branch.side, branch.color, yStart, state);
      yStart += currentBranchHeight + groupGap;
    });
  });
  const expandedNodes = positions.filter((node) => expandedPanelHeights[node.id]);
  const padding = expandedNodes.length ? 160 : 96;
  const expandedPanelLeft = Math.min(...expandedNodes.filter((node) => node.x < centerX).map((node) => node.x - node.width / 2 - 14 - 310), Number.POSITIVE_INFINITY);
  const expandedPanelRight = Math.max(...expandedNodes.filter((node) => node.x >= centerX).map((node) => node.x + node.width / 2 + 14 + 310), Number.NEGATIVE_INFINITY);
  const left = Math.min(...positions.map((node) => node.x - node.width / 2), expandedPanelLeft) - padding;
  const top = Math.min(...positions.map((node) => node.y)) - padding;
  const right = Math.max(...positions.map((node) => node.x + node.width / 2), expandedPanelRight) + padding;
  const panelBottom = Math.max(0, ...expandedNodes.map((node) => node.y + 24 + expandedPanelHeights[node.id]));
  const bottom = Math.max(Math.max(...positions.map((node) => node.y + node.height)), panelBottom) + padding;
  return { viewBox: `${left} ${top} ${right - left} ${bottom - top}`, positions, links };
}

export default function ResourceMindMapPreview() {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [feedbackLoops, setFeedbackLoops] = useState<Record<string, ObjectFeedback>>({});
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [scheduledQuadrants, setScheduledQuadrants] = useState<Record<string, string>>({});
  const [objectIcons, setObjectIcons] = useState<Record<string, string>>({});
  const [hoveredObject, setHoveredObject] = useState<string | null>(null);
  const [expandedObjectIds, setExpandedObjectIds] = useState<string[]>([]);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconCategory, setIconCategory] = useState<IconCategory>("Wellbeing");
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const refresh = useCallback(() => setTopic(readResourceMap()), []);
  const refreshFeedback = useCallback(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(FEEDBACK_LOOPS_KEY) || "{}");
      setFeedbackLoops(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {});
    } catch { setFeedbackLoops({}); }
  }, []);
  const refreshScheduledTasks = useCallback(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CALENDAR_EVENTS_KEY) || "[]");
      setScheduledTasks(Array.isArray(stored) ? stored.filter((event): event is ScheduledTask => Boolean(event && typeof event === "object" && event.feedbackAction?.object && event.feedbackAction?.actionId)) : []);
    } catch { setScheduledTasks([]); }
  }, []);
  const refreshScheduledQuadrants = useCallback(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SCHEDULED_QUADRANTS_KEY) || "{}");
      setScheduledQuadrants(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {});
    } catch { setScheduledQuadrants({}); }
  }, []);
  const refreshObjectIcons = useCallback(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(OBJECT_ICONS_KEY) || "{}");
      setObjectIcons(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {});
    } catch { setObjectIcons({}); }
  }, []);

  useEffect(() => {
    refresh();
    refreshFeedback();
    refreshScheduledTasks();
    refreshScheduledQuadrants();
    refreshObjectIcons();
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === `${RESOURCES_MAP_ID}-xml` || event.key === OBJECTS_KEY || event.key === LEGACY_OBJECTS_KEY || event.key === OBJECT_IDS_KEY || event.key === SEEDED_KEY) refresh();
      if (!event.key || event.key === FEEDBACK_LOOPS_KEY) refreshFeedback();
      if (!event.key || event.key === CALENDAR_EVENTS_KEY) refreshScheduledTasks();
      if (!event.key || event.key === SCHEDULED_QUADRANTS_KEY) refreshScheduledQuadrants();
      if (!event.key || event.key === OBJECT_ICONS_KEY) refreshObjectIcons();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("resources-mindmap-updated", refresh);
    window.addEventListener("feedback-loops-updated", refreshFeedback);
    window.addEventListener("calendar-events-updated", refreshScheduledTasks);
    window.addEventListener("eisenhower-quadrants-updated", refreshScheduledQuadrants);
    window.addEventListener("resource-object-icons-updated", refreshObjectIcons);
    window.addEventListener("storage", refreshFeedback);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("resources-mindmap-updated", refresh);
      window.removeEventListener("feedback-loops-updated", refreshFeedback);
      window.removeEventListener("calendar-events-updated", refreshScheduledTasks);
      window.removeEventListener("eisenhower-quadrants-updated", refreshScheduledQuadrants);
      window.removeEventListener("resource-object-icons-updated", refreshObjectIcons);
      window.removeEventListener("storage", refreshFeedback);
    };
  }, [refresh, refreshFeedback, refreshScheduledTasks, refreshScheduledQuadrants, refreshObjectIcons]);

  const taskProgress = useMemo(() => {
    const idsByObject = new Map<string, Set<string>>();
    scheduledTasks.forEach((task) => {
      const objectKey = task.feedbackAction?.object?.trim().toLocaleLowerCase();
      const actionId = task.feedbackAction?.actionId;
      if (!objectKey || !actionId) return;
      const ids = idsByObject.get(objectKey) || new Set<string>();
      ids.add(actionId);
      idsByObject.set(objectKey, ids);
    });
    return Object.fromEntries(Array.from(idsByObject, ([objectKey, ids]) => {
      const actions = feedbackLoops[objectKey]?.actions || [];
      const completed = Array.from(ids).filter((id) => actions.find((action) => (action as { id?: string }).id === id)?.complete).length;
      return [objectKey, { completed, total: ids.size }];
    })) as TaskProgress;
  }, [scheduledTasks, feedbackLoops]);
  const expandedPanelHeights = useMemo(() => Object.fromEntries(expandedObjectIds.flatMap((id) => {
    const expandedTopic = findTopicById(topic, id);
    if (!expandedTopic) return [];
    const key = expandedTopic.text.trim().toLocaleLowerCase();
    const count = (feedbackLoops[key]?.actions || []).filter((action) => action.id && (action.name?.trim() || action.details?.trim())).length;
    const height = getActionPanelHeight(count);
    return height ? [[id, height] as const] : [];
  })), [topic, feedbackLoops, expandedObjectIds]);
  const layout = useMemo(() => topic ? layoutTree(topic, taskProgress, expandedPanelHeights) : null, [topic, taskProgress, expandedPanelHeights]);
  const hoveredNode = layout?.positions.find((node) => node.id === hoveredObject);
  const hoveredObjectKey = hoveredNode?.text.trim().toLocaleLowerCase() || "";
  const hoveredIconId = hoveredNode ? objectIcons[hoveredObjectKey] || DEFAULT_OBJECT_ICON_IDS[hoveredObjectKey] || "circle" : "circle";
  const saveObjectIcon = (name: string, iconId: string) => {
    const key = name.trim().toLocaleLowerCase();
    const next = { ...objectIcons, [key]: iconId };
    try { localStorage.setItem(OBJECT_ICONS_KEY, JSON.stringify(next)); } catch { /* Keep the icon change visible for this session. */ }
    setObjectIcons(next);
    window.dispatchEvent(new Event("resource-object-icons-updated"));
    setIconPickerOpen(false);
  };
  const feedback = hoveredNode?.isObject ? feedbackLoops[hoveredNode.text.trim().toLocaleLowerCase()] : undefined;
  const today = dateKey(new Date());
  const currentWeekDays = getCurrentWeekDays();
  const objectKey = hoveredNode?.text.trim().toLocaleLowerCase();
  const actions = feedback?.actions?.filter((action) => (action?.name?.trim() || action?.details?.trim()) && action.id && scheduledTasks.some((task) => task.feedbackAction?.object?.trim().toLocaleLowerCase() === objectKey && task.feedbackAction?.actionId === action.id && scheduledOn(task, today))) || [];
  const objective = feedback?.objective?.trim();
  const objectActions = feedback?.actions?.filter((action) => action.id && (action.name?.trim() || action.details?.trim())) || [];
  const hasFeedbackDetails = Boolean(objective || actions.length || objectActions.length);
  const showFeedbackCard = Boolean(hoveredNode && hasFeedbackDetails);
  const toggleAction = (objectName: string, actionId: string, complete: boolean) => {
    if (!actionId) return;
    const key = objectName.trim().toLocaleLowerCase();
    try {
      const saved = JSON.parse(localStorage.getItem(FEEDBACK_LOOPS_KEY) || "{}");
      const current = saved && typeof saved === "object" && !Array.isArray(saved) ? saved as Record<string, ObjectFeedback> : feedbackLoops;
      const loop = current[key];
      const action = loop?.actions?.find((item) => item.id === actionId);
      if (!loop || !action) return;
      const now = new Date();
      const completedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const next = {
        ...current,
        [key]: {
          ...loop,
          actions: loop.actions?.map((item) => item.id === actionId ? { ...item, complete, completedDate: complete ? completedDate : undefined } : item),
        },
      };
      localStorage.setItem(FEEDBACK_LOOPS_KEY, JSON.stringify(next));
      setFeedbackLoops(next);
      window.dispatchEvent(new Event("feedback-loops-updated"));
      const calendar = JSON.parse(localStorage.getItem(CALENDAR_EVENTS_KEY) || "[]");
      if (Array.isArray(calendar)) {
        const nextCalendar = calendar.map((task) => {
          if (task?.feedbackAction?.object?.trim().toLocaleLowerCase() !== key || task.feedbackAction?.actionId !== actionId || !scheduledOn(task, completedDate)) return task;
          const dates = new Set(Array.isArray(task.completedDates) ? task.completedDates : []);
          if (complete) dates.add(completedDate); else dates.delete(completedDate);
          return { ...task, completedDates: Array.from(dates) };
        });
        localStorage.setItem(CALENDAR_EVENTS_KEY, JSON.stringify(nextCalendar));
        setScheduledTasks(nextCalendar.filter((task): task is ScheduledTask => Boolean(task && typeof task === "object" && task.feedbackAction?.object && task.feedbackAction?.actionId)));
        window.dispatchEvent(new Event("calendar-events-updated"));
      }
    } catch { /* Leave the feedback card usable if browser storage is unavailable. */ }
  };
  // Reserve enough SVG space for the heading and objective as well as the
  // action rows. The old estimate only accounted for actions, so objective
  // text could extend past the foreignObject and get clipped at the stage edge.
  const cardHeight = Math.min(520, 190 + actions.length * 64 + (iconPickerOpen ? 128 : 0));
  let cardPosition: { x: number; y: number } | null = null;
  if (layout && hoveredNode && showFeedbackCard) {
    const [left, top, viewWidth, viewHeight] = layout.viewBox.split(" ").map(Number);
    const cardWidth = 260;
    const padding = 24;
    // SVG coordinates are scaled and letterboxed by preserveAspectRatio="xMidYMid meet".
    // Clamp against the actually visible map area so the HTML popup cannot slide
    // beneath the fixed sidebar or beyond the stage on narrow screens.
    const stageRect = stageRef.current?.getBoundingClientRect();
    const matrix = svgRef.current?.getScreenCTM();
    let visibleLeft = left + padding;
    let visibleTop = top + padding;
    let visibleRight = left + viewWidth - padding;
    let visibleBottom = top + viewHeight - padding;
    if (stageRect && matrix) {
      // getScreenCTM includes the SVG viewBox fit and the preview's CSS zoom.
      // Convert the real viewport inset back to SVG coordinates before clamping.
      const inverse = matrix.inverse();
      const upperLeft = new DOMPoint(stageRect.left + padding, stageRect.top + padding).matrixTransform(inverse);
      const lowerRight = new DOMPoint(stageRect.right - padding, stageRect.bottom - padding).matrixTransform(inverse);
      visibleLeft = upperLeft.x;
      visibleTop = upperLeft.y;
      visibleRight = lowerRight.x;
      visibleBottom = lowerRight.y;
    }
    const clampX = (x: number) => Math.max(visibleLeft, Math.min(visibleRight - cardWidth, x));
    const clampY = (y: number) => Math.max(visibleTop, Math.min(visibleBottom - cardHeight, y));
    const candidates = [
      { x: clampX(hoveredNode.x + hoveredNode.width / 2 + 18), y: clampY(hoveredNode.y + hoveredNode.height / 2 - cardHeight / 2) },
      { x: clampX(hoveredNode.x - hoveredNode.width / 2 - cardWidth - 18), y: clampY(hoveredNode.y + hoveredNode.height / 2 - cardHeight / 2) },
      { x: clampX(hoveredNode.x - cardWidth / 2), y: clampY(hoveredNode.y + hoveredNode.height + 18) },
      { x: clampX(hoveredNode.x - cardWidth / 2), y: clampY(hoveredNode.y - cardHeight - 18) },
    ];
    const overlapScore = (candidate: { x: number; y: number }) => {
      let score = layout.positions.reduce((total, node) => {
        if (node.id === hoveredNode.id) return total;
        const nodeLeft = node.x - node.width / 2 - 12;
        const nodeRight = node.x + node.width / 2 + 12;
        const nodeTop = node.y - 12;
        const nodeBottom = node.y + node.height + 12;
        const overlapWidth = Math.max(0, Math.min(candidate.x + cardWidth, nodeRight) - Math.max(candidate.x, nodeLeft));
        const overlapHeight = Math.max(0, Math.min(candidate.y + cardHeight, nodeBottom) - Math.max(candidate.y, nodeTop));
        return total + overlapWidth * overlapHeight * 5;
      }, 0);
      const hoveredPanelHeight = expandedPanelHeights[hoveredNode.id] || 0;
      if (hoveredPanelHeight > 0) {
        const onLeftSide = hoveredNode.x < layout.positions[0].x;
        const panelLeft = onLeftSide ? hoveredNode.x - hoveredNode.width / 2 - 14 - 310 : hoveredNode.x + hoveredNode.width / 2 + 14;
        const panelTop = hoveredNode.y + 24;
        const overlapWidth = Math.max(0, Math.min(candidate.x + cardWidth, panelLeft + 310) - Math.max(candidate.x, panelLeft));
        const overlapHeight = Math.max(0, Math.min(candidate.y + cardHeight, panelTop + hoveredPanelHeight) - Math.max(candidate.y, panelTop));
        score += overlapWidth * overlapHeight * 5;
      }
      return score;
    };
    cardPosition = candidates.reduce((best, candidate) => overlapScore(candidate) < overlapScore(best) ? candidate : best);
  }

  return (
    <section className="resource-map-preview" aria-label="Resources mind map preview">
      <div ref={stageRef} className="resource-map-preview-stage" aria-label="Read-only Resources mind map">
        <div className="resource-map-interaction-hint"><MousePointer2 size={13} /><span>Hover for feedback · expand an object for weekly actions</span></div>
        {layout && <svg ref={svgRef} className="resource-map-svg" viewBox={layout.viewBox} preserveAspectRatio="xMidYMid meet" role="img" onMouseLeave={() => setHoveredObject(null)} aria-label={`Resources mind map centered on ${topic?.text || "You"}`}>
          <g className="resource-map-links">{layout.links.map(({ from, to }) => {
            const direction = Math.sign(to.x - from.x) || 1;
            const x1 = from.x + direction * from.width / 2;
            const y1 = from.y + from.height / 2;
            const x2 = to.x - direction * to.width / 2;
            const y2 = to.y + to.height / 2;
            const middle = (x1 + x2) / 2;
            return <path key={`${from.id}-${to.id}`} stroke={to.color} d={`M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`} />;
          })}</g>
          <g className="resource-map-nodes">{layout.positions.map((node) => {
            const progress = node.isObject ? taskProgress[node.text.trim().toLocaleLowerCase()] : undefined;
            const key = node.text.trim().toLocaleLowerCase();
            const selectedIcon = objectIcons[key];
            const ObjectIcon = node.isObject ? (OBJECT_ICON_OPTIONS.find((option) => option.id === selectedIcon)?.Icon || OBJECT_ICONS[key] || Circle) : null;
            const nodeActions = node.isObject ? (feedbackLoops[key]?.actions || []).filter((action) => action.id && (action.name?.trim() || action.details?.trim())) : [];
            const nodeExpanded = Boolean(expandedPanelHeights[node.id]) && nodeActions.length > 0;
            const nodeEvents = nodeExpanded ? scheduledTasks.filter((task) => task.feedbackAction?.object?.trim().toLocaleLowerCase() === key) : [];
            return <g key={node.id} className={`${node.id === topic?.id ? "is-root" : ""} ${node.isObject ? "resource-map-object" : ""}`} transform={`translate(${node.x - node.width / 2} ${node.y})`}
              onMouseEnter={() => node.isObject && setHoveredObject(node.id)}
              onFocus={() => node.isObject && setHoveredObject(node.id)}
              onBlur={(event) => { if (node.isObject && !event.currentTarget.ownerSVGElement?.contains(event.relatedTarget as Node | null)) setHoveredObject(null); }} tabIndex={node.isObject ? 0 : undefined}>
            {node.id === topic?.id && <rect className="resource-map-root-outline" x="-5" y="-5" width={node.width + 10} height={node.height + 10} rx="14" />}
            <rect className={node.id === topic?.id ? "resource-map-root-node" : "resource-map-branch-node"} width={node.width} height={node.height} rx="11" style={node.id === topic?.id ? undefined : { fill: node.color }} />
            {ObjectIcon && <ObjectIcon className="resource-map-object-icon" x={10} y={9} width={18} height={18} strokeWidth={2} color="#fff" aria-hidden="true" />}
            {progress && <g className="resource-map-task-progress" aria-label={`${progress.completed} of ${progress.total} scheduled tasks completed`}><line x1={node.width - 34} x2={node.width - 34} y1="9" y2="27" /><text x={node.width - 17} y="21">{progress.completed}/{progress.total}</text></g>}
            <text x={node.isObject ? (32 + node.width - (progress ? 34 : 0)) / 2 : node.width / 2} y={node.height / 2 + 4} textAnchor="middle">{node.text.length > 32 ? `${node.text.slice(0, 30)}…` : node.text}</text>
          </g>})}</g>
          {layout.positions.map((node) => {
            if (!expandedPanelHeights[node.id] || !node.isObject) return null;
            const key = node.text.trim().toLocaleLowerCase();
            const nodeActions = (feedbackLoops[key]?.actions || []).filter((action) => action.id && (action.name?.trim() || action.details?.trim()));
            if (!nodeActions.length) return null;
            const panelHeight = getActionPanelHeight(nodeActions.length);
            const panelWidth = 310;
            const onLeftSide = node.x < layout.positions[0].x;
            const panelX = onLeftSide ? node.x - node.width / 2 - 14 - panelWidth : node.x + node.width / 2 + 14;
            const panelY = node.y + 24;
            const nodeEdgeX = onLeftSide ? node.x - node.width / 2 : node.x + node.width / 2;
            const panelEdgeX = onLeftSide ? panelX + panelWidth : panelX;
            const objectCenterY = node.y + node.height / 2;
            const panelCenterY = panelY + panelHeight / 2;
            const connectorMiddleX = (nodeEdgeX + panelEdgeX) / 2;
            const nodeEvents = scheduledTasks.filter((task) => task.feedbackAction?.object?.trim().toLocaleLowerCase() === key);
            return <g className="resource-map-actions-node" key={`${node.id}-actions-node`}>
              <path className="resource-map-actions-node-link" d={`M ${nodeEdgeX} ${objectCenterY} C ${connectorMiddleX} ${objectCenterY}, ${connectorMiddleX} ${panelCenterY}, ${panelEdgeX} ${panelCenterY}`} style={{ stroke: node.color }} />
              <foreignObject x={panelX} y={panelY} width={panelWidth} height={panelHeight}>
                <div className="resource-map-inline-actions" style={{ "--week-accent": node.color } as CSSProperties}>
                  <div className="resource-map-inline-action-heading"><span>Actions</span><span>This week</span></div>
                  <div className="resource-map-node-week-row resource-map-node-week-heading"><span />{currentWeekDays.map((day) => <span key={day}>{localDate(day).toLocaleDateString(undefined, { weekday: "narrow" })}</span>)}</div>
                  {nodeActions.map((action) => {
                    const eventsForAction = nodeEvents.filter((task) => task.feedbackAction?.actionId === action.id);
                    return <div className="resource-map-node-week-row" key={`${node.id}-expanded-${action.id}`}>
                      <span className="resource-map-node-action-name" title={action.name || action.details}>{action.name || action.details}</span>
                      {currentWeekDays.map((day) => {
                        const complete = eventsForAction.some((task) => task.completedDates?.includes(day));
                        const scheduled = eventsForAction.some((task) => scheduledOn(task, day));
                        const status = complete ? "completed" : scheduled ? "scheduled" : "not scheduled";
                        return <span key={day} className={`resource-map-week-dot ${complete ? "is-complete" : scheduled ? "is-scheduled" : ""}`} title={`${localDate(day).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${status}`} aria-label={`${localDate(day).toLocaleDateString(undefined, { weekday: "long" })}: ${status}`} />;
                      })}
                    </div>;
                  })}
                </div>
              </foreignObject>
            </g>;
          })}
          {hoveredNode && showFeedbackCard && cardPosition && <foreignObject className="resource-map-hover-card" x={cardPosition.x} y={cardPosition.y} width="260" height={cardHeight}>
            <div className="resource-map-hover-card-content">
              <div className="resource-map-hover-card-heading"><span className="resource-map-hover-card-dot" style={{ background: hoveredNode.color }} /><div><small>FEEDBACK LOOP</small><strong>{hoveredNode.text}</strong></div>{objectActions.length > 0 && <button type="button" className={`resource-map-icon-settings ${expandedPanelHeights[hoveredNode.id] ? "is-expanded" : ""}`} title={`${expandedPanelHeights[hoveredNode.id] ? "Hide" : "Show"} actions on the mind map`} aria-label={`${expandedPanelHeights[hoveredNode.id] ? "Hide" : "Show"} actions on the mind map`} aria-expanded={Boolean(expandedPanelHeights[hoveredNode.id])} onClick={() => { setIconPickerOpen(false); setExpandedObjectIds((current) => current.includes(hoveredNode.id) ? current.filter((id) => id !== hoveredNode.id) : [...current, hoveredNode.id]); }}>{expandedPanelHeights[hoveredNode.id] ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>}<button type="button" className="resource-map-icon-settings" title="Choose object icon" aria-label={`Choose icon for ${hoveredNode.text}`} aria-expanded={iconPickerOpen} onClick={() => { if (!iconPickerOpen) setIconCategory(ICON_CATEGORY_BY_OBJECT[hoveredObjectKey] || "Wellbeing"); setIconPickerOpen((open) => !open); }}><Settings2 size={15} /></button></div>
              {iconPickerOpen && <div className="resource-map-icon-picker-panel">
                <div className="resource-map-icon-tabs" role="tablist" aria-label="Life areas">{ICON_CATEGORIES.map((category) => <button type="button" role="tab" key={category} aria-selected={iconCategory === category} className={iconCategory === category ? "is-active" : ""} onClick={() => setIconCategory(category)}>{category}</button>)}</div>
                <div className="resource-map-icon-picker" role="tabpanel" aria-label={`${iconCategory} icons`}>{OBJECT_ICON_OPTIONS.filter((option) => option.category === iconCategory).map(({ id, label, Icon }, index) => <button type="button" key={`${iconCategory}-${id}-${index}`} className={hoveredIconId === id ? "is-selected" : ""} title={label} aria-label={`${label} icon`} aria-pressed={hoveredIconId === id} onClick={() => saveObjectIcon(hoveredNode.text, id)}><Icon size={16} /></button>)}</div>
              </div>}
              {objective && <div className="resource-map-hover-objective"><small>OBJECTIVE{feedback?.objectiveType ? ` · ${feedback.objectiveType}` : ""}</small><p>{objective}</p></div>}
              {actions.length > 0 && <div className="resource-map-hover-actions"><small>ACTIONS · {actions.length}</small>{actions.map((action, index) => {
                const scheduledTask = scheduledTasks.find((task) => task.feedbackAction?.object?.trim().toLocaleLowerCase() === objectKey && task.feedbackAction?.actionId === action.id && scheduledOn(task, today));
                const accent = QUADRANT_COLORS[scheduledTask?.id ? scheduledQuadrants[scheduledTask.id] || "eliminate" : "eliminate"] || QUADRANT_COLORS.eliminate;
                return <div className={`resource-map-hover-action ${action.complete ? "is-complete" : ""}`} key={`${hoveredNode.id}-action-${action.id || index}`}><button type="button" className={`resource-map-action-check ${action.complete ? "is-checked" : ""}`} style={{ "--action-quadrant-color": accent } as CSSProperties} disabled={!action.id} aria-pressed={Boolean(action.complete)} aria-label={`${action.complete ? "Mark incomplete" : "Mark complete"}: ${action.name || "Action"}`} onClick={(event) => { event.stopPropagation(); toggleAction(hoveredNode.text, action.id || "", !action.complete); }}>{action.complete && <Check size={11} />}</button><div><strong>{action.name || "Action"}</strong>{action.details && <p>{action.details}</p>}</div></div>;
              })}</div>}
            </div>
          </foreignObject>}
        </svg>}
      </div>
    </section>
  );
}
