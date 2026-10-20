"use client";

import Link from "next/link";
import AppSidebar from "../AppSidebar";
import { useAppDialogs } from "../AppDialogs";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, FilePlus2, GitFork, Pencil, Plus, Trash2, X, ChevronDown, Repeat2 } from "lucide-react";

type MindMapRecord = { id: string; title: string; updatedAt: number };
const MAPS_KEY = "alleviate-wisemapping-maps-v1";
const OBJECTS_KEY = "alleviate-wisemapping-objects-v1";
const RESOURCES_MAP_ID = "alleviate-resources-default";
const RESOURCES_OBJECTS_KEY = `${RESOURCES_MAP_ID}-objects`;
const RESOURCES_OBJECT_IDS_KEY = `${RESOURCES_MAP_ID}-object-ids`;
const RESOURCES_ACTION_NODE_IDS_KEY = `${RESOURCES_MAP_ID}-feedback-action-node-ids`;
const RESOURCES_SEEDED_KEY = `${RESOURCES_MAP_ID}-default-seeded`;
const FEEDBACK_LOOPS_KEY = "alleviate-feedback-loops-v1";
const DEFAULT_RESOURCE_OBJECTS = ["Body", "Mind", "Job", "Freelancing", "Heart", "House", "Land", "Bike", "Car"];

function readResourceObjectIds(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(RESOURCES_OBJECT_IDS_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : {};
  } catch { return {}; }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;");
}

function createResourcesXml(objects: string[]): string {
  const selected = new Set(objects.map((name) => name.trim().toLocaleLowerCase()));
  const objectTopic = (id: number, name: string) => selected.has(name.toLocaleLowerCase())
    ? `<topic id="${id}" order="0" shape="rounded rectangle" text="${escapeXml(name)}"/>`
    : "";
  const topic = (id: number, name: string, children: string) => `<topic id="${id}" order="0" text="${escapeXml(name)}">${children}</topic>`;
  const personal = topic(2, "Personal Wellbeing", `${objectTopic(3, "Body")}${objectTopic(4, "Mind")}`);
  const valueCreation = topic(5, "Value Creation", `${objectTopic(6, "Job")}${objectTopic(7, "Freelancing")}`);
  const relations = topic(8, "Relations", objectTopic(9, "Heart"));
  const property = topic(11, "Property", `${objectTopic(12, "House")}${objectTopic(13, "Land")}`);
  const vehicles = topic(14, "Vehicles", `${objectTopic(15, "Bike")}${objectTopic(16, "Car")}`);
  const resources = topic(10, "Resources", `${property}${vehicles}`);
  return `<?xml version="1.0" encoding="UTF-8"?><map version="tango" theme="prism"><topic central="true" id="1" shape="rounded rectangle" text="You">${personal}${valueCreation}${relations}${resources}</topic></map>`;
}

function createNormalXml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><map version="tango"><topic central="true" id="1" text="${escapeXml(title)}"/></map>`;
}

function isEmptyResourcesMap(xml: string): boolean {
  try {
    const document = new DOMParser().parseFromString(xml, "text/xml");
    const root = Array.from(document.querySelectorAll("topic")).find((topic) => topic.getAttribute("central") === "true") || document.querySelector("topic");
    return !document.querySelector("parsererror") && root?.getAttribute("text")?.trim().toLocaleLowerCase() === "you" && !Array.from(root.children).some((child) => child.tagName.toLocaleLowerCase() === "topic");
  } catch { return false; }
}

function applyDockResourcesStyle(xml: string, objectNames: string[]): string {
  try {
    const document = new DOMParser().parseFromString(xml, "text/xml");
    if (document.querySelector("parsererror")) return createResourcesXml(objectNames);
    const map = document.querySelector("map");
    const root = Array.from(document.querySelectorAll("topic")).find((topic) => topic.getAttribute("central") === "true") || document.querySelector("topic");
    if (!map || !root) return createResourcesXml(objectNames);
    map.setAttribute("version", map.getAttribute("version") || "tango");
    map.setAttribute("theme", "prism");
    root.setAttribute("central", "true");
    root.setAttribute("text", "You");
    if (!root.hasAttribute("shape")) root.setAttribute("shape", "rounded rectangle");

    let nextId = Array.from(document.querySelectorAll("topic")).reduce((max, topic) => Math.max(max, Number(topic.getAttribute("id")) || 0), 0) + 1;
    const objectIds = readResourceObjectIds();
    const directTopics = () => Array.from(root.children).filter((child): child is Element => child.tagName.toLocaleLowerCase() === "topic");
    objectNames.forEach((name) => {
      const objectKey = name.trim().toLocaleLowerCase();
      let topic = objectIds[objectKey]
        ? Array.from(document.querySelectorAll("topic")).find((candidate) => candidate.getAttribute("id") === objectIds[objectKey] && candidate.getAttribute("text")?.trim().toLocaleLowerCase() === objectKey)
        : undefined;
      topic ||= Array.from(document.querySelectorAll("topic")).find((candidate) => candidate.getAttribute("central") !== "true" && candidate.getAttribute("text")?.trim().toLocaleLowerCase() === objectKey);
      if (!topic) {
        topic = document.createElement("topic");
        topic.setAttribute("id", String(nextId++));
        topic.setAttribute("order", String(directTopics().length));
        topic.setAttribute("text", name);
        root.appendChild(topic);
      }
      objectIds[objectKey] = topic.getAttribute("id") || String(nextId++);
      topic.setAttribute("id", objectIds[objectKey]);
      if (!topic.hasAttribute("shape")) topic.setAttribute("shape", "rounded rectangle");
    });
    localStorage.setItem(RESOURCES_OBJECT_IDS_KEY, JSON.stringify(objectIds));
    return new XMLSerializer().serializeToString(document);
  } catch {
    return createResourcesXml(objectNames);
  }
}

function syncFeedbackActionTopics(xml: string): string {
  try {
    const document = new DOMParser().parseFromString(xml, "text/xml");
    if (document.querySelector("parsererror")) return xml;
    const objectIds = readResourceObjectIds();
    const loops = JSON.parse(localStorage.getItem(FEEDBACK_LOOPS_KEY) || "{}");
    const previousIds = JSON.parse(localStorage.getItem(RESOURCES_ACTION_NODE_IDS_KEY) || "{}");
    const nodeIds: Record<string, Record<string, string>> = previousIds && typeof previousIds === "object" && !Array.isArray(previousIds) ? previousIds : {};
    const expected = new Map<string, { objectKey: string; actionId: string; name: string }>();
    if (loops && typeof loops === "object" && !Array.isArray(loops)) {
      Object.entries(loops).forEach(([objectName, rawLoop]) => {
        const objectKey = objectName.trim().toLocaleLowerCase();
        const loop = rawLoop as { actions?: Array<{ id?: string; name?: string }> };
        (Array.isArray(loop?.actions) ? loop.actions : []).forEach((action) => {
          if (typeof action?.id === "string" && action.id && action.name?.trim()) expected.set(action.id, { objectKey, actionId: action.id, name: action.name.trim() });
        });
      });
    }
    let nextId = Array.from(document.querySelectorAll("topic")).reduce((max, topic) => Math.max(max, Number(topic.getAttribute("id")) || 0), 0) + 1;
    const allTopics = () => Array.from(document.querySelectorAll("topic"));
    Object.entries(nodeIds).forEach(([objectKey, actions]) => Object.entries(actions || {}).forEach(([actionId, nodeId]) => {
      if (!expected.has(actionId)) {
        const stale = allTopics().find((topic) => topic.getAttribute("id") === nodeId);
        stale?.parentNode?.removeChild(stale);
        delete nodeIds[objectKey][actionId];
      }
    }));
    expected.forEach(({ objectKey, actionId, name }) => {
      const objectId = objectIds[objectKey];
      const objectTopic = objectId ? allTopics().find((topic) => topic.getAttribute("id") === objectId) : undefined;
      if (!objectTopic) return;
      nodeIds[objectKey] ||= {};
      let actionTopic = nodeIds[objectKey][actionId] ? allTopics().find((topic) => topic.getAttribute("id") === nodeIds[objectKey][actionId]) : undefined;
      actionTopic ||= allTopics().find((topic) => topic.getAttribute("feedback-action-id") === actionId);
      if (!actionTopic) {
        actionTopic = document.createElement("topic");
        actionTopic.setAttribute("id", String(nextId++));
        actionTopic.setAttribute("order", String(Array.from(objectTopic.children).filter((child) => child.tagName.toLocaleLowerCase() === "topic").length));
        actionTopic.setAttribute("text", name);
      }
      actionTopic.setAttribute("feedback-action-id", actionId);
      actionTopic.setAttribute("text", name);
      if (actionTopic.parentNode !== objectTopic) objectTopic.appendChild(actionTopic);
      nodeIds[objectKey][actionId] = actionTopic.getAttribute("id") || String(nextId++);
    });
    localStorage.setItem(RESOURCES_ACTION_NODE_IDS_KEY, JSON.stringify(nodeIds));
    return new XMLSerializer().serializeToString(document);
  } catch { return xml; }
}

function removeResourceObjectFromXml(xml: string, objectName: string): string {
  try {
    const document = new DOMParser().parseFromString(xml, "text/xml");
    if (document.querySelector("parsererror")) return xml;
    const objectIds = readResourceObjectIds();
    const objectKey = objectName.trim().toLocaleLowerCase();
    const objectId = objectIds[objectKey];
    const topic = objectId
      ? Array.from(document.querySelectorAll("topic")).find((candidate) => candidate.getAttribute("id") === objectId)
      : Array.from(document.querySelectorAll("topic")).find((candidate) => candidate.getAttribute("central") !== "true" && candidate.getAttribute("text")?.trim().toLocaleLowerCase() === objectKey);
    if (topic?.parentNode) topic.parentNode.removeChild(topic);
    delete objectIds[objectKey];
    localStorage.setItem(RESOURCES_OBJECT_IDS_KEY, JSON.stringify(objectIds));
    return new XMLSerializer().serializeToString(document);
  } catch { return xml; }
}

function readMaps(): MindMapRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem(MAPS_KEY) || "[]");
    return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.id === "string" && typeof entry.title === "string") : [];
  } catch {
    return [];
  }
}

export default function MindMapPage() {
  const dialogs = useAppDialogs();
  const [maps, setMaps] = useState<MindMapRecord[]>([]);
  const [objectNames, setObjectNames] = useState<string[]>([]);
  const [objectDraft, setObjectDraft] = useState("");
  const [objectsOpen, setObjectsOpen] = useState(false);
  const [frameRevision, setFrameRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState("Saved on this device");

  useEffect(() => {
    try {
      const loadedMaps = readMaps();
      let loadedObjects: string[] = [];
      try {
        const currentObjects = localStorage.getItem(RESOURCES_OBJECTS_KEY);
        const storedObjects = currentObjects ?? localStorage.getItem(OBJECTS_KEY);
        if (storedObjects !== null) {
          const parsed = JSON.parse(storedObjects);
          loadedObjects = Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map((name) => name.trim()) : [];
        } else loadedObjects = DEFAULT_RESOURCE_OBJECTS;
      } catch {
        loadedObjects = [];
      }
      const savedResourcesMap = loadedMaps.find((map) => map.id === RESOURCES_MAP_ID);
      const resourcesMap = savedResourcesMap
        ? { ...savedResourcesMap, title: savedResourcesMap.title === "Resources" ? "LifeMap" : savedResourcesMap.title }
        : { id: RESOURCES_MAP_ID, title: "LifeMap", updatedAt: Date.now() };
      const mapsWithResources = [resourcesMap, ...loadedMaps.filter((map) => map.id !== RESOURCES_MAP_ID)];
      let existingResourcesXml: string | null = null;
      try {
        existingResourcesXml = localStorage.getItem(`${RESOURCES_MAP_ID}-xml`);
      } catch { /* Browser storage may be unavailable. */ }
      if (existingResourcesXml && !localStorage.getItem(RESOURCES_SEEDED_KEY) && isEmptyResourcesMap(existingResourcesXml) && loadedObjects.length === 0) {
        loadedObjects = DEFAULT_RESOURCE_OBJECTS;
      }
      setMaps(mapsWithResources);
      setObjectNames(loadedObjects);
      if (new URLSearchParams(window.location.search).get("open") === "resources") setActiveId(RESOURCES_MAP_ID);
      try {
        localStorage.setItem(`${RESOURCES_MAP_ID}-xml`, syncFeedbackActionTopics(applyDockResourcesStyle(existingResourcesXml || createResourcesXml(loadedObjects), loadedObjects)));
        localStorage.setItem(RESOURCES_OBJECTS_KEY, JSON.stringify(loadedObjects));
        localStorage.setItem(RESOURCES_SEEDED_KEY, "true");
        window.dispatchEvent(new Event("resources-mindmap-updated"));
      } catch { /* The library remains usable for this session without persistence. */ }
    } finally {
      // Always leave the loading state, including when browser storage is blocked or full.
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) {
      try { localStorage.setItem(MAPS_KEY, JSON.stringify(maps)); } catch { /* Storage is optional for the current session. */ }
    }
  }, [maps, ready]);

  useEffect(() => {
    if (ready) {
      try { localStorage.setItem(RESOURCES_OBJECTS_KEY, JSON.stringify(objectNames)); } catch { /* Storage is optional for the current session. */ }
    }
  }, [objectNames, ready]);

  const openMap = useCallback((map: MindMapRecord) => {
    const xml = localStorage.getItem(`${map.id}-xml`);
    if (map.id === RESOURCES_MAP_ID) {
      localStorage.setItem(`${map.id}-xml`, syncFeedbackActionTopics(applyDockResourcesStyle(xml || createResourcesXml(objectNames), objectNames)));
    } else if (!xml) {
      localStorage.setItem(`${map.id}-xml`, createNormalXml(map.title));
    }
    setActiveId(map.id);
  }, [objectNames]);

  const createMap = useCallback(async () => {
    const title = (await dialogs.prompt({ title: "Create mind map", message: "Mind map name", defaultValue: "Untitled mind map", confirmLabel: "Create" }))?.trim();
    if (!title) return;
    const map = { id: crypto.randomUUID(), title, updatedAt: Date.now() };
    try {
      localStorage.setItem(`${map.id}-xml`, createNormalXml(title));
      setMaps((current) => [map, ...current]);
      setActiveId(map.id);
    } catch {
      await dialogs.alert({ title: "Could not save mind map", message: "This mind map could not be saved in browser storage." });
    }
  }, [dialogs]);

  const updateResourcesObjects = useCallback((next: string[]) => {
    let currentXml = localStorage.getItem(`${RESOURCES_MAP_ID}-xml`) || createResourcesXml(objectNames);
    const nextNames = new Set(next.map((name) => name.trim().toLocaleLowerCase()));
    objectNames.filter((name) => !nextNames.has(name.trim().toLocaleLowerCase())).forEach((name) => {
      currentXml = removeResourceObjectFromXml(currentXml, name);
    });
    const nextXml = syncFeedbackActionTopics(applyDockResourcesStyle(currentXml, next));
    localStorage.setItem(RESOURCES_OBJECTS_KEY, JSON.stringify(next));
    if (activeId === RESOURCES_MAP_ID) {
      localStorage.setItem(`${RESOURCES_MAP_ID}-xml`, nextXml);
      setFrameRevision((revision) => revision + 1);
    } else {
      localStorage.setItem(`${RESOURCES_MAP_ID}-xml`, nextXml);
    }
    window.dispatchEvent(new Event("resources-mindmap-updated"));
    setObjectNames(next);
  }, [activeId, objectNames]);

  const addObject = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = objectDraft.trim();
    if (!name || objectNames.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    updateResourcesObjects([...objectNames, name]);
    setObjectDraft("");
  }, [objectDraft, objectNames, updateResourcesObjects]);

  const removeObject = useCallback((name: string) => {
    updateResourcesObjects(objectNames.filter((item) => item.toLocaleLowerCase() !== name.toLocaleLowerCase()));
  }, [objectNames, updateResourcesObjects]);

  const deleteMap = useCallback(async (map: MindMapRecord) => {
    if (!await dialogs.confirm({ title: "Delete mind map?", message: `Delete “${map.title}”? This cannot be undone.`, confirmLabel: "Delete", destructive: true })) return;
    localStorage.removeItem(`${map.id}-xml`);
    setMaps((current) => current.filter((item) => item.id !== map.id));
    setActiveId((current) => current === map.id ? null : current);
  }, [dialogs]);

  useEffect(() => {
    const handleSave = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "wisemapping-save") return;
      const { mapId, xml } = event.data as { mapId?: string; xml?: string };
      if (!mapId || typeof xml !== "string") return;
      try {
        localStorage.setItem(`${mapId}-xml`, xml);
        if (mapId === RESOURCES_MAP_ID) {
          window.dispatchEvent(new Event("resources-mindmap-updated"));
        }
        setMaps((current) => current.map((map) => map.id === mapId ? { ...map, updatedAt: Date.now() } : map));
        setSaveState("Saved on this device");
      } catch {
        setSaveState("Could not save mind map");
      }
    };
    window.addEventListener("message", handleSave);
    return () => window.removeEventListener("message", handleSave);
  }, []);

  const activeMap = maps.find((map) => map.id === activeId) || null;
  const editorUrl = activeMap
    ? `/wisemapping/index.html?mapId=${encodeURIComponent(activeMap.id)}&title=${encodeURIComponent(activeMap.title)}`
    : "";

  if (!ready) return <main className="loading-screen">Opening mind maps…</main>;

  if (activeMap) {
    return (
      <>
      <AppSidebar active="mind-map" />
      <main className="mindmap-editor-shell">
        <header className="mindmap-editor-bar">
          <button className="mindmap-back" onClick={() => setActiveId(null)} title="Back to mind maps"><ArrowLeft size={17} /> <span>Mind maps</span></button>
          <div className="mindmap-current-title"><GitFork size={15} /><span>{activeMap.title}</span></div>
          <div className="mindmap-editor-actions">
            {activeMap.id === RESOURCES_MAP_ID && <div className="mindmap-objects-menu">
              <button className="secondary-btn mindmap-objects-toggle" aria-expanded={objectsOpen} onClick={() => setObjectsOpen((open) => !open)}><span>Objects</span><span className="mindmap-object-count">{objectNames.length}</span><ChevronDown size={14} /></button>
              {objectsOpen && <div className="mindmap-objects-popover">
                <div className="mindmap-objects-header"><div><h2>Objects</h2><p>Add objects to the map, then move them under any topic.</p></div></div>
                <form className="mindmap-object-form" onSubmit={addObject}><input value={objectDraft} onChange={(event) => setObjectDraft(event.target.value)} placeholder="Add an object" aria-label="Object name" /><button className="secondary-btn" type="submit" disabled={!objectDraft.trim()}><Plus size={15} /> Add</button></form>
                {objectNames.length ? <div className="mindmap-object-list">{objectNames.map((name) => <div className="mindmap-object-chip" key={name}><span>{name}</span><button aria-label={`Remove ${name}`} title={`Remove ${name}`} onClick={() => removeObject(name)}><X size={13} /></button></div>)}</div> : <p className="mindmap-object-empty">No objects yet.</p>}
              </div>}
            </div>}
            <span className="status">{saveState}</span>
            <button className="icon-btn" title="Close mind map" aria-label="Close mind map" onClick={() => setActiveId(null)}><X size={18} /></button>
          </div>
        </header>
        <iframe key={`${activeMap.id}-${frameRevision}`} className="mindmap-editor-frame" src={editorUrl} title={`${activeMap.title} mind map`} />
      </main>
      </>
    );
  }

  return (
    <>
    <AppSidebar active="mind-map" />
    <main className="mindmap-library-page">
      <header className="mindmap-library-bar">
        <Link href="/" className="mindmap-back"><ArrowLeft size={17} /> <span>Alleviate home</span></Link>
        <Link className="secondary-btn" href="/feedback-loop"><Repeat2 size={16} /> Feedback loops</Link>
      </header>
      <section className="mindmap-library-content">
        <span className="eyebrow">WiseMapping</span>
        <div className="mindmap-library-heading">
          <div><h1>Mind maps</h1><p>Explore ideas visually and keep each map saved on this device.</p></div>
          <button className="primary-btn" onClick={createMap}><Plus size={17} /> New mind map</button>
        </div>
        {maps.length ? (
          <div className="mindmap-grid">
            {maps.slice().sort((left, right) => right.updatedAt - left.updatedAt).map((map) => (
              <article key={map.id} className="mindmap-card">
                <button className="mindmap-card-open" onClick={() => openMap(map)}>
                  <span className="mindmap-card-icon"><GitFork size={21} /></span>
                    <strong>{map.title}{map.id === RESOURCES_MAP_ID ? " · Default" : ""}</strong>
                  <small>Edited {new Date(map.updatedAt).toLocaleString()}</small>
                </button>
                <div className="mindmap-card-actions">
                  <button className="icon-btn" title="Rename" aria-label={`Rename ${map.title}`} onClick={async () => {
                    const title = (await dialogs.prompt({ title: "Rename mind map", message: "Mind map name", defaultValue: map.title, confirmLabel: "Save" }))?.trim();
                    if (title && title !== map.title) setMaps((current) => current.map((item) => item.id === map.id ? { ...item, title, updatedAt: Date.now() } : item));
                  }}><Pencil size={14} /></button>
                  {map.id !== RESOURCES_MAP_ID && <button className="icon-btn" title="Delete" aria-label={`Delete ${map.title}`} onClick={() => deleteMap(map)}><Trash2 size={14} /></button>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <button className="mindmap-empty-state" onClick={createMap}>
            <span className="mindmap-card-icon"><FilePlus2 size={21} /></span>
            <strong>Create your first mind map</strong>
            <span>Your mind maps are saved locally in this browser.</span>
          </button>
        )}
        <p className="wisemapping-attribution">Powered by <a href="https://www.wisemapping.com/" target="_blank" rel="noreferrer">WiseMapping</a></p>
      </section>
    </main>
    </>
  );
}
