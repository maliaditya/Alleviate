"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import AppSidebar from "../AppSidebar";
import { useAppDialogs } from "../AppDialogs";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { CheckSquare, ChevronDown, ChevronRight, Copy, Download, FileText, FolderOpen, FolderPlus, Heading1, Heading2, Library, List, ListOrdered, Menu, MessageSquare, Paintbrush, Pencil, Pin, Plus, RefreshCw, Save, Search, Trash2, Type, X } from "lucide-react";
import { loadCanvasFiles, saveCanvasFiles, type CanvasFileMetaMap } from "../../lib/canvasFileStore";
import { loadCanvasDocuments, saveCanvasDocuments } from "../../lib/canvasDocumentStore";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((module) => module.Excalidraw),
  { ssr: false },
);

type CanvasDocument = {
  id: string;
  name: string;
  updatedAt: number;
  previewUpdatedAt?: number;
  elements: any[];
  appState?: Record<string, any>;
  fileMeta?: CanvasFileMetaMap;
  kind?: "note";
  content?: string;
  /** Legacy inline files are read once and migrated to IndexedDB. */
  files?: Record<string, any>;
  resourceId?: string;
};

function markdownInline(source: string): ReactNode[] {
  const pieces = source.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*.+?\*\*|__.+?__|~~.+?~~|\*[^*]+\*|_[^_]+_)/g).filter(Boolean);
  return pieces.map((piece, index) => {
    const key = `inline-${index}`;
    const link = piece.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = /^(https?:\/\/|mailto:|\/|#)/i.test(link[2]) ? link[2] : undefined;
      return href ? <a key={key} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>{link[1]}</a> : link[1];
    }
    if (piece.startsWith("`")) return <code key={key}>{piece.slice(1, -1)}</code>;
    if (piece.startsWith("**") || piece.startsWith("__")) return <strong key={key}>{piece.slice(2, -2)}</strong>;
    if (piece.startsWith("~~")) return <del key={key}>{piece.slice(2, -2)}</del>;
    if (piece.startsWith("*") || piece.startsWith("_")) return <em key={key}>{piece.slice(1, -1)}</em>;
    return piece;
  });
}

function MarkdownNotePreview({ source, onToggleTask }: { source: string; onToggleTask?: (lineIndex: number, checked: boolean) => void }) {
  const lines = source.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`block-${blocks.length}`}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(<Tag key={`block-${blocks.length}`}>{markdownInline(heading[2])}</Tag>);
      index += 1;
      continue;
    }
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { blocks.push(<hr key={`block-${blocks.length}`} />); index += 1; continue; }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={`block-${blocks.length}`}>{quote.map((part, item) => <p key={item}>{markdownInline(part)}</p>)}</blockquote>);
      continue;
    }
    const listMatch = line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
        if (!item || Boolean(item[2]) !== ordered) break;
        const task = item[3].match(/^\[([ xX])\]\s*(.*)$/);
        const lineIndex = index;
        items.push(task
          ? <li className="canvas-note-task-item" key={items.length}><label><input type="checkbox" checked={task[1].toLowerCase() === "x"} onClick={(event) => event.stopPropagation()} onChange={(event) => onToggleTask?.(lineIndex, event.target.checked)} /><span>{markdownInline(task[2])}</span></label></li>
          : <li key={items.length}>{markdownInline(item[3])}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol key={`block-${blocks.length}`}>{items}</ol> : <ul key={`block-${blocks.length}`}>{items}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|```|\s*>|\s*(?:[-+*]|\d+\.)\s+)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`block-${blocks.length}`}>{paragraph.map((part, item) => <Fragment key={item}>{item > 0 && <br />}{markdownInline(part)}</Fragment>)}</p>);
  }
  return <div className="canvas-note-markdown">{blocks.length ? blocks : <p className="canvas-note-empty">Nothing to preview yet.</p>}</div>;
}

function MarkdownLinePreview({ line, inCode, onToggleTask }: { line: string; inCode: boolean; onToggleTask?: (checked: boolean) => void }) {
  if (!line.trim()) return <div className="canvas-note-rendered-line"><br /></div>;
  if (line.startsWith("```")) return <div className="canvas-note-rendered-line canvas-note-fence" aria-hidden="true" />;
  if (inCode) return <pre className="canvas-note-rendered-code"><code>{line}</code></pre>;
  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    const Tag = `h${heading[1].length}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return <Tag className="canvas-note-rendered-line">{markdownInline(heading[2])}</Tag>;
  }
  if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) return <hr className="canvas-note-rendered-line" />;
  const quote = line.match(/^\s*>\s?(.*)$/);
  if (quote) return <blockquote className="canvas-note-rendered-line">{markdownInline(quote[1])}</blockquote>;
  const task = line.match(/^\s*[-+*]\s+\[([ xX])\]\s*(.*)$/);
  if (task) return <div className="canvas-note-rendered-line canvas-note-task-line"><input type="checkbox" checked={task[1].toLowerCase() === "x"} onClick={(event) => event.stopPropagation()} onChange={(event) => onToggleTask?.(event.target.checked)} /><span>{markdownInline(task[2])}</span></div>;
  const list = line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
  if (list) return <div className="canvas-note-rendered-line canvas-note-list-line"><span>{list[2] ? `${list[2]}.` : "•"}</span>{markdownInline(list[3])}</div>;
  return <div className="canvas-note-rendered-line">{markdownInline(line)}</div>;
}

function CanvasNoteEditor({ note, onUpdate }: { note: CanvasDocument; onUpdate: (update: Partial<CanvasDocument>) => void }) {
  const [preview, setPreview] = useState(false);
  const [editingLine, setEditingLine] = useState<number | null>(0);
  const [blockMenuLine, setBlockMenuLine] = useState<number | null>(null);
  const lineInputRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<"start" | "end">("start");
  const lines = (note.content || "").split(/\r?\n/);
  useEffect(() => {
    if (blockMenuLine === null) return;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest(".canvas-note-block-menu, .canvas-note-block-trigger")) setBlockMenuLine(null);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [blockMenuLine]);
  useEffect(() => {
    if (preview || editingLine === null) return;
    const input = lineInputRef.current;
    if (!input) return;
    input.focus();
    const position = pendingCaretRef.current === "end" ? input.value.length : 0;
    input.setSelectionRange(position, position);
  }, [editingLine, preview]);
  const updateLine = (index: number, value: string, caret: number) => {
    const nextLines = [...lines];
    nextLines.splice(index, 1, ...value.split("\n"));
    onUpdate({ content: nextLines.join("\n") });
    setEditingLine(index + value.slice(0, caret).split("\n").length - 1);
  };
  const toggleTask = (index: number, checked: boolean) => {
    const nextLines = [...lines];
    nextLines[index] = nextLines[index].replace(/\[([ xX])\]/, checked ? "[x]" : "[ ]");
    onUpdate({ content: nextLines.join("\n") });
  };
  const continueListOnEnter = (event: ReactKeyboardEvent<HTMLTextAreaElement>, index: number) => {
    const input = event.currentTarget;
    if (event.key !== "Enter" || input.selectionStart !== input.selectionEnd || input.selectionEnd !== input.value.length) return false;
    const value = input.value;
    const ordered = value.match(/^(\s*)(\d+)\.\s*(.*)$/);
    const task = value.match(/^(\s*)([-+*])\s+\[([ xX])\]\s*(.*)$/);
    const bullet = value.match(/^(\s*)([-+*])\s+(.*)$/);
    const item = ordered ? { indent: ordered[1], body: ordered[3], next: `${ordered[1]}${Number(ordered[2]) + 1}. ` }
      : task ? { indent: task[1], body: task[4], next: `${task[1]}${task[2]} [ ] ` }
        : bullet ? { indent: bullet[1], body: bullet[3], next: `${bullet[1]}${bullet[2]} ` }
          : null;
    if (!item) return false;
    event.preventDefault();
    const nextLines = [...lines];
    if (!item.body.trim()) {
      nextLines[index] = item.indent;
      onUpdate({ content: nextLines.join("\n") });
      setEditingLine(index);
      requestAnimationFrame(() => {
        const activeInput = lineInputRef.current;
        if (activeInput) { activeInput.focus(); activeInput.setSelectionRange(0, 0); }
      });
      return true;
    }
    nextLines.splice(index, 1, value, item.next);
    pendingCaretRef.current = "end";
    onUpdate({ content: nextLines.join("\n") });
    setEditingLine(index + 1);
    return true;
  };
  const applyBlock = (index: number, block: "numbered" | "todo" | "bulleted" | "text" | "ai-note" | "heading1" | "heading2") => {
    const current = lines[index] || "";
    const body = current.replace(/^\s*(?:#{1,6}\s+|-\s+\[\s?\]\s*|[-+*]\s+|\d+\.\s+|>\s?)/, "");
    const prefix = {
      numbered: "1. ",
      todo: "- [ ] ",
      bulleted: "- ",
      text: "",
      "ai-note": "> **AI Note** ",
      heading1: "# ",
      heading2: "## ",
    }[block];
    const nextLines = [...lines];
    nextLines[index] = prefix + body;
    onUpdate({ content: nextLines.join("\n") });
    setBlockMenuLine(null);
    pendingCaretRef.current = "end";
    setEditingLine(index);
    requestAnimationFrame(() => {
      const input = lineInputRef.current;
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    });
  };
  let insideCode = false;
  return <section className="canvas-note-editor" aria-label="Note editor">
    <div className="canvas-note-toolbar"><FileText size={16} /><span>NOTE</span><small>{new Date(note.updatedAt).toLocaleString()}</small><div className="canvas-note-modes"><button type="button" className={!preview ? "is-active" : ""} onClick={() => { setEditingLine((current) => current ?? 0); setPreview(false); }}>Write</button><button type="button" className={preview ? "is-active" : ""} onClick={() => { setPreview(true); setEditingLine(null); }}>Preview</button></div></div>
    <input className="canvas-note-title" aria-label="Note title" value={note.name} onChange={(event) => onUpdate({ name: event.target.value })} placeholder="Untitled note" />
    {preview ? <MarkdownNotePreview source={note.content || ""} onToggleTask={toggleTask} /> : <div className="canvas-note-lines" aria-label="Markdown note content">{lines.map((line, index) => {
      const wasInsideCode = insideCode;
      if (line.startsWith("```")) insideCode = !insideCode;
      return <div key={index} className={`canvas-note-line ${editingLine === index ? "is-editing" : ""}`} role={editingLine === index ? undefined : "button"} tabIndex={editingLine === index ? undefined : 0} aria-label={editingLine === index ? undefined : `Edit note line ${index + 1}`} onClick={() => { if (editingLine !== index) { pendingCaretRef.current = "start"; setEditingLine(index); } }} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (editingLine !== index && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); pendingCaretRef.current = "start"; setEditingLine(index); } }}>
        <button type="button" className="canvas-note-block-trigger" aria-label={`Add block at line ${index + 1}`} aria-expanded={blockMenuLine === index} onClick={(event) => { event.stopPropagation(); setBlockMenuLine((current) => current === index ? null : index); }}><Plus size={15} /></button>
        {blockMenuLine === index && <div className="canvas-note-block-menu" role="menu" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setBlockMenuLine(null); } }}>
          <div className="canvas-note-block-menu-heading">Suggested</div>
          <button type="button" role="menuitem" onClick={() => applyBlock(index, "numbered")}><ListOrdered size={15} /><span>Numbered list</span><kbd>1.</kbd></button>
          <button type="button" role="menuitem" onClick={() => applyBlock(index, "todo")}><CheckSquare size={15} /><span>To-do list</span><kbd>☐</kbd></button>
          <button type="button" role="menuitem" onClick={() => applyBlock(index, "bulleted")}><List size={15} /><span>Bulleted list</span><kbd>−</kbd></button>
          <div className="canvas-note-block-divider" />
          <div className="canvas-note-block-heading">Basic blocks</div>
          <button type="button" role="menuitem" onClick={() => applyBlock(index, "text")}><Type size={15} /><span>Text</span></button>
          <button type="button" role="menuitem" onClick={() => applyBlock(index, "ai-note")}><MessageSquare size={15} /><span>AI Note</span><kbd>ai</kbd></button>
          <button type="button" role="menuitem" onClick={() => applyBlock(index, "heading1")}><Heading1 size={15} /><span>Heading 1</span><kbd>#</kbd></button>
          <button type="button" role="menuitem" onClick={() => applyBlock(index, "heading2")}><Heading2 size={15} /><span>Heading 2</span><kbd>##</kbd></button>
          <button type="button" className="canvas-note-block-close" onClick={() => setBlockMenuLine(null)}><span>Close menu</span><kbd>esc</kbd></button>
        </div>}
        {editingLine === index ? <textarea ref={lineInputRef} className="canvas-note-line-input" aria-label={`Edit note line ${index + 1}`} rows={Math.max(1, line.split("\n").length)} value={line} onChange={(event) => updateLine(index, event.target.value, event.target.selectionStart)} onKeyDown={(event) => {
          const input = event.currentTarget;
          if (event.key === "Escape") { setEditingLine(null); return; }
          if (continueListOnEnter(event, index)) return;
          if (event.key === "Backspace" && input.selectionStart === 0 && input.selectionEnd === 0 && index > 0) {
            event.preventDefault();
            const previousLine = lines[index - 1];
            const nextLines = [...lines];
            nextLines.splice(index - 1, 2, previousLine + input.value);
            pendingCaretRef.current = "end";
            onUpdate({ content: nextLines.join("\n") });
            setEditingLine(index - 1);
          }
          if (event.key === "ArrowUp" && input.selectionStart === 0 && index > 0) { event.preventDefault(); pendingCaretRef.current = "end"; setEditingLine(index - 1); }
          if (event.key === "ArrowDown" && input.selectionEnd === input.value.length && index < lines.length - 1) { event.preventDefault(); pendingCaretRef.current = "start"; setEditingLine(index + 1); }
        }} onKeyUp={(event) => { const localLine = event.currentTarget.value.slice(0, event.currentTarget.selectionStart).split("\n").length - 1; setEditingLine(index + localLine); }} placeholder="Type something…" />
          : <MarkdownLinePreview line={line} inCode={wasInsideCode} onToggleTask={(checked) => toggleTask(index, checked)} />}
      </div>;
    })}</div>}
  </section>;
}

type CanvasResource = { id: string; name: string; parentId: string | null };
type CanvasContextMenu = { kind: "resource" | "canvas"; id: string; x: number; y: number };
type CanvasLayout = { kind: "document"; id: string } | { kind: "split"; id: string; direction: "vertical" | "horizontal"; ratio: number; first: CanvasLayout; second: CanvasLayout };

function normalizeCanvasLayout(value: unknown): CanvasLayout | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, any>;
  if (node.kind === "document" && typeof node.id === "string") return { kind: "document", id: node.id };
  if (node.kind !== "split" || (node.direction !== "vertical" && node.direction !== "horizontal")) return null;
  const first = normalizeCanvasLayout(node.first);
  const second = normalizeCanvasLayout(node.second);
  if (!first || !second) return null;
  const ratio = typeof node.ratio === "number" && Number.isFinite(node.ratio) ? Math.min(.85, Math.max(.15, node.ratio)) : .5;
  return { kind: "split", id: typeof node.id === "string" ? node.id : crypto.randomUUID(), direction: node.direction, ratio, first, second };
}

function layoutHasDocument(layout: CanvasLayout | null, id: string): boolean {
  if (!layout) return false;
  if (layout.kind === "document") return layout.id === id;
  return layoutHasDocument(layout.first, id) || layoutHasDocument(layout.second, id);
}

function replaceLayoutDocument(layout: CanvasLayout | null, id: string, replacement: CanvasLayout): CanvasLayout | null {
  if (!layout) return null;
  if (layout.kind === "document") return layout.id === id ? replacement : layout;
  return { ...layout, first: replaceLayoutDocument(layout.first, id, replacement)!, second: replaceLayoutDocument(layout.second, id, replacement)! };
}

function mapLayoutDocuments(layout: CanvasLayout | null, mapId: (id: string) => string): CanvasLayout | null {
  if (!layout) return null;
  if (layout.kind === "document") return { ...layout, id: mapId(layout.id) };
  return { ...layout, first: mapLayoutDocuments(layout.first, mapId)!, second: mapLayoutDocuments(layout.second, mapId)! };
}

function updateLayoutRatio(layout: CanvasLayout | null, splitId: string, ratio: number): CanvasLayout | null {
  if (!layout) return null;
  if (layout.kind === "document") return layout;
  if (layout.id === splitId) return { ...layout, ratio };
  return { ...layout, first: updateLayoutRatio(layout.first, splitId, ratio)!, second: updateLayoutRatio(layout.second, splitId, ratio)! };
}

function removeLayoutDocument(layout: CanvasLayout | null, id: string): CanvasLayout | null {
  if (!layout) return null;
  if (layout.kind === "document") return layout.id === id ? null : layout;
  const first = removeLayoutDocument(layout.first, id);
  const second = removeLayoutDocument(layout.second, id);
  if (!first) return second;
  if (!second) return first;
  return { ...layout, first, second };
}

function firstLayoutDocument(layout: CanvasLayout | null): string | null {
  if (!layout) return null;
  return layout.kind === "document" ? layout.id : firstLayoutDocument(layout.first) || firstLayoutDocument(layout.second);
}

function isValidCanvasLayout(value: unknown, validIds: Set<string>, seen = new Set<string>()): value is CanvasLayout {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (node.kind === "document") {
    if (typeof node.id !== "string" || !validIds.has(node.id) || seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  }
  if (node.kind !== "split" || typeof node.id !== "string" || typeof node.ratio !== "number" || !Number.isFinite(node.ratio) || node.ratio < .15 || node.ratio > .85 || (node.direction !== "vertical" && node.direction !== "horizontal")) return false;
  return isValidCanvasLayout(node.first, validIds, seen) && isValidCanvasLayout(node.second, validIds, seen);
}

const CanvasDrawingSurface = memo(function CanvasDrawingSurface({
  document,
  files,
  onChange,
  onApi,
}: {
  document: CanvasDocument;
  files: Record<string, any>;
  onChange: (elements: readonly any[], appState: any, files: Record<string, any>) => void;
  onApi: (api: any | null) => void;
}) {
  const [api, setApi] = useState<any>(null);
  const initialFilesRef = useRef(files);
  const loadedDocumentIdRef = useRef(document.id);
  const suppressChangeRef = useRef(false);
  const editingTextElementIdRef = useRef<string | null>(null);
  const handleApi = useCallback((nextApi: any) => setApi(nextApi), []);
  const handleChange = useCallback((elements: readonly any[], appState: any, nextFiles: Record<string, any>) => {
    if (!suppressChangeRef.current) onChange(elements, appState, nextFiles);
    const editingTextId = appState.editingElement?.type === "text" ? appState.editingElement.id : null;
    const previousEditingTextId = editingTextElementIdRef.current;
    editingTextElementIdRef.current = editingTextId;
    if (!previousEditingTextId || editingTextId) return;
    const source = elements.find((element) => element.id === previousEditingTextId);
    if (!source || source.type !== "text") return;
    const sourceDocumentId = document.id;
    window.requestAnimationFrame(() => {
      void import("@excalidraw/excalidraw").then(({ convertToExcalidrawElements }) => {
        if (loadedDocumentIdRef.current !== sourceDocumentId) return;
        const currentElements = api?.getSceneElements?.() || elements;
        const currentText = currentElements.find((element: any) => element.id === previousEditingTextId);
        if (!currentText || currentText.type !== "text") return;
        const converted = convertMarkdownTableElement(currentElements, currentText, convertToExcalidrawElements);
        if (converted) api?.updateScene?.({ elements: converted });
      }).catch(() => undefined);
    });
  }, [api, document.id, onChange]);
  useEffect(() => {
    onApi(api);
    return () => onApi(null);
  }, [api, onApi]);
  // Excalidraw treats initialData as an initial store snapshot. Keep its identity
  // stable while the parent persists edits, so each onChange doesn't look like
  // a request to re-seed the external store.
  const initialDataRef = useRef({
    elements: document.elements,
    appState: { ...document.appState, theme: "dark" as const },
    files,
  });
  const initialData = initialDataRef.current;

  useEffect(() => {
    if (!api || loadedDocumentIdRef.current === document.id) return;
    suppressChangeRef.current = true;
    try {
      api.history?.clear?.();
      api.resetScene?.();
      if (Object.keys(files).length) api.addFiles?.(Object.values(files));
      api.updateScene?.({
        elements: document.elements || [],
        appState: { ...document.appState, theme: "dark" },
        commitToHistory: false,
      });
      loadedDocumentIdRef.current = document.id;
      initialFilesRef.current = files;
    } finally {
      window.requestAnimationFrame(() => { suppressChangeRef.current = false; });
    }
  }, [api, document, files]);

  useEffect(() => {
    if (!api || loadedDocumentIdRef.current !== document.id || files === initialFilesRef.current) return;
    initialFilesRef.current = files;
    if (typeof api.addFiles === "function") api.addFiles(Object.values(files));
    else api.updateScene?.({ files });
  }, [api, document.id, files]);

  return (
    <div className="canvas-drawing-surface">
      <Excalidraw
        theme="dark"
        initialData={initialData}
        excalidrawAPI={handleApi}
        onChange={handleChange}
      />
    </div>
  );
}, (previous, next) => previous.document.id === next.document.id && previous.files === next.files && previous.onChange === next.onChange);

type ExcalidrawElementConverter = typeof import("@excalidraw/excalidraw")["convertToExcalidrawElements"];

function parseMarkdownTable(text: string): string[][] | null {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const escapedPipe = "\uE000";
    const normalized = line.replace(/\\\|/g, escapedPipe).replace(/^\|/, "").replace(/\|$/, "");
    return normalized.split("|").map((cell) => cell.replaceAll(escapedPipe, "|").trim());
  });
  if (rows.length < 3 || rows[1].length < 2 || !rows[1].every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
  const data = rows.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
  const columnCount = Math.max(0, ...data.map((row) => row.length));
  if (data.length < 2 || columnCount < 2) return null;
  return data.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] || ""));
}

function wrapTableCell(value: string, maxCharacters: number) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (line) lines.push(line);
      line = "";
      for (let index = 0; index < word.length; index += maxCharacters) lines.push(word.slice(index, index + maxCharacters));
    } else if (!line) line = word;
    else if (`${line} ${word}`.length <= maxCharacters) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines.join("\n") : " ";
}

function convertMarkdownTableElement(elements: readonly any[], source: any, convert: ExcalidrawElementConverter) {
  if (source.type !== "text" || source.isDeleted || source.customData?.canvasMarkdownTable) return null;
  const rows = parseMarkdownTable(source.text || "");
  if (!rows) return null;

  const fontSize = Math.max(16, Number(source.fontSize) || 20);
  const columnCount = rows[0].length;
  const charsPerColumn = Array.from({ length: columnCount }, (_, column) => {
    const cells = rows.map((row) => row[column]);
    let chars = Math.max(14, Math.ceil(Math.max(...cells.map((cell) => cell.length)) / 6));
    while (cells.some((cell) => wrapTableCell(cell, chars).split("\n").length > 6)) chars += 2;
    return chars;
  });
  const widths = charsPerColumn.map((chars) => Math.max(128, chars * fontSize * 0.56 + 24));
  const wrappedRows = rows.map((row) => row.map((cell, column) => wrapTableCell(cell, charsPerColumn[column])));
  const heights = wrappedRows.map((row, rowIndex) => {
    const maxLines = Math.max(...row.map((cell) => cell.split("\n").length));
    const size = rowIndex === 0 ? fontSize * 1.08 : fontSize;
    return Math.max(size * 1.8, maxLines * size * 1.22 + 14);
  });
  const groupId = `markdown-table-${source.id}`;
  const additions: any[] = [];
  let y = source.y;
  const makeElement = (skeleton: Record<string, any>) => {
    const element = convert([skeleton as any])[0];
    return { ...element, ...skeleton, id: element.id, version: element.version, versionNonce: element.versionNonce, updated: element.updated, isDeleted: element.isDeleted };
  };

  wrappedRows.forEach((row, rowIndex) => {
    let x = source.x;
    row.forEach((cellText, columnIndex) => {
      const width = widths[columnIndex];
      const height = heights[rowIndex];
      const metadata = { canvasMarkdownTable: { groupId, row: rowIndex, column: columnIndex } };
      additions.push(makeElement({
        type: "rectangle", x, y, width, height, angle: 0,
        strokeColor: "#393b42", backgroundColor: rowIndex === 0 ? "#222329" : "transparent",
        fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0,
        opacity: source.opacity ?? 100, roundness: null, groupIds: [groupId], frameId: source.frameId ?? null,
        customData: { ...metadata, role: "cell" },
      }));
      additions.push(makeElement({
        type: "text", x: x + 12, y: y + 8, text: cellText, fontSize: rowIndex === 0 ? fontSize * 1.08 : fontSize,
        fontFamily: source.fontFamily ?? 2, textAlign: "left", verticalAlign: "top",
        strokeColor: "#f4f4f5", backgroundColor: "transparent", strokeWidth: 1, roughness: 0,
        opacity: source.opacity ?? 100, groupIds: [groupId], frameId: source.frameId ?? null,
        customData: { ...metadata, role: "text" },
      }));
      x += width;
    });
    y += heights[rowIndex];
  });

  return elements.map((element) => element.id === source.id ? { ...element, isDeleted: true } : element).concat(additions);
}

const WORKSPACE_KEY = "alleviate-canvas-workspace-v1";
const EMPTY_FILES: Record<string, any> = {};
const CANVAS_THUMBNAIL_CACHE_NAME = "alleviate-canvas-thumbnails-v1";
const CANVAS_THUMBNAIL_CACHE_URL = "https://alleviate.local/canvas-thumbnail/";
const CANVAS_THUMBNAIL_VERSION = "v17";
const CANVAS_THUMBNAIL_INDEX_KEY = "alleviate-canvas-thumbnail-index-v1";
const CANVAS_THUMBNAIL_MAX_ENTRIES = 36;
type CanvasThumbnail = { markup: string; revision: number };
type CanvasThumbnailJob = { run: () => void; cancel: () => void; started: boolean; controller: AbortController };
const canvasThumbnailMemoryCache = new Map<string, CanvasThumbnail>();
const canvasThumbnailQueue: CanvasThumbnailJob[] = [];
let canvasThumbnailRenderScheduled = false;

function rememberCanvasThumbnail(key: string, thumbnail: CanvasThumbnail) {
  canvasThumbnailMemoryCache.delete(key);
  canvasThumbnailMemoryCache.set(key, thumbnail);
  while (canvasThumbnailMemoryCache.size > CANVAS_THUMBNAIL_MAX_ENTRIES) {
    const oldestKey = canvasThumbnailMemoryCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    canvasThumbnailMemoryCache.delete(oldestKey);
  }
}

function rememberCanvasFiles(cache: Map<string, Record<string, any>>, canvasId: string, files: Record<string, any>) {
  cache.delete(canvasId);
  cache.set(canvasId, files);
  while (cache.size > 3) {
    const oldestId = cache.keys().next().value as string | undefined;
    if (!oldestId) break;
    cache.delete(oldestId);
  }
}

function scheduleCanvasThumbnailRender<T>(render: (signal: AbortSignal) => Promise<T>): { promise: Promise<T | null>; cancel: () => void } {
  let resolveJob: (value: T | null) => void = () => {};
  let rejectJob: (reason?: unknown) => void = () => {};
  const promise = new Promise<T | null>((resolve, reject) => { resolveJob = resolve; rejectJob = reject; });
  const job: CanvasThumbnailJob = {
    started: false,
    controller: new AbortController(),
    cancel: () => {
      job.controller.abort();
      if (job.started) return;
      const index = canvasThumbnailQueue.indexOf(job);
      if (index !== -1) canvasThumbnailQueue.splice(index, 1);
      resolveJob(null);
    },
    run: () => {
      job.started = true;
      void render(job.controller.signal).then(resolveJob, rejectJob).finally(() => {
        canvasThumbnailRenderScheduled = false;
        scheduleNextCanvasThumbnailRender();
      });
    },
  };
  canvasThumbnailQueue.push(job);
  scheduleNextCanvasThumbnailRender();
  return { promise, cancel: job.cancel };
}

function scheduleNextCanvasThumbnailRender() {
  if (canvasThumbnailRenderScheduled || !canvasThumbnailQueue.length) return;
  canvasThumbnailRenderScheduled = true;
  const start = () => {
    const next = canvasThumbnailQueue.shift();
    if (!next) { canvasThumbnailRenderScheduled = false; return; }
    next.run();
  };
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback((deadline) => {
      if (!deadline.didTimeout && deadline.timeRemaining() < 8) {
        canvasThumbnailRenderScheduled = false;
        setTimeout(scheduleNextCanvasThumbnailRender, 50);
        return;
      }
      start();
    }, { timeout: 900 });
  } else {
    setTimeout(start, 120);
  }
}

const thumbnailCacheRequest = (key: string) => new Request(`${CANVAS_THUMBNAIL_CACHE_URL}${encodeURIComponent(key)}`);

async function readCanvasThumbnail(key: string, legacyKeys: string[], legacyRevision: number): Promise<CanvasThumbnail | null> {
  const memoryValue = canvasThumbnailMemoryCache.get(key);
  if (memoryValue) {
    canvasThumbnailMemoryCache.delete(key);
    canvasThumbnailMemoryCache.set(key, memoryValue);
    return memoryValue;
  }
  if (typeof window === "undefined" || !("caches" in window)) return null;
  try {
    const cache = await window.caches.open(CANVAS_THUMBNAIL_CACHE_NAME);
    let response = await cache.match(thumbnailCacheRequest(key));
    let migratedLegacyPreview = false;
    if (!response) {
      for (const legacyKey of legacyKeys) {
        response = await cache.match(thumbnailCacheRequest(legacyKey));
        if (response) {
          migratedLegacyPreview = true;
          break;
        }
      }
    }
    if (!response) return null;
    const markup = await response.text();
    if (!markup || !markup.includes("<svg")) return null;
    const revision = migratedLegacyPreview ? -1 : Number(response.headers.get("x-canvas-revision")) || legacyRevision;
    const thumbnail = { markup, revision };
    rememberCanvasThumbnail(key, thumbnail);
    const evictedKeys = writeCanvasThumbnailIndex(key);
    await Promise.all(evictedKeys.map((evictedKey) => cache.delete(thumbnailCacheRequest(evictedKey))));
    evictedKeys.forEach((evictedKey) => canvasThumbnailMemoryCache.delete(evictedKey));
    return thumbnail;
  } catch {
    return null;
  }
}

async function writeCanvasThumbnail(key: string, markup: string, revision: number) {
  rememberCanvasThumbnail(key, { markup, revision });
  const evictedKeys = writeCanvasThumbnailIndex(key);
  evictedKeys.forEach((evictedKey) => canvasThumbnailMemoryCache.delete(evictedKey));
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const cache = await window.caches.open(CANVAS_THUMBNAIL_CACHE_NAME);
    await cache.put(thumbnailCacheRequest(key), new Response(markup, { headers: {
      "content-type": "image/svg+xml;charset=utf-8",
      "x-canvas-revision": String(revision),
    } }));
    await Promise.all(evictedKeys.map((evictedKey) => cache.delete(thumbnailCacheRequest(evictedKey))));
  } catch {
    // The in-memory preview remains available if persistent browser storage is unavailable.
  }
}

function writeCanvasThumbnailIndex(key: string) {
  if (typeof window === "undefined") return [] as string[];
  let entries: Array<{ key: string; updatedAt: number }> = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CANVAS_THUMBNAIL_INDEX_KEY) || "[]");
    if (Array.isArray(parsed)) entries = parsed.filter((entry) => typeof entry?.key === "string");
  } catch { /* Ignore a malformed thumbnail index. */ }
  entries = [{ key, updatedAt: Date.now() }, ...entries.filter((entry) => entry.key !== key)];
  const evicted = entries.splice(CANVAS_THUMBNAIL_MAX_ENTRIES).map((entry) => entry.key);
  try { window.localStorage.setItem(CANVAS_THUMBNAIL_INDEX_KEY, JSON.stringify(entries)); } catch { /* The in-memory cache still works. */ }
  return evicted;
}

const makeCanvas = (name = "Untitled canvas"): CanvasDocument => {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    updatedAt: now,
    previewUpdatedAt: now,
    elements: [],
    appState: { theme: "dark" },
    files: {},
  };
};

type SceneSnapshot = {
  elements: readonly any[];
  files: Record<string, any>;
  backgroundColor?: string;
  zoom: number;
  scrollX: number;
  scrollY: number;
};

const readViewport = (appState: any) => ({
  zoom: Number(appState?.zoom?.value) || 1,
  scrollX: Number(appState?.scrollX) || 0,
  scrollY: Number(appState?.scrollY) || 0,
});

function sameElementReferences(previous: readonly any[], next: readonly any[]) {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) return false;
  }
  return true;
}

function sameFileReferences(previous: Record<string, any>, next: Record<string, any>) {
  if (previous === next) return true;
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) return false;
  for (const key of previousKeys) {
    if (!Object.prototype.hasOwnProperty.call(next, key) || previous[key] !== next[key]) return false;
  }
  return true;
}

// Library cards are only a glanceable preview. Exporting thousands of scene
// elements to SVG is synchronous work on the main thread, so use a spatially
// representative subset for unusually large scenes. The actual canvas remains
// complete and is never modified by this preview-only sampling.
function getPreviewColorLuminance(color: unknown): number | null {
  if (typeof color !== "string") return null;
  const normalized = color.trim().toLowerCase();
  if (normalized === "black") return 0;
  if (normalized === "white") return 1;
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(normalized)?.[1];
  if (!hex) return null;
  const expanded = hex.length === 3 ? hex.split("").map((value) => `${value}${value}`).join("") : hex;
  const channels = [0, 2, 4].map((offset) => parseInt(expanded.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getPreviewBackgroundColor(elements: any[]) {
  let darkColorCount = 0;
  let lightColorCount = 0;
  for (const element of elements) {
    if (element.type === "image") continue;
    for (const color of [element.strokeColor, element.backgroundColor]) {
      const luminance = getPreviewColorLuminance(color);
      if (luminance === null) continue;
      if (luminance < 0.42) darkColorCount += 1;
      else lightColorCount += 1;
    }
  }
  // Use a light surface when the source scene mostly uses dark ink, and a dark
  // surface when it mostly uses light ink. This keeps original element colors
  // intact while avoiding dark-on-dark or light-on-light previews.
  return darkColorCount >= lightColorCount ? "#f2f3f5" : "#1b1c20";
}

function CanvasCardPreview({ document, refreshSeed }: { document: CanvasDocument; refreshSeed: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedRefreshSeedRef = useRef(refreshSeed);
  const liveElements = useMemo(() => document.elements?.filter((element) => !element.isDeleted) ?? [], [document.elements]);
  const previewBackgroundColor = useMemo(() => getPreviewBackgroundColor(liveElements), [liveElements]);
  const cacheKey = `${CANVAS_THUMBNAIL_VERSION}:${document.id}`;
  const desiredRevision = document.previewUpdatedAt ?? document.updatedAt;
  const legacyCacheKeys = useMemo(() => [], []);
  const [previewState, setPreviewState] = useState<{ key: string } & CanvasThumbnail | null>(null);
  const [resolvedCacheKey, setResolvedCacheKey] = useState<string | null>(() => canvasThumbnailMemoryCache.has(cacheKey) ? cacheKey : null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const cachedPreview = previewState?.key === cacheKey ? previewState : canvasThumbnailMemoryCache.get(cacheKey) ?? null;
  const previewMarkup = cachedPreview?.markup ?? null;
  const needsRefresh = !cachedPreview || cachedPreview.revision !== desiredRevision;
  const forceRefresh = renderedRefreshSeedRef.current !== refreshSeed;
  const cacheReady = resolvedCacheKey === cacheKey || canvasThumbnailMemoryCache.has(cacheKey);

  useEffect(() => {
    let cancelled = false;
    if (!liveElements.length) return;

    void readCanvasThumbnail(cacheKey, legacyCacheKeys, desiredRevision).then((cachedThumbnail) => {
      if (cancelled) return;
      if (cachedThumbnail) setPreviewState({ key: cacheKey, ...cachedThumbnail });
      setResolvedCacheKey(cacheKey);
    });
    return () => { cancelled = true; };
  }, [cacheKey, desiredRevision, legacyCacheKeys, liveElements.length]);

  useEffect(() => {
    if (!cacheReady || (!needsRefresh && !forceRefresh) || !liveElements.length) return;
    const node = containerRef.current;
    let observer: IntersectionObserver | null = null;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsNearViewport(true);
        observer?.disconnect();
      }
    }, { rootMargin: "100px 0px" });
    observer.observe(node);
    return () => { observer?.disconnect(); };
  }, [cacheReady, forceRefresh, liveElements.length, needsRefresh]);

  useEffect(() => {
    let cancelled = false;
    if (!cacheReady || !isNearViewport || (!needsRefresh && !forceRefresh) || !liveElements.length) return;
    let renderJob: { promise: Promise<string | null>; cancel: () => void } | null = null;
    void (async () => {
      try {
        const referencedFileIds = new Set(liveElements
          .filter((element) => element.type === "image" && typeof element.fileId === "string")
          .map((element) => element.fileId as string));
        const previewFileMeta = Object.fromEntries(Object.entries(document.fileMeta || {}).filter(([id]) => referencedFileIds.has(id)));
        const previewLegacyFiles = Object.fromEntries(Object.entries(document.files || {}).filter(([id]) => referencedFileIds.has(id)));
        const scheduledRenderJob = scheduleCanvasThumbnailRender(async (signal) => {
          if (cancelled || signal.aborted) return null;
          const files = await loadCanvasFiles(document.id, previewFileMeta, previewLegacyFiles);
          if (cancelled || signal.aborted) return null;
          const { exportToSvg } = await import("@excalidraw/excalidraw");
          if (signal.aborted) return null;
          const svg = await exportToSvg({
            elements: liveElements,
            appState: {
              ...document.appState,
              exportBackground: true,
              viewBackgroundColor: previewBackgroundColor,
            },
            files,
          });
          if (signal.aborted) return null;
          const svgMarkup = svg.outerHTML;
          const rootTag = svgMarkup.match(/^<svg\b[^>]*>/i)?.[0];
          return rootTag
            ? `${rootTag.replace(/\s(?:width|height|preserveAspectRatio)=(['"]).*?\1/gi, "").slice(0, -1)} width="100%" height="100%" preserveAspectRatio="none">${svgMarkup.slice(rootTag.length)}`
            : svgMarkup;
        });
        renderJob = scheduledRenderJob;
        const markup = await scheduledRenderJob.promise;
        if (cancelled || !markup) return;
        renderedRefreshSeedRef.current = refreshSeed;
        setPreviewState({ key: cacheKey, markup, revision: desiredRevision });
        void writeCanvasThumbnail(cacheKey, markup, desiredRevision);
      } catch {
        // Keep the card's skeleton if this canvas cannot be previewed.
      }
    })();
    return () => {
      cancelled = true;
      renderJob?.cancel();
    };
  }, [cacheKey, cacheReady, desiredRevision, document.appState, document.fileMeta, document.files, document.id, forceRefresh, isNearViewport, liveElements, needsRefresh, previewBackgroundColor, previewMarkup, refreshSeed]);

  return <div ref={containerRef} className="canvas-preview">
    {previewMarkup ? <div className="canvas-preview-svg" dangerouslySetInnerHTML={{ __html: previewMarkup }} /> : <div className={`canvas-preview-shimmer ${isNearViewport ? "is-rendering" : ""}`} />}
  </div>;
}

export default function CanvasHome() {
  const dialogs = useAppDialogs();
  const [documents, setDocuments] = useState<CanvasDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [splitLayout, setSplitLayout] = useState<CanvasLayout | null>(null);
  const splitResizeRef = useRef<{ id: string; pointerId: number; startCoordinate: number; size: number; ratio: number; direction: "vertical" | "horizontal" } | null>(null);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [splitDropSide, setSplitDropSide] = useState<"left" | "right" | "top" | "bottom" | null>(null);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved on this device");
  const [isSavingCanvas, setIsSavingCanvas] = useState(false);
  const [loadedCanvasFiles, setLoadedCanvasFiles] = useState<{ canvasId: string; files: Record<string, any> } | null>(null);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinnedResourceIds, setPinnedResourceIds] = useState<string[]>([]);
  const [resources, setResources] = useState<CanvasResource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [expandedResourceIds, setExpandedResourceIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu | null>(null);
  const [canvasSearchOpen, setCanvasSearchOpen] = useState(false);
  const [canvasSearchQuery, setCanvasSearchQuery] = useState("");
  const [libraryResourceId, setLibraryResourceId] = useState<string | null>(null);
  const [thumbnailRefreshSeed, setThumbnailRefreshSeed] = useState(0);
  const [isRefreshingThumbnails, setIsRefreshingThumbnails] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const fileSaveQueueRef = useRef(new Map<string, Promise<CanvasFileMetaMap>>());
  const canvasFilesCacheRef = useRef(new Map<string, Record<string, any>>());
  const sceneSnapshotsRef = useRef(new Map<string, SceneSnapshot>());
  const restoredHashRef = useRef(false);
  const active = useMemo(() => documents.find((document) => document.id === activeId) ?? null, [documents, activeId]);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const canvasChangeHandlersRef = useRef(new Map<string, (elements: readonly any[], appState: any, files: Record<string, any>) => void>());
  const canvasApisRef = useRef(new Map<string, any>());
  const canvasApiHandlersRef = useRef(new Map<string, (api: any | null) => void>());
  const openTabs = useMemo(() => openTabIds
    .map((id) => documents.find((document) => document.id === id))
    .filter((document): document is CanvasDocument => Boolean(document))
    .sort((left, right) => Number(pinnedIds.includes(right.id)) - Number(pinnedIds.includes(left.id))),
  [documents, openTabIds, pinnedIds]);
  const filteredDocuments = useMemo(() => documents
    .filter((document) => document.name.toLowerCase().includes(sidebarQuery.trim().toLowerCase()))
    .sort((left, right) => right.updatedAt - left.updatedAt), [documents, sidebarQuery]);
  const libraryDocuments = useMemo(() => libraryResourceId
    ? documents.filter((document) => document.resourceId === libraryResourceId)
    : documents, [documents, libraryResourceId]);
  const canvasSearchResults = useMemo(() => {
    const query = canvasSearchQuery.trim().toLocaleLowerCase();
    if (!query) return documents.slice().sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 30);
    return documents
      .map((document) => ({
        document,
        resourceName: resources.find((resource) => resource.id === document.resourceId)?.name || "Unfiled",
      }))
      .filter(({ document, resourceName }) => `${document.name} ${document.content || ""} ${resourceName}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => right.document.updatedAt - left.document.updatedAt)
      .slice(0, 50);
  }, [canvasSearchQuery, documents, resources]);
  const resourcesByParent = useMemo(() => {
    const children = new Map<string, CanvasResource[]>();
    for (const resource of resources) {
      const parentKey = resource.parentId || "";
      const group = children.get(parentKey);
      if (group) group.push(resource);
      else children.set(parentKey, [resource]);
    }
    return children;
  }, [resources]);

  useEffect(() => {
    let cancelled = false;
    try {
      const workspace = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || "{}");
      const loadedResources = Array.isArray(workspace.resources) ? workspace.resources as CanvasResource[] : [];
      const fallbackResource = { id: "resource-scratchpad", name: "Scratchpad", parentId: null };
      const nextResources = loadedResources.length ? loadedResources : [fallbackResource];
      const resourceIds = new Set(nextResources.map((resource) => resource.id));
      setResources(nextResources);
      void loadCanvasDocuments<CanvasDocument>().then((loadedDocuments) => {
        if (cancelled) return;
        const documentsWithResources = loadedDocuments.map((document) => {
          const resourceId = document.resourceId && resourceIds.has(document.resourceId) ? document.resourceId : nextResources[0].id;
          return resourceId === document.resourceId ? document : { ...document, resourceId };
        });
        setDocuments(documentsWithResources);
        const validIds = new Set(documentsWithResources.map((document) => document.id));
        const loadedTabs = Array.isArray(workspace.openTabIds) ? workspace.openTabIds.filter((id: string) => validIds.has(id)) : [];
        const loadedPins = Array.isArray(workspace.pinnedIds) ? workspace.pinnedIds.filter((id: string) => validIds.has(id)) : [];
        const loadedResourcePins = Array.isArray(workspace.pinnedResourceIds) ? workspace.pinnedResourceIds.filter((id: string) => resourceIds.has(id)) : [];
        const loadedExpandedResources = Array.isArray(workspace.expandedResourceIds) ? workspace.expandedResourceIds.filter((id: string) => resourceIds.has(id)) : [];
        const oldSplit = workspace.splitPane as { firstId?: string; secondId?: string; direction?: string } | undefined;
        const savedLayout = workspace.splitLayout || (oldSplit?.firstId && oldSplit.secondId ? {
          kind: "split",
          id: crypto.randomUUID(),
          ratio: .5,
          direction: oldSplit.direction,
          first: { kind: "document", id: oldSplit.firstId },
          second: { kind: "document", id: oldSplit.secondId },
        } : null);
        const normalizedLayout = normalizeCanvasLayout(savedLayout);
        const loadedSplitLayout = isValidCanvasLayout(normalizedLayout, validIds) ? normalizedLayout : null;
        const splitDocumentIds: string[] = [];
        const collectLayoutIds = (node: CanvasLayout | null) => {
          if (!node) return;
          if (node.kind === "document") splitDocumentIds.push(node.id);
          else { collectLayoutIds(node.first); collectLayoutIds(node.second); }
        };
        collectLayoutIds(loadedSplitLayout);
        const loadedTabsWithSplit = Array.from(new Set([...loadedTabs, ...splitDocumentIds]));
        setOpenTabIds(loadedTabsWithSplit);
        setPinnedIds(loadedPins);
        setPinnedResourceIds(loadedResourcePins);
        setExpandedResourceIds(loadedExpandedResources.length ? loadedExpandedResources : [nextResources[0].id]);
        setSelectedResourceId(resourceIds.has(workspace.selectedResourceId) ? workspace.selectedResourceId : nextResources[0].id);
        setSplitLayout(loadedSplitLayout);
        setActiveId(loadedTabsWithSplit.includes(workspace.activeId) ? workspace.activeId : null);
        setFocusedPaneId(loadedTabsWithSplit.includes(workspace.focusedPaneId) ? workspace.focusedPaneId : workspace.activeId ?? null);
        setReady(true);
      }).catch(() => {
        if (!cancelled) { setDocuments([]); setReady(true); setSaveStatus("Canvas storage unavailable"); }
      });
    } catch {
      setDocuments([]);
      setReady(true);
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!splitLayout || !activeId) return;
    if (layoutHasDocument(splitLayout, activeId)) { setFocusedPaneId(activeId); return; }
    const targetId = focusedPaneId && layoutHasDocument(splitLayout, focusedPaneId) ? focusedPaneId : firstLayoutDocument(splitLayout);
    if (targetId) setSplitLayout((current) => replaceLayoutDocument(current, targetId, { kind: "document", id: activeId }));
    setFocusedPaneId(activeId);
  }, [activeId, focusedPaneId, splitLayout]);

  useEffect(() => {
    if (!ready || restoredHashRef.current) return;
    const canvasId = new URLSearchParams(window.location.hash.slice(1)).get("canvas");
    if (!canvasId) { restoredHashRef.current = true; return; }
    if (!documents.some((document) => document.id === canvasId)) return;
    restoredHashRef.current = true;
    setOpenTabIds((current) => current.includes(canvasId) ? current : [...current, canvasId]);
    setActiveId(canvasId);
  }, [documents, ready]);

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".canvas-context-menu")) setContextMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setContextMenu(null); };
    const onResize = () => setContextMenu(null);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      setSaveStatus("Saving…");
      void saveCanvasDocuments(documents).then(() => setSaveStatus("Saved on this device"))
        .catch(() => setSaveStatus("Could not save locally"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [documents, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ openTabIds, pinnedIds, pinnedResourceIds, activeId, focusedPaneId, splitLayout, resources, selectedResourceId, expandedResourceIds }));
  }, [activeId, expandedResourceIds, focusedPaneId, openTabIds, pinnedIds, pinnedResourceIds, ready, resources, selectedResourceId, splitLayout]);

  const captureCanvasSnapshot = useCallback((canvasId: string | null) => {
    if (!canvasId) return;
    const api = canvasApisRef.current.get(canvasId);
    const current = documentsRef.current.find((document) => document.id === canvasId);
    if (!api || !current) return;
    const elements = api.getSceneElements?.() || current.elements;
    const appState = api.getAppState?.() || current.appState || {};
    const files = api.getFiles?.() || {};
    const viewport = readViewport(appState);
    const oldViewport = readViewport(current.appState);
    const elementsChanged = !sameElementReferences(current.elements, elements);
    const appStateChanged = current.appState?.viewBackgroundColor !== appState.viewBackgroundColor ||
      current.appState?.gridSize !== appState.gridSize ||
      oldViewport.zoom !== viewport.zoom || oldViewport.scrollX !== viewport.scrollX || oldViewport.scrollY !== viewport.scrollY;

    sceneSnapshotsRef.current.set(canvasId, {
      elements,
      files,
      backgroundColor: appState.viewBackgroundColor,
      ...viewport,
    });
    if (Object.keys(files).length) rememberCanvasFiles(canvasFilesCacheRef.current, canvasId, files);
    if (!elementsChanged && !appStateChanged) return;

    const now = Date.now();
    const nextDocument: CanvasDocument = {
      ...current,
      elements: elementsChanged ? [...elements] : current.elements,
      appState: {
        ...current.appState,
        theme: "dark",
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
        zoom: appState.zoom,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
      },
      updatedAt: now,
      previewUpdatedAt: elementsChanged || current.appState?.viewBackgroundColor !== appState.viewBackgroundColor
        ? now
        : current.previewUpdatedAt ?? current.updatedAt,
    };
    const nextDocuments = documentsRef.current.map((document) => document.id === canvasId ? nextDocument : document);
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
  }, []);

  const openCanvas = useCallback((id: string) => {
    captureCanvasSnapshot(activeId);
    setLibraryResourceId(null);
    setOpenTabIds((current) => current.includes(id) ? current : [...current, id]);
    setActiveId(id);
    const resourceId = documents.find((document) => document.id === id)?.resourceId;
    if (resourceId) {
      setSelectedResourceId(resourceId);
      setExpandedResourceIds((current) => {
        const next = new Set(current);
        let resource = resources.find((candidate) => candidate.id === resourceId);
        while (resource) {
          next.add(resource.id);
          resource = resource.parentId ? resources.find((candidate) => candidate.id === resource?.parentId) : undefined;
        }
        return Array.from(next);
      });
    }
  }, [activeId, captureCanvasSnapshot, documents, resources]);

  const createCanvas = useCallback((name?: string, preferredResourceId?: string) => {
    captureCanvasSnapshot(activeId);
    const resourceId = preferredResourceId && resources.some((resource) => resource.id === preferredResourceId)
      ? preferredResourceId
      : selectedResourceId && resources.some((resource) => resource.id === selectedResourceId)
      ? selectedResourceId
      : resources[0]?.id;
    const document = { ...makeCanvas(name), resourceId };
    setDocuments((current) => [document, ...current]);
    setOpenTabIds((current) => [...current, document.id]);
    setActiveId(document.id);
    setLibraryResourceId(null);
    if (resourceId) setExpandedResourceIds((current) => {
      const next = new Set(current);
      let resource = resources.find((item) => item.id === resourceId);
      while (resource) {
        next.add(resource.id);
        resource = resource.parentId ? resources.find((item) => item.id === resource?.parentId) : undefined;
      }
      return Array.from(next);
    });
  }, [activeId, captureCanvasSnapshot, resources, selectedResourceId]);

  const createNote = useCallback(() => {
    captureCanvasSnapshot(activeId);
    const resourceId = libraryResourceId && resources.some((resource) => resource.id === libraryResourceId)
      ? libraryResourceId
      : selectedResourceId && resources.some((resource) => resource.id === selectedResourceId)
      ? selectedResourceId
      : resources[0]?.id;
    const document: CanvasDocument = { ...makeCanvas("Untitled note"), kind: "note", content: "", resourceId };
    setDocuments((current) => [document, ...current]);
    setOpenTabIds((current) => [...current, document.id]);
    setActiveId(document.id);
    setLibraryResourceId(null);
    if (resourceId) {
      setSelectedResourceId(resourceId);
      setExpandedResourceIds((current) => {
        const next = new Set(current);
        let resource = resources.find((item) => item.id === resourceId);
        while (resource) {
          next.add(resource.id);
          resource = resource.parentId ? resources.find((item) => item.id === resource?.parentId) : undefined;
        }
        return Array.from(next);
      });
    }
  }, [activeId, captureCanvasSnapshot, libraryResourceId, resources, selectedResourceId]);

  const createSubCanvas = useCallback((canvasId: string) => {
    const parentCanvas = documents.find((document) => document.id === canvasId);
    if (!parentCanvas?.resourceId) return;
    const nextIndex = documents.filter((document) => document.resourceId === parentCanvas.resourceId).length + 1;
    setSelectedResourceId(parentCanvas.resourceId);
    setLibraryResourceId(null);
    createCanvas(`Sub Canvas ${nextIndex}`, parentCanvas.resourceId);
  }, [createCanvas, documents]);

  const updateCanvas = useCallback((id: string, update: Partial<CanvasDocument>) => {
    setDocuments((current) => current.map((document) => {
      if (document.id !== id) return document;
      const hasChanges = Object.entries(update).some(([key, value]) => document[key as keyof CanvasDocument] !== value);
      if (!hasChanges) return document;
      const now = Date.now();
      const previewChanged = "elements" in update || "appState" in update ||
        ("files" in update && update.files !== undefined) ||
        ("fileMeta" in update && !("files" in update));
      return { ...document, ...update, updatedAt: now, ...(previewChanged ? { previewUpdatedAt: now } : {}) };
    }));
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const cachedFiles = canvasFilesCacheRef.current.get(active.id);
    if (cachedFiles) {
      setLoadedCanvasFiles({ canvasId: active.id, files: cachedFiles });
      return () => { cancelled = true; };
    }
    void loadCanvasFiles(active.id, active.fileMeta, active.files).then(async (files) => {
      if (cancelled) return;
      rememberCanvasFiles(canvasFilesCacheRef.current, active.id, files);
      sceneSnapshotsRef.current.set(active.id, {
        elements: active.elements,
        files,
        backgroundColor: active.appState?.viewBackgroundColor,
        ...readViewport(active.appState),
      });
      if (active.files && Object.keys(active.files).length > 0) {
        try {
          const fileMeta = await saveCanvasFiles(active.id, files, active.fileMeta);
          if (!cancelled) updateCanvas(active.id, { files: undefined, fileMeta });
        } catch {
          // Keep legacy inline data in local storage if migration cannot be completed.
        }
      }
      if (cancelled) return;
      setLoadedCanvasFiles({ canvasId: active.id, files });
    }).catch(() => {
      if (cancelled) return;
      const fallbackFiles = active.files || {};
      rememberCanvasFiles(canvasFilesCacheRef.current, active.id, fallbackFiles);
      setLoadedCanvasFiles({ canvasId: active.id, files: fallbackFiles });
      setSaveStatus("Image storage unavailable");
    });
    return () => { cancelled = true; };
  }, [active?.id]);

  const handleChange = useCallback((canvasId: string, elements: readonly any[], appState: any, files: Record<string, any>) => {
    const backgroundColor = appState.viewBackgroundColor;
    const viewport = readViewport(appState);
    const previous = sceneSnapshotsRef.current.get(canvasId);
    if (previous && (
      previous.zoom !== viewport.zoom ||
      previous.scrollX !== viewport.scrollX ||
      previous.scrollY !== viewport.scrollY
    )) {
      // Pan and zoom callbacks only update the camera. Keep the latest Excalidraw
      // references so later edits can be checked in constant time when unchanged.
      previous.elements = elements;
      previous.files = files;
      previous.backgroundColor = backgroundColor;
      previous.zoom = viewport.zoom;
      previous.scrollX = viewport.scrollX;
      previous.scrollY = viewport.scrollY;
      return;
    }
    if (previous && previous.elements === elements && previous.files === files && previous.backgroundColor === backgroundColor) {
      previous.zoom = viewport.zoom;
      previous.scrollX = viewport.scrollX;
      previous.scrollY = viewport.scrollY;
      return;
    }
    const elementsChanged = !previous || !sameElementReferences(previous.elements, elements);
    const filesChanged = !previous || !sameFileReferences(previous.files, files);
    const backgroundChanged = !previous || previous.backgroundColor !== backgroundColor;
    if (!elementsChanged && !filesChanged && !backgroundChanged) return;
    sceneSnapshotsRef.current.set(canvasId, { elements, files, backgroundColor, ...viewport });
    if (elementsChanged || backgroundChanged) {
      updateCanvas(canvasId, {
        ...(elementsChanged ? { elements: [...elements] } : {}),
        ...(backgroundChanged ? { appState: { theme: "dark", viewBackgroundColor: backgroundColor } } : {}),
        ...(filesChanged ? { files: undefined } : {}),
      });
    }
    if (!filesChanged) return;
    const currentDocument = documentsRef.current.find((document) => document.id === canvasId);
    if (currentDocument?.id === canvasId && Object.keys(currentDocument.fileMeta || {}).length > 0 && !canvasFilesCacheRef.current.has(canvasId)) return;
    const fileSnapshot = { ...files };
    rememberCanvasFiles(canvasFilesCacheRef.current, canvasId, fileSnapshot);
    const previousSave = fileSaveQueueRef.current.get(canvasId);
    const currentMeta = documentsRef.current.find((document) => document.id === canvasId)?.fileMeta || {};
    const saving = (previousSave ? previousSave.catch(() => currentMeta) : Promise.resolve(currentMeta))
      .then((previousMeta) => saveCanvasFiles(canvasId, fileSnapshot, previousMeta));
    fileSaveQueueRef.current.set(canvasId, saving);
    void saving.then((fileMeta) => {
      if (fileSaveQueueRef.current.get(canvasId) !== saving) return;
      updateCanvas(canvasId, { fileMeta });
      fileSaveQueueRef.current.delete(canvasId);
    }).catch(() => {
      if (fileSaveQueueRef.current.get(canvasId) === saving) fileSaveQueueRef.current.delete(canvasId);
      setSaveStatus("Canvas saved; image save failed");
    });
  }, [updateCanvas]);

  const getCanvasChangeHandler = useCallback((canvasId: string) => {
    const existing = canvasChangeHandlersRef.current.get(canvasId);
    if (existing) return existing;
    const handler = (elements: readonly any[], appState: any, files: Record<string, any>) => handleChange(canvasId, elements, appState, files);
    canvasChangeHandlersRef.current.set(canvasId, handler);
    return handler;
  }, [handleChange]);

  const getCanvasApiHandler = useCallback((canvasId: string) => {
    const existing = canvasApiHandlersRef.current.get(canvasId);
    if (existing) return existing;
    const handler = (api: any | null) => {
      if (api) canvasApisRef.current.set(canvasId, api);
      else canvasApisRef.current.delete(canvasId);
    };
    canvasApiHandlersRef.current.set(canvasId, handler);
    return handler;
  }, []);

  const saveActiveCanvas = useCallback(async () => {
    const canvasId = activeId;
    if (!canvasId || isSavingCanvas) return;
    const initialDocument = documentsRef.current.find((document) => document.id === canvasId);
    if (!initialDocument) return;
    const api = canvasApisRef.current.get(canvasId);
    const elements = api?.getSceneElements?.() ?? initialDocument.elements;
    const appState = api?.getAppState?.() ?? initialDocument.appState ?? {};
    const canReadFiles = loadedCanvasFiles?.canvasId === canvasId && typeof api?.getFiles === "function";
    const files = canReadFiles ? api.getFiles() : null;

    setIsSavingCanvas(true);
    setSaveStatus("Saving canvas…");
    try {
      const pendingFileSave = fileSaveQueueRef.current.get(canvasId);
      if (pendingFileSave) await pendingFileSave.catch(() => undefined);

      const latestDocument = documentsRef.current.find((document) => document.id === canvasId) || initialDocument;
      const fileMeta = canReadFiles
        ? await saveCanvasFiles(canvasId, files || {}, latestDocument.fileMeta)
        : latestDocument.fileMeta;
      const savedElements = [...elements];
      const elementsChanged = !sameElementReferences(latestDocument.elements, savedElements);
      const nextDocument: CanvasDocument = {
        ...latestDocument,
        elements: elementsChanged ? savedElements : latestDocument.elements,
        appState: {
          ...latestDocument.appState,
          theme: "dark",
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
          zoom: appState.zoom,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
        },
        ...(canReadFiles ? { files: undefined, fileMeta } : {}),
        updatedAt: Date.now(),
        ...(elementsChanged ? { previewUpdatedAt: Date.now() } : {}),
      };
      const nextDocuments = documentsRef.current.map((document) => document.id === canvasId ? nextDocument : document);
      documentsRef.current = nextDocuments;
      setDocuments(nextDocuments);
      await saveCanvasDocuments(nextDocuments);
      setSaveStatus("Canvas saved");
      window.setTimeout(() => setSaveStatus((status) => status === "Canvas saved" ? "Saved on this device" : status), 1800);
    } catch {
      setSaveStatus("Could not save canvas locally");
    } finally {
      setIsSavingCanvas(false);
    }
  }, [activeId, isSavingCanvas, loadedCanvasFiles]);

  useEffect(() => {
    if (!activeId) return;
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      void saveActiveCanvas();
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [activeId, saveActiveCanvas]);

  const downloadDocument = useCallback(async (document: CanvasDocument) => {
    if (document.kind === "note") {
      const noteUrl = URL.createObjectURL(new Blob([document.content || ""], { type: "text/plain;charset=utf-8" }));
      const anchor = window.document.createElement("a");
      anchor.href = noteUrl;
      anchor.download = `${document.name.trim() || "note"}.txt`;
      anchor.click();
      URL.revokeObjectURL(noteUrl);
      return;
    }
    const files = await loadCanvasFiles(document.id, document.fileMeta, document.files);
    const payload = {
      type: "excalidraw",
      version: 2,
      source: "alleviate-canvas",
      elements: document.elements,
      appState: document.appState,
      files,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${document.name.trim() || "canvas"}.excalidraw`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const refreshCanvasPreviews = useCallback(async () => {
    if (isRefreshingThumbnails) return;
    setIsRefreshingThumbnails(true);
    try {
      setThumbnailRefreshSeed((seed) => seed + 1);
    } finally {
      setIsRefreshingThumbnails(false);
    }
  }, [isRefreshingThumbnails]);

  const importCanvas = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const document = {
        ...makeCanvas(file.name.replace(/\.excalidraw(?:\.json)?$/i, "") || "Imported canvas"),
        resourceId: selectedResourceId ?? resources[0]?.id,
        elements: Array.isArray(parsed.elements) ? parsed.elements : [],
        appState: { ...parsed.appState, theme: "dark" },
        files: {},
      } satisfies CanvasDocument;
      const importedFiles = parsed.files && typeof parsed.files === "object" ? parsed.files : {};
      const fileMeta = await saveCanvasFiles(document.id, importedFiles);
      document.fileMeta = fileMeta;
      rememberCanvasFiles(canvasFilesCacheRef.current, document.id, importedFiles);
      sceneSnapshotsRef.current.set(document.id, {
        elements: document.elements,
        files: importedFiles,
        backgroundColor: document.appState?.viewBackgroundColor,
        ...readViewport(document.appState),
      });
      captureCanvasSnapshot(activeId);
      setDocuments((current) => [document, ...current]);
      setOpenTabIds((current) => [...current, document.id]);
      setActiveId(document.id);
    } catch {
      await dialogs.alert({ title: "Import failed", message: "The canvas could not be imported. Check that the file is a valid Excalidraw file and that local storage has enough space." });
    }
    if (importInputRef.current) importInputRef.current.value = "";
  }, [activeId, captureCanvasSnapshot, dialogs, resources, selectedResourceId]);

  const removeCanvas = useCallback((id: string) => {
    setDocuments((current) => current.filter((document) => document.id !== id));
    setOpenTabIds((current) => current.filter((tabId) => tabId !== id));
    setPinnedIds((current) => current.filter((pinnedId) => pinnedId !== id));
    if (layoutHasDocument(splitLayout, id)) {
      const remaining = removeLayoutDocument(splitLayout, id);
      const survivorId = firstLayoutDocument(remaining);
      if (remaining?.kind === "document") setSplitLayout(null);
      else setSplitLayout(remaining);
      if (activeId === id || !survivorId) setActiveId(survivorId);
      if (focusedPaneId === id || !focusedPaneId) setFocusedPaneId(survivorId);
    } else if (activeId === id) setActiveId(null);
  }, [activeId, focusedPaneId, splitLayout]);

  const closeTab = useCallback((id: string) => {
    if (pinnedIds.includes(id)) return;
    if (activeId === id || layoutHasDocument(splitLayout, id)) captureCanvasSnapshot(id);
    const closingIndex = openTabIds.indexOf(id);
    const remaining = openTabIds.filter((tabId) => tabId !== id);
    setOpenTabIds(remaining);
    if (layoutHasDocument(splitLayout, id)) {
      const remainingLayout = removeLayoutDocument(splitLayout, id);
      const survivingId = firstLayoutDocument(remainingLayout);
      setSplitLayout(remainingLayout?.kind === "document" ? null : remainingLayout);
      if (activeId === id) setActiveId(survivingId);
      if (focusedPaneId === id) setFocusedPaneId(survivingId);
    } else if (activeId === id) setActiveId(remaining[Math.min(closingIndex, remaining.length - 1)] ?? null);
  }, [activeId, captureCanvasSnapshot, focusedPaneId, openTabIds, pinnedIds, splitLayout]);

  const reorderTab = useCallback((draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setOpenTabIds((current) => {
      const from = current.indexOf(draggedId);
      const to = current.indexOf(targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      return next;
    });
  }, []);

  const createSplit = useCallback((draggedId: string, side: "left" | "right" | "top" | "bottom", targetId = activeId) => {
    if (!targetId || draggedId === targetId || !documentsRef.current.some((document) => document.id === draggedId)) return;
    captureCanvasSnapshot(activeId);
    setOpenTabIds((current) => current.includes(draggedId) ? current : [...current, draggedId]);
    setSplitLayout((current) => {
      if (current && layoutHasDocument(current, draggedId)) {
        return mapLayoutDocuments(current, (id) => id === targetId ? draggedId : id === draggedId ? targetId : id);
      }
      const target = current || { kind: "document" as const, id: targetId };
      const before = side === "left" || side === "top";
      const draggedLeaf: CanvasLayout = { kind: "document", id: draggedId };
      const split: CanvasLayout = { kind: "split", id: crypto.randomUUID(), direction: side === "left" || side === "right" ? "vertical" : "horizontal", ratio: .5, first: before ? draggedLeaf : { kind: "document", id: targetId }, second: before ? { kind: "document", id: targetId } : draggedLeaf };
      return replaceLayoutDocument(target, targetId, split);
    });
    setFocusedPaneId(draggedId);
    setActiveId(draggedId);
  }, [activeId, captureCanvasSnapshot]);

  const dropIntoSplitPane = useCallback((id: string, targetId: string) => {
    if (!splitLayout || id === targetId || !documentsRef.current.some((document) => document.id === id)) return;
    captureCanvasSnapshot(activeId);
    setOpenTabIds((current) => current.includes(id) ? current : [...current, id]);
    if (layoutHasDocument(splitLayout, id)) {
      setSplitLayout((current) => mapLayoutDocuments(current, (leafId) => leafId === targetId ? id : leafId === id ? targetId : leafId));
    } else {
      setSplitLayout((current) => replaceLayoutDocument(current, targetId, { kind: "document", id }));
    }
    setFocusedPaneId(id);
    setActiveId(id);
  }, [activeId, captureCanvasSnapshot, splitLayout]);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((current) => current.includes(id) ? current.filter((pinnedId) => pinnedId !== id) : [...current, id]);
    setOpenTabIds((current) => current.includes(id) ? current : [...current, id]);
  }, []);

  const toggleResourcePin = useCallback((id: string) => {
    setPinnedResourceIds((current) => current.includes(id) ? current.filter((resourceId) => resourceId !== id) : [...current, id]);
  }, []);

  const createResource = useCallback(async (parentId: string | null) => {
    setContextMenu(null);
    const name = (await dialogs.prompt({ title: "Create resource card", message: "Resource card name", defaultValue: "New resource card", confirmLabel: "Create" }))?.trim();
    if (!name) return;
    const resource: CanvasResource = { id: crypto.randomUUID(), name, parentId };
    setResources((current) => [...current, resource]);
    setSelectedResourceId(resource.id);
    if (parentId) setExpandedResourceIds((current) => current.includes(parentId) ? current : [...current, parentId]);
  }, [dialogs]);

  const handleResourceContextMenu = useCallback((event: React.MouseEvent, resourceId: string) => {
    event.preventDefault();
    setSelectedResourceId(resourceId);
    setContextMenu({ kind: "resource", id: resourceId, x: event.clientX, y: event.clientY });
  }, []);

  const handleCanvasContextMenu = useCallback((event: React.MouseEvent, canvasId: string) => {
    event.preventDefault();
    setContextMenu({ kind: "canvas", id: canvasId, x: event.clientX, y: event.clientY });
  }, []);

  const renameResource = useCallback(async (resourceId: string) => {
    const resource = resources.find((item) => item.id === resourceId);
    setContextMenu(null);
    if (!resource) return;
    const name = (await dialogs.prompt({ title: "Rename resource card", message: "Resource card name", defaultValue: resource.name, confirmLabel: "Save" }))?.trim();
    if (name) setResources((current) => current.map((item) => item.id === resourceId ? { ...item, name } : item));
  }, [dialogs, resources]);

  const deleteResource = useCallback(async (resourceId: string) => {
    const resource = resources.find((item) => item.id === resourceId);
    setContextMenu(null);
    if (!resource || !resource.parentId) return;
    if (!await dialogs.confirm({ title: "Delete resource card?", message: `Delete “${resource.name}” and its subfolders? Canvases will be moved to its parent.`, confirmLabel: "Delete", destructive: true })) return;
    const removedIds = new Set([resourceId]);
    let foundChild = true;
    while (foundChild) {
      foundChild = false;
      resources.forEach((item) => {
        if (item.parentId && removedIds.has(item.parentId) && !removedIds.has(item.id)) {
          removedIds.add(item.id);
          foundChild = true;
        }
      });
    }
    setResources((current) => current.filter((item) => !removedIds.has(item.id)));
    setDocuments((current) => current.map((document) => document.resourceId && removedIds.has(document.resourceId) ? { ...document, resourceId: resource.parentId! } : document));
    setExpandedResourceIds((current) => current.filter((id) => !removedIds.has(id)));
    setPinnedResourceIds((current) => current.filter((id) => !removedIds.has(id)));
    if (selectedResourceId && removedIds.has(selectedResourceId)) setSelectedResourceId(resource.parentId);
    if (libraryResourceId && removedIds.has(libraryResourceId)) setLibraryResourceId(null);
  }, [dialogs, libraryResourceId, resources, selectedResourceId]);

  const renameCanvas = useCallback(async (canvasId: string) => {
    const canvas = documents.find((item) => item.id === canvasId);
    setContextMenu(null);
    if (!canvas) return;
    const name = (await dialogs.prompt({ title: canvas.kind === "note" ? "Rename note" : "Rename canvas", message: canvas.kind === "note" ? "Note name" : "Canvas name", defaultValue: canvas.name, confirmLabel: "Save" }))?.trim();
    if (name) updateCanvas(canvasId, { name });
  }, [dialogs, documents, updateCanvas]);

  const showCanvasChildren = useCallback((canvasId: string) => {
    const canvas = documents.find((item) => item.id === canvasId);
    setContextMenu(null);
    if (!canvas?.resourceId) return;
    captureCanvasSnapshot(activeId);
    setSelectedResourceId(canvas.resourceId);
    setLibraryResourceId(canvas.resourceId);
    setActiveId(null);
    setSplitLayout(null);
    setFocusedPaneId(null);
    setExpandedResourceIds((current) => {
      const next = new Set(current);
      let resource = resources.find((item) => item.id === canvas.resourceId);
      while (resource) {
        next.add(resource.id);
        resource = resource.parentId ? resources.find((item) => item.id === resource?.parentId) : undefined;
      }
      return Array.from(next);
    });
  }, [activeId, captureCanvasSnapshot, documents, resources]);

  const copyCanvasUrl = useCallback(async (canvasId: string) => {
    setContextMenu(null);
    const url = new URL("/canvas", window.location.href);
    url.hash = `canvas=${encodeURIComponent(canvasId)}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      setSaveStatus("Canvas link copied");
      window.setTimeout(() => setSaveStatus("Saved on this device"), 1800);
    } catch {
      const value = await dialogs.prompt({ title: "Copy canvas link", message: "Copy this link", defaultValue: url.toString(), confirmLabel: "Done" });
      if (value) {
        try { await navigator.clipboard.writeText(value); } catch { /* Keep the link available in the dialog input. */ }
      }
    }
  }, [dialogs]);

  const toggleResourceExpanded = useCallback((id: string) => {
    setExpandedResourceIds((current) => current.includes(id) ? current.filter((resourceId) => resourceId !== id) : [...current, id]);
  }, []);

  const selectResourceCard = useCallback((id: string) => {
    captureCanvasSnapshot(activeId);
    setSelectedResourceId(id);
    setLibraryResourceId(id);
    setActiveId(null);
    setSplitLayout(null);
    setFocusedPaneId(null);
  }, [activeId, captureCanvasSnapshot]);

  const renderDocumentContent = (document: CanvasDocument) => {
    if (document.kind === "note") return <CanvasNoteEditor key={document.id} note={document} onUpdate={(update) => updateCanvas(document.id, update)} />;
    const files = loadedCanvasFiles?.canvasId === document.id
      ? loadedCanvasFiles.files
      : canvasFilesCacheRef.current.get(document.id) || document.files || EMPTY_FILES;
    return <section className="canvas-wrap" aria-label={`Drawing canvas: ${document.name || "Untitled canvas"}`}>
      <CanvasDrawingSurface document={document} files={files} onChange={getCanvasChangeHandler(document.id)} onApi={getCanvasApiHandler(document.id)} />
    </section>;
  };

  const closeSplit = (id: string) => {
    if (!splitLayout) return;
    const remainingLayout = removeLayoutDocument(splitLayout, id);
    const remainingId = firstLayoutDocument(remainingLayout);
    captureCanvasSnapshot(activeId);
    setSplitLayout(remainingLayout?.kind === "document" ? null : remainingLayout);
    setFocusedPaneId(remainingId);
    setActiveId(remainingId);
  };

  const renderDocumentPane = (id: string): ReactNode => {
    const document = documents.find((item) => item.id === id);
    if (!document) return null;
    return <section key={id} className={`canvas-split-pane ${activeId === id ? "is-focused" : ""}`} aria-label={`Canvas pane: ${document.name || "Untitled"}`} onMouseDown={() => { setFocusedPaneId(id); setActiveId(id); }} onDragOver={(event) => { if (draggingTabId) event.preventDefault(); }} onDrop={(event) => {
      const draggedId = event.dataTransfer.getData("application/x-canvas-document-id");
      if (draggedId) { event.preventDefault(); event.stopPropagation(); dropIntoSplitPane(draggedId, id); }
    }}>
      <div className="canvas-split-pane-header"><span title={document.name}>{document.name || (document.kind === "note" ? "Untitled note" : "Untitled canvas")}</span><button type="button" aria-label="Close split pane" title="Close split pane" onClick={() => closeSplit(id)}><X size={14} /></button></div>
      {renderDocumentContent(document)}
      {draggingTabId && draggingTabId !== id && <div className="canvas-split-drop-overlay canvas-pane-split-overlay" onDragOver={(event) => event.preventDefault()}>
        <div className="canvas-split-drop-hint">Split this pane</div>
        {(["left", "right", "top", "bottom"] as const).map((side) => <button key={side} type="button" className={`canvas-split-drop-zone zone-${side} ${splitDropSide === side ? "is-hovered" : ""}`} onDragEnter={() => setSplitDropSide(side)} onDragOver={(event) => { event.preventDefault(); setSplitDropSide(side); }} onDrop={(event) => { const draggedId = event.dataTransfer.getData("application/x-canvas-document-id") || draggingTabId; event.preventDefault(); event.stopPropagation(); createSplit(draggedId, side, id); setSplitDropSide(null); }}><span>{side === "left" ? "Split left" : side === "right" ? "Split right" : side === "top" ? "Split above" : "Split below"}</span><small>{side === "left" || side === "right" ? "Vertical" : "Horizontal"}</small></button>)}
        <button type="button" className="canvas-split-drop-zone zone-center" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const draggedId = event.dataTransfer.getData("application/x-canvas-document-id") || draggingTabId; event.preventDefault(); event.stopPropagation(); dropIntoSplitPane(draggedId, id); }}>Move tab here</button>
      </div>}
    </section>;
  };

  const renderLayout = (node: CanvasLayout): ReactNode => node.kind === "document"
    ? renderDocumentPane(node.id)
    : <div className={`canvas-split-layout is-${node.direction}`} key={node.id} style={{ "--split-first": `${node.ratio}fr`, "--split-second": `${1 - node.ratio}fr` } as CSSProperties}>
      {renderLayout(node.first)}
      <div
        className={`canvas-split-divider is-${node.direction}`}
        role="separator"
        aria-label={node.direction === "vertical" ? "Resize side-by-side panes" : "Resize stacked panes"}
        aria-orientation={node.direction === "vertical" ? "vertical" : "horizontal"}
        aria-valuenow={Math.round(node.ratio * 100)}
        aria-valuemin={15}
        aria-valuemax={85}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
          const dividerBounds = event.currentTarget.getBoundingClientRect();
          if (!bounds) return;
          const direction = dividerBounds.width < dividerBounds.height ? "vertical" : "horizontal";
          const size = direction === "vertical" ? bounds.width : bounds.height;
          splitResizeRef.current = { id: node.id, pointerId: event.pointerId, startCoordinate: direction === "vertical" ? event.clientX : event.clientY, size, ratio: node.ratio, direction };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const resize = splitResizeRef.current;
          if (!resize || resize.pointerId !== event.pointerId || resize.id !== node.id) return;
          const coordinate = resize.direction === "vertical" ? event.clientX : event.clientY;
          const delta = (coordinate - resize.startCoordinate) / Math.max(1, resize.size);
          const ratio = Math.min(.85, Math.max(.15, resize.ratio + delta));
          setSplitLayout((current) => updateLayoutRatio(current, node.id, ratio));
        }}
        onPointerUp={(event) => { if (splitResizeRef.current?.pointerId === event.pointerId) splitResizeRef.current = null; }}
        onPointerCancel={() => { splitResizeRef.current = null; }}
        onLostPointerCapture={() => { splitResizeRef.current = null; }}
        onKeyDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const direction = bounds.width < bounds.height ? "vertical" : "horizontal";
          const negative = direction === "vertical" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
          const positive = direction === "vertical" ? event.key === "ArrowRight" : event.key === "ArrowDown";
          if (!negative && !positive) return;
          event.preventDefault();
          const ratio = Math.min(.85, Math.max(.15, node.ratio + (negative ? -.02 : .02)));
          setSplitLayout((current) => updateLayoutRatio(current, node.id, ratio));
        }}
      />
      {renderLayout(node.second)}
    </div>;

  if (!ready) return <main className="loading-screen">Opening your canvas…</main>;

  return (
    <main className="app-shell">
      <AppSidebar active="canvas" />
      <input
        ref={importInputRef}
        type="file"
        accept=".excalidraw,.json,application/json"
        hidden
        onChange={(event) => void importCanvas(event.target.files?.[0])}
      />

      <div className="workspace-body">
        {sidebarOpen && (
          <aside className="workspace-sidebar" aria-label="Canvas sidebar">
            <div className="sidebar-heading">
              <div className="sidebar-heading-label"><Library size={14} /><h2>RESOURCE CARDS</h2></div>
              <button className="icon-btn sidebar-add" title="Add resource card" aria-label="Add resource card" onClick={() => createResource(null)}><Plus size={17} /></button>
            </div>
            <label className="sidebar-search"><Search size={14} /><input value={sidebarQuery} onChange={(event) => setSidebarQuery(event.target.value)} placeholder="Find a canvas or note" /></label>
            <div className="sidebar-group sidebar-all-group">
              <div className="sidebar-group-title"><Library size={12} /> Resource cards <span>{resources.length}</span></div>
              {(resourcesByParent.get("") || []).length ? (resourcesByParent.get("") || []).map((resource) => (
                <ResourceTreeNode
                  key={resource.id}
                  resource={resource}
                  resourcesByParent={resourcesByParent}
                  selectedResourceId={selectedResourceId}
                  selectResource={selectResourceCard}
                  expandedIds={expandedResourceIds}
                  pinnedResourceIds={pinnedResourceIds}
                  toggleResourcePin={toggleResourcePin}
                  toggleExpanded={toggleResourceExpanded}
                  createResource={createResource}
                  onResourceContextMenu={handleResourceContextMenu}
                />
              )) : <p className="sidebar-empty">No resource cards yet.</p>}
            </div>
            <div className="sidebar-footer">{saveStatus}</div>
          </aside>
        )}

        <div className="workspace-main">
          <nav className="tabbar" aria-label="Open canvas tabs">
              <button className="icon-btn tabbar-sidebar-toggle" title={sidebarOpen ? "Hide sidebar" : "Show sidebar"} aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}><Menu size={16} /></button>
              <div className="tabbar-scroll">
                {resources.filter((resource) => pinnedResourceIds.includes(resource.id)).map((resource) => (
                  <div key={`resource-${resource.id}`} className={`canvas-tab resource-tab ${selectedResourceId === resource.id ? "is-active" : ""}`}>
                    <button className="tab-select" title={resource.name} onClick={() => setSelectedResourceId(resource.id)}>
                      <Library size={12} className="tab-pin" />
                      <span>{resource.name}</span>
                    </button>
                    <button className="tab-close" aria-label={`Unpin ${resource.name}`} title="Unpin resource card" onClick={() => toggleResourcePin(resource.id)}><Pin size={12} /></button>
                  </div>
                ))}
                {openTabs.map((document) => (
                  <div key={document.id} className={`canvas-tab ${activeId === document.id ? "is-active" : ""}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-canvas-document-id", document.id); setDraggingTabId(document.id); }} onDragEnd={() => { setDraggingTabId(null); setSplitDropSide(null); }} onDragOver={(event) => { if (draggingTabId && draggingTabId !== document.id) event.preventDefault(); }} onDrop={(event) => { const draggedId = event.dataTransfer.getData("application/x-canvas-document-id"); if (draggedId && draggedId !== document.id) { event.preventDefault(); event.stopPropagation(); reorderTab(draggedId, document.id); } }} onContextMenu={(event) => handleCanvasContextMenu(event, document.id)}>
                    <button className="tab-select" title={document.name} onClick={() => openCanvas(document.id)}>
                      {pinnedIds.includes(document.id) && <Pin size={12} className="tab-pin" />}
                      <span>{document.name || (document.kind === "note" ? "Untitled note" : "Untitled canvas")}</span>
                    </button>
                    <button className="tab-close" aria-label={pinnedIds.includes(document.id) ? "Unpin canvas tab" : "Close canvas tab"} title={pinnedIds.includes(document.id) ? "Unpin to close tab" : "Close tab"} onClick={() => pinnedIds.includes(document.id) ? togglePin(document.id) : closeTab(document.id)}>
                      {pinnedIds.includes(document.id) ? <Pin size={12} /> : <X size={14} />}
                    </button>
                  </div>
                ))}
              </div>
              {(openTabs.length > 0 || resources.some((resource) => pinnedResourceIds.includes(resource.id))) && <>
                <button className="tab-action" title="Search and open canvas or note" aria-label="Search and open canvas or note" onClick={() => { setCanvasSearchQuery(""); setCanvasSearchOpen(true); }}><Search size={15} /></button>
                {activeId && <button className="tab-action" title="Save canvas (Ctrl+S)" aria-label="Save canvas" onClick={() => void saveActiveCanvas()} disabled={isSavingCanvas}><Save size={15} /></button>}
                <button className="tab-new" title="New canvas" aria-label="New canvas" onClick={() => createCanvas()}><Plus size={16} /></button>
              </>}
          </nav>

          <div className={`canvas-content-region ${splitLayout ? "is-split" : ""}`} onDragOver={(event) => { if (draggingTabId && !splitLayout) event.preventDefault(); }}>
          {splitLayout ? renderLayout(splitLayout) : active ? renderDocumentContent(active) : (
            <section className="canvas-list">
              <span className="eyebrow">Canvas</span>
              <div className="list-heading">
                <div><h1>{libraryResourceId ? resources.find((resource) => resource.id === libraryResourceId)?.name || "Resource card" : "Canvas library"}</h1></div>
                <div className="row canvas-library-actions">
                  <button className="secondary-btn" onClick={() => void refreshCanvasPreviews()} disabled={isRefreshingThumbnails} title="Reload all canvas previews"><RefreshCw className={isRefreshingThumbnails ? "is-spinning" : ""} size={15} /> Refresh</button>
                  <button className="secondary-btn" onClick={() => importInputRef.current?.click()}><FolderOpen size={15} /> Import file</button>
                </div>
              </div>
              <div className="canvas-grid">
                  <article className="canvas-card canvas-new-card">
                    <button type="button" className="canvas-new-choice" onClick={() => createCanvas()}><span className="canvas-new-icon"><Plus size={22} /></span><strong>New Canvas</strong><small>Create an empty canvas in this resource card.</small></button>
                    <span className="canvas-new-divider" aria-hidden="true" />
                    <button type="button" className="canvas-new-choice" onClick={createNote}><span className="canvas-new-icon"><FileText size={20} /></span><strong>New Notes</strong><small>Create a note in this resource card.</small></button>
                  </article>
                  {libraryDocuments.map((document) => (
                    <article key={document.id} className="canvas-card-wrap">
                      <button className={`canvas-card ${document.kind === "note" ? "canvas-note-card" : ""}`} onClick={() => openCanvas(document.id)}>
                        {document.kind === "note" ? <><span className="canvas-note-card-preview">{document.content || "Empty note"}</span><span className="canvas-card-caption"><strong><FileText size={15} /> {document.name || "Untitled note"}</strong><small>Note</small></span></> : <><CanvasCardPreview document={document} refreshSeed={thumbnailRefreshSeed} /><span className="canvas-card-caption"><strong><Paintbrush size={15} /> {document.name || "Untitled canvas"}</strong><small>Canvas</small></span></>}
                      </button>
                      <button className="delete-card" aria-label={`Delete ${document.name}`} title={document.kind === "note" ? "Delete note" : "Delete canvas"} onClick={() => removeCanvas(document.id)}><X size={15} /></button>
                    </article>
                  ))}
              </div>
            </section>
          )}
          {draggingTabId && !splitLayout && activeId && <div className="canvas-split-drop-overlay" onDragOver={(event) => event.preventDefault()}>
            <div className="canvas-split-drop-hint">Drop tab to split this view</div>
            {(["left", "right", "top", "bottom"] as const).map((side) => <button key={side} type="button" className={`canvas-split-drop-zone zone-${side} ${splitDropSide === side ? "is-hovered" : ""}`} onDragEnter={() => setSplitDropSide(side)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSplitDropSide(null); }} onDragOver={(event) => { event.preventDefault(); setSplitDropSide(side); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const id = event.dataTransfer.getData("application/x-canvas-document-id") || draggingTabId; createSplit(id, side, activeId); setSplitDropSide(null); }}>
              <span>{side === "left" ? "Split left" : side === "right" ? "Split right" : side === "top" ? "Split above" : "Split below"}</span>
              <small>{side === "left" || side === "right" ? "Vertical" : "Horizontal"}</small>
            </button>)}
          </div>}
          </div>
        </div>
      </div>
      {contextMenu && <div className="canvas-context-menu" style={{ left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 236)), top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - (contextMenu.kind === "canvas" ? 212 : 146))) }}>
        {contextMenu.kind === "resource" ? (() => {
          const resource = resources.find((item) => item.id === contextMenu.id);
          return <>
            <button type="button" className="canvas-context-menu-item" onClick={() => resource && createResource(resource.id)}><FolderPlus size={16} />Create Sub Folder</button>
            <button type="button" className="canvas-context-menu-item" onClick={() => renameResource(contextMenu.id)}><Pencil size={16} />Rename</button>
            <button type="button" className="canvas-context-menu-item is-danger" disabled={!resource?.parentId} onClick={() => deleteResource(contextMenu.id)}><Trash2 size={16} />Delete</button>
          </>;
        })() : <>
          {documents.find((item) => item.id === contextMenu.id)?.kind !== "note" && <button type="button" className="canvas-context-menu-item" onClick={() => { createSubCanvas(contextMenu.id); setContextMenu(null); }}><Paintbrush size={16} />Sub Canvas</button>}
          <button type="button" className="canvas-context-menu-item" onClick={() => renameCanvas(contextMenu.id)}><Pencil size={16} />Rename</button>
          <button type="button" className="canvas-context-menu-item" onClick={() => { const document = documents.find((item) => item.id === contextMenu.id); setContextMenu(null); if (document) void downloadDocument(document); }}><Download size={16} />{documents.find((item) => item.id === contextMenu.id)?.kind === "note" ? "Export note" : "Export canvas"}</button>
          {documents.find((item) => item.id === contextMenu.id)?.kind !== "note" && <button type="button" className="canvas-context-menu-item" onClick={() => showCanvasChildren(contextMenu.id)}><Library size={16} />View All Sub Canvas</button>}
          <button type="button" className="canvas-context-menu-item" onClick={() => void copyCanvasUrl(contextMenu.id)}><Copy size={16} />Copy URL</button>
          <button type="button" className="canvas-context-menu-item is-danger" onClick={() => { removeCanvas(contextMenu.id); setContextMenu(null); }}><Trash2 size={16} />Delete</button>
        </>}
      </div>}
      {canvasSearchOpen && <div className="canvas-search-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCanvasSearchOpen(false); }}>
        <section className="canvas-search-dialog" role="dialog" aria-modal="true" aria-label="Search and open canvas or note">
          <header className="canvas-search-heading"><div><span className="eyebrow">CANVAS</span><h2>Search and open</h2></div><button className="icon-btn" aria-label="Close search" onClick={() => setCanvasSearchOpen(false)}><X size={16} /></button></header>
          <label className="canvas-search-input"><Search size={16} /><input autoFocus value={canvasSearchQuery} onChange={(event) => setCanvasSearchQuery(event.target.value)} placeholder="Search canvases, notes, or resource cards…" onKeyDown={(event) => { if (event.key === "Escape") setCanvasSearchOpen(false); if (event.key === "Enter" && canvasSearchResults.length) { const first = "document" in canvasSearchResults[0] ? canvasSearchResults[0].document : canvasSearchResults[0]; openCanvas(first.id); setCanvasSearchOpen(false); } }} /></label>
          <div className="canvas-search-results" role="listbox" aria-label="Canvases and notes">
            {canvasSearchResults.map((result) => {
              const document = "document" in result ? result.document : result;
              const resourceName = "resourceName" in result ? result.resourceName : resources.find((resource) => resource.id === document.resourceId)?.name || "Unfiled";
              return <button key={document.id} className="canvas-search-result" role="option" onClick={() => { openCanvas(document.id); setCanvasSearchOpen(false); }}><span className="canvas-search-result-icon">{document.kind === "note" ? <FileText size={14} /> : <Paintbrush size={14} />}</span><span className="canvas-search-result-copy"><strong>{document.name || (document.kind === "note" ? "Untitled note" : "Untitled canvas")}</strong><small>{resourceName} · {document.kind === "note" ? "Note" : "Canvas"}</small></span><ChevronRight size={15} /></button>;
            })}
            {!canvasSearchResults.length && <p className="canvas-search-empty">No matching items found.</p>}
          </div>
          <footer className="canvas-search-footer">{documents.length} item{documents.length === 1 ? "" : "s"}</footer>
        </section>
      </div>}
    </main>
  );
}

function ResourceTreeNode({
  resource,
  resourcesByParent,
  selectedResourceId,
  selectResource,
  expandedIds,
  pinnedResourceIds,
  toggleResourcePin,
  toggleExpanded,
  createResource,
  onResourceContextMenu,
}: {
  resource: CanvasResource;
  resourcesByParent: Map<string, CanvasResource[]>;
  selectedResourceId: string | null;
  selectResource: (id: string) => void;
  expandedIds: string[];
  pinnedResourceIds: string[];
  toggleResourcePin: (id: string) => void;
  toggleExpanded: (id: string) => void;
  createResource: (parentId: string | null) => void;
  onResourceContextMenu: (event: React.MouseEvent, id: string) => void;
}) {
  const children = resourcesByParent.get(resource.id) || [];
  const expanded = expandedIds.includes(resource.id);
  const hasChildren = children.length > 0;
  return (
    <div className="resource-tree-node">
      <div className={`resource-card-row ${selectedResourceId === resource.id ? "is-selected" : ""}`} onContextMenu={(event) => onResourceContextMenu(event, resource.id)}>
        {hasChildren ? <button className="resource-expand" aria-label={`${expanded ? "Collapse" : "Expand"} ${resource.name}`} onClick={() => toggleExpanded(resource.id)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="resource-expand-spacer" />}
        <button className="resource-select" title={resource.name} onClick={() => selectResource(resource.id)}>
          <Library size={14} />
          <span>{resource.name}</span>
        </button>
        <button className={`resource-add-child resource-pin ${pinnedResourceIds.includes(resource.id) ? "is-pinned" : ""}`} title={pinnedResourceIds.includes(resource.id) ? "Unpin resource card" : "Pin resource card"} aria-label={`${pinnedResourceIds.includes(resource.id) ? "Unpin" : "Pin"} ${resource.name}`} onClick={() => toggleResourcePin(resource.id)}><Pin size={12} /></button>
        <button className="resource-add-child" title="Add sub resource card" aria-label={`Add sub resource card under ${resource.name}`} onClick={() => createResource(resource.id)}><Plus size={13} /></button>
      </div>
      {expanded && hasChildren && (
        <div className="resource-children">
          {children.map((child) => (
            <ResourceTreeNode
              key={child.id}
              resource={child}
              resourcesByParent={resourcesByParent}
              selectedResourceId={selectedResourceId}
              selectResource={selectResource}
              expandedIds={expandedIds}
              pinnedResourceIds={pinnedResourceIds}
              toggleResourcePin={toggleResourcePin}
              toggleExpanded={toggleExpanded}
              createResource={createResource}
              onResourceContextMenu={onResourceContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

