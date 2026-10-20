"use client";

import AppSidebar from "../AppSidebar";
import { useAppDialogs } from "../AppDialogs";
import { Document, Page, pdfjs } from "react-pdf";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, FileText, Folder, FolderPlus, Highlighter, Minus, Plus, Trash2, Upload, ZoomIn } from "lucide-react";
import { deleteBookPdf, loadBookPdf, saveBookPdf } from "../../lib/booksStore";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type BookFolder = { id: string; name: string; parentId: string | null };
type HighlightMark = { id: string; page: number; x: number; y: number; width: number; height: number; color: string };
type BookPdf = { id: string; name: string; folderId: string | null; size: number; addedAt: number; lastPage: number; pageCount: number; highlights: HighlightMark[] };
type BooksState = { folders: BookFolder[]; books: BookPdf[]; expandedFolderIds: string[]; selectedFolderId: string | null; selectedBookId: string | null };
type Rect = { x: number; y: number; width: number; height: number };

const STORAGE_KEY = "alleviate-books-workspace-v1";
const DEFAULT_STATE: BooksState = { folders: [], books: [], expandedFolderIds: [], selectedFolderId: null, selectedBookId: null };
const HIGHLIGHT_COLOR = "#ffe66d";

export default function BooksPage() {
  const dialogs = useAppDialogs();
  const [state, setState] = useState<BooksState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pageAspect, setPageAspect] = useState(0.707);
  const [fitMode, setFitMode] = useState<"width" | "page">("width");
  const [zoomFactor, setZoomFactor] = useState(1);
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const [markerMode, setMarkerMode] = useState(false);
  const [draftMark, setDraftMark] = useState<Rect | null>(null);
  const [markStart, setMarkStart] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageFrameRef = useRef<HTMLDivElement>(null);

  const selectedBook = useMemo(() => state.books.find((book) => book.id === state.selectedBookId) ?? null, [state.books, state.selectedBookId]);
  // React-PDF compares the `file` prop by identity. Keep its wrapper stable so
  // page, zoom, and highlight state changes don't restart PDF loading/rendering.
  const documentFile = useMemo(() => fileData ? { data: fileData } : null, [fileData]);
  const visibleFolders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return state.folders;
    const matchingFolderIds = new Set(state.folders.filter((folder) => folder.name.toLocaleLowerCase().includes(query)).map((folder) => folder.id));
    const matchingBooks = state.books.filter((book) => book.name.toLocaleLowerCase().includes(query));
    for (const book of matchingBooks) if (book.folderId) matchingFolderIds.add(book.folderId);
    for (const folder of state.folders) {
      if (!matchingFolderIds.has(folder.id)) continue;
      let parentId = folder.parentId;
      while (parentId) {
        matchingFolderIds.add(parentId);
        parentId = state.folders.find((item) => item.id === parentId)?.parentId ?? null;
      }
    }
    return state.folders.filter((folder) => matchingFolderIds.has(folder.id));
  }, [search, state.books, state.folders]);
  const visibleBookIds = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return new Set(state.books.filter((book) => !query || book.name.toLocaleLowerCase().includes(query) || (book.folderId && visibleFolders.some((folder) => folder.id === book.folderId))).map((book) => book.id));
  }, [search, state.books, visibleFolders]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<BooksState>;
        setState({
          folders: Array.isArray(parsed.folders) ? parsed.folders : [],
          books: Array.isArray(parsed.books) ? parsed.books.map((book) => ({ ...book, highlights: Array.isArray(book.highlights) ? book.highlights : [], lastPage: Math.max(1, Number(book.lastPage) || 1), pageCount: Math.max(0, Number(book.pageCount) || 0) })) : [],
          expandedFolderIds: Array.isArray(parsed.expandedFolderIds) ? parsed.expandedFolderIds : [],
          selectedFolderId: typeof parsed.selectedFolderId === "string" ? parsed.selectedFolderId : null,
          selectedBookId: typeof parsed.selectedBookId === "string" ? parsed.selectedBookId : null,
        });
      }
    } catch { setError("Could not load the Books library saved on this device."); }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { setError("Books settings could not be saved. PDF files remain stored separately on this device."); }
  }, [ready, state]);

  useEffect(() => {
    const node = viewerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setViewerSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    setFileData(null);
    setPageCount(0);
    setPageAspect(0.707);
    setPageNumber(Math.max(1, selectedBook?.lastPage ?? 1));
    setZoomFactor(1);
    setFitMode("width");
    if (!selectedBook) return;
    void loadBookPdf(selectedBook.id).then(async (blob) => {
      if (!blob) throw new Error("This PDF file is missing from local storage. Please upload it again.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (!cancelled) { setFileData(bytes); setError(""); }
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open this PDF."); });
    return () => { cancelled = true; };
  }, [selectedBook?.id]);

  const updateBook = useCallback((id: string, update: Partial<BookPdf>) => {
    setState((current) => ({ ...current, books: current.books.map((book) => book.id === id ? { ...book, ...update } : book) }));
  }, []);

  const toggleFolder = useCallback((id: string) => {
    setState((current) => ({ ...current, expandedFolderIds: current.expandedFolderIds.includes(id) ? current.expandedFolderIds.filter((item) => item !== id) : [...current.expandedFolderIds, id] }));
  }, []);

  const createFolder = useCallback(async (parentId: string | null) => {
    const name = (await dialogs.prompt({ title: parentId ? "Create subfolder" : "Create folder", message: parentId ? "Name this subfolder" : "Name this folder", confirmLabel: "Create" }))?.trim();
    if (!name) return;
    const folder = { id: crypto.randomUUID(), name, parentId };
    setState((current) => ({ ...current, folders: [...current.folders, folder], selectedFolderId: folder.id, expandedFolderIds: parentId ? Array.from(new Set([...current.expandedFolderIds, parentId, folder.id])) : [...current.expandedFolderIds, folder.id] }));
  }, [dialogs]);

  const removeFolder = useCallback(async (folderId: string) => {
    const descendants = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of state.folders) if (folder.parentId && descendants.has(folder.parentId) && !descendants.has(folder.id)) { descendants.add(folder.id); changed = true; }
    }
    const removedBooks = state.books.filter((book) => book.folderId && descendants.has(book.folderId));
    if (!await dialogs.confirm({ title: "Delete folder?", message: `Delete this folder and its ${removedBooks.length} PDF${removedBooks.length === 1 ? "" : "s"}?`, confirmLabel: "Delete", destructive: true })) return;
    for (const book of removedBooks) void deleteBookPdf(book.id);
    setState((current) => ({
      ...current,
      folders: current.folders.filter((folder) => !descendants.has(folder.id)),
      books: current.books.filter((book) => !book.folderId || !descendants.has(book.folderId)),
      expandedFolderIds: current.expandedFolderIds.filter((id) => !descendants.has(id)),
      selectedFolderId: current.selectedFolderId && descendants.has(current.selectedFolderId) ? null : current.selectedFolderId,
      selectedBookId: current.selectedBookId && removedBooks.some((book) => book.id === current.selectedBookId) ? null : current.selectedBookId,
    }));
  }, [dialogs, state.books, state.folders]);

  const uploadPdf = useCallback(async (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase().endsWith(".pdf")) { setError("Choose a PDF file to add it to Books."); return; }
    const id = crypto.randomUUID();
    const book: BookPdf = { id, name: file.name.replace(/\.pdf$/i, "") || file.name, folderId: state.selectedFolderId, size: file.size, addedAt: Date.now(), lastPage: 1, pageCount: 0, highlights: [] };
    try {
      await saveBookPdf(id, file);
      setState((current) => ({ ...current, books: [...current.books, book], selectedBookId: id, expandedFolderIds: book.folderId ? Array.from(new Set([...current.expandedFolderIds, book.folderId])) : current.expandedFolderIds }));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this PDF on the device."); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [state.selectedFolderId]);

  const selectBook = useCallback((book: BookPdf) => {
    setState((current) => ({ ...current, selectedBookId: book.id, selectedFolderId: book.folderId }));
    setMarkerMode(false);
    setDraftMark(null);
  }, []);

  const deleteBook = useCallback(async (book: BookPdf) => {
    if (!await dialogs.confirm({ title: "Delete PDF?", message: `Delete “${book.name}” from Books?`, confirmLabel: "Delete", destructive: true })) return;
    try { await deleteBookPdf(book.id); } catch { setError("Could not remove the PDF file from local storage."); }
    setState((current) => ({ ...current, books: current.books.filter((item) => item.id !== book.id), selectedBookId: current.selectedBookId === book.id ? null : current.selectedBookId }));
  }, [dialogs]);

  const pageWidth = useMemo(() => {
    if (!viewerSize.width) return 0;
    const widthFit = Math.max(240, viewerSize.width - 44);
    const pageFit = Math.max(240, Math.min(widthFit, (viewerSize.height - 44) * pageAspect));
    return Math.round((fitMode === "width" ? widthFit : pageFit) * zoomFactor);
  }, [fitMode, pageAspect, viewerSize.height, viewerSize.width, zoomFactor]);

  const onDocumentLoad = useCallback(({ numPages }: { numPages: number }) => {
    setPageCount(numPages);
    if (selectedBook) updateBook(selectedBook.id, { pageCount: numPages });
    setPageNumber((current) => Math.min(Math.max(1, current), numPages));
  }, [selectedBook, updateBook]);

  const onPageLoad = useCallback((page: any) => {
    const viewport = page.getViewport({ scale: 1 });
    setPageAspect(viewport.width / viewport.height);
  }, []);

  const goToPage = useCallback((nextPage: number) => {
    if (!selectedBook) return;
    const next = Math.min(Math.max(1, nextPage), pageCount || selectedBook.pageCount || 1);
    setPageNumber(next);
    updateBook(selectedBook.id, { lastPage: next });
    if (viewerRef.current) viewerRef.current.scrollTop = 0;
    setDraftMark(null);
  }, [pageCount, selectedBook, updateBook]);

  const pointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) };
  };

  const startHighlight = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!markerMode || !selectedBook) return;
    const point = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setMarkStart(point);
    setDraftMark({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const moveHighlight = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!markStart) return;
    const point = pointerPosition(event);
    setDraftMark({ x: Math.min(markStart.x, point.x), y: Math.min(markStart.y, point.y), width: Math.abs(point.x - markStart.x), height: Math.abs(point.y - markStart.y) });
  };

  const finishHighlight = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!markStart || !selectedBook) return;
    const point = pointerPosition(event);
    const mark = { x: Math.min(markStart.x, point.x), y: Math.min(markStart.y, point.y), width: Math.abs(point.x - markStart.x), height: Math.abs(point.y - markStart.y) };
    setMarkStart(null);
    setDraftMark(null);
    if (mark.width < 0.006 || mark.height < 0.004) return;
    const highlight: HighlightMark = { ...mark, id: crypto.randomUUID(), page: pageNumber, color: HIGHLIGHT_COLOR };
    updateBook(selectedBook.id, { highlights: [...selectedBook.highlights, highlight] });
  };

  const removeHighlight = useCallback((highlightId: string) => {
    if (!selectedBook) return;
    updateBook(selectedBook.id, { highlights: selectedBook.highlights.filter((highlight) => highlight.id !== highlightId) });
  }, [selectedBook, updateBook]);

  const rootFolders = visibleFolders.filter((folder) => !folder.parentId);
  const rootBooks = state.books.filter((book) => !book.folderId && visibleBookIds.has(book.id));

  return <main className="books-page">
    <AppSidebar active="books" />
    <div className="books-workspace">
      <aside className="books-tree-pane" aria-label="Books and folders">
        <div className="books-tree-header">
          <div><span className="books-eyebrow">Library</span><h1>Books</h1></div>
          <div className="books-header-actions">
            <button className="books-icon-button" title="Create folder" aria-label="Create folder" onClick={() => createFolder(null)}><FolderPlus size={17} /></button>
            <button className="books-icon-button" title="Upload PDF" aria-label="Upload PDF" onClick={() => fileInputRef.current?.click()}><Upload size={17} /></button>
            <input ref={fileInputRef} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => void uploadPdf(event.target.files?.[0])} />
          </div>
        </div>
        <label className="books-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a book or folder" /></label>
        <div className="books-tree-scroll">
          {rootFolders.map((folder) => <FolderBranch key={folder.id} folder={folder} folders={visibleFolders} books={state.books.filter((book) => visibleBookIds.has(book.id))} expandedIds={state.expandedFolderIds} selectedFolderId={state.selectedFolderId} selectedBookId={state.selectedBookId} onToggle={toggleFolder} onSelectFolder={(id) => setState((current) => ({ ...current, selectedFolderId: id, selectedBookId: null }))} onSelectBook={selectBook} onCreateFolder={createFolder} onDeleteFolder={removeFolder} onDeleteBook={deleteBook} />)}
          {rootBooks.map((book) => <BookRow key={book.id} book={book} selected={state.selectedBookId === book.id} onSelect={() => selectBook(book)} onDelete={() => void deleteBook(book)} />)}
          {ready && rootFolders.length === 0 && rootBooks.length === 0 && <div className="books-tree-empty">Create a folder or upload a PDF to start your library.</div>}
        </div>
        {error && <div className="books-error" role="status">{error}</div>}
        <div className="books-tree-footer">PDFs and reading progress stay on this device</div>
      </aside>

      <section className="books-reader-pane" aria-label="PDF reader">
        {selectedBook ? <>
          <header className="books-reader-toolbar">
            <div className="books-reader-title"><BookOpen size={16} /><span title={selectedBook.name}>{selectedBook.name}</span></div>
            <div className="books-reader-controls">
              <button className="books-tool-button" title="Previous page" aria-label="Previous page" disabled={pageNumber <= 1} onClick={() => goToPage(pageNumber - 1)}><ChevronLeft size={16} /></button>
              <label className="books-page-input"><input aria-label="Page number" type="number" min="1" max={pageCount || undefined} value={pageNumber} onChange={(event) => goToPage(Number(event.target.value) || 1)} /><span>/ {pageCount || "—"}</span></label>
              <button className="books-tool-button" title="Next page" aria-label="Next page" disabled={Boolean(pageCount && pageNumber >= pageCount)} onClick={() => goToPage(pageNumber + 1)}><ChevronRight size={16} /></button>
              <span className="books-tool-separator" />
              <button className={`books-tool-button ${fitMode === "width" ? "is-active" : ""}`} title="Fit width" aria-label="Fit width" onClick={() => { setFitMode("width"); setZoomFactor(1); }}><span className="books-fit-width-icon">↔</span></button>
              <button className={`books-tool-button ${fitMode === "page" ? "is-active" : ""}`} title="Fit page" aria-label="Fit page" onClick={() => { setFitMode("page"); setZoomFactor(1); }}><span className="books-fit-page-icon">□</span></button>
              <button className="books-tool-button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoomFactor((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))}><Minus size={15} /></button>
              <span className="books-zoom-label">{Math.round(zoomFactor * 100)}%</span>
              <button className="books-tool-button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoomFactor((value) => Math.min(2.5, Number((value + 0.1).toFixed(2))))}><ZoomIn size={15} /></button>
              <span className="books-tool-separator" />
              <button className={`books-tool-button books-marker-button ${markerMode ? "is-active" : ""}`} title={markerMode ? "Stop highlighting" : "Highlight on this page"} aria-label={markerMode ? "Stop highlighting" : "Highlight on this page"} aria-pressed={markerMode} onClick={() => { setMarkerMode((value) => !value); setDraftMark(null); setMarkStart(null); }}><Highlighter size={16} /></button>
            </div>
          </header>
          <div className="books-reader-scroll" ref={viewerRef}>
            {documentFile ? <Document
              className="books-pdf-document"
              file={documentFile}
              onLoadSuccess={onDocumentLoad}
              onLoadError={(cause) => setError(cause instanceof Error ? cause.message : "Could not read this PDF file.")}
              loading={<div className="books-reader-message">Opening PDF…</div>}
              error={<div className="books-reader-message">This PDF could not be opened.</div>}
            >
              {pageWidth > 0 && <div className="books-page-frame" ref={pageFrameRef} style={{ width: pageWidth, height: Math.round(pageWidth / pageAspect) }}>
                <Page className="books-pdf-page" pageNumber={pageNumber} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} onLoadSuccess={onPageLoad} loading={<div className="books-reader-message">Rendering page…</div>} />
                <div className={`books-highlight-layer ${markerMode ? "is-marking" : ""}`} onPointerDown={startHighlight} onPointerMove={moveHighlight} onPointerUp={finishHighlight} onPointerCancel={() => { setMarkStart(null); setDraftMark(null); }}>
                  {selectedBook.highlights.filter((mark) => mark.page === pageNumber).map((mark) => <button key={mark.id} type="button" className="books-saved-highlight" title="Remove highlight" aria-label="Remove highlight" onPointerDown={(event) => event.stopPropagation()} onClick={() => removeHighlight(mark.id)} style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: `${mark.width * 100}%`, height: `${mark.height * 100}%`, backgroundColor: `${mark.color}70` }} />)}
                  {draftMark && <div className="books-draft-highlight" style={{ left: `${draftMark.x * 100}%`, top: `${draftMark.y * 100}%`, width: `${draftMark.width * 100}%`, height: `${draftMark.height * 100}%` }} />}
                </div>
              </div>}
            </Document> : <div className="books-reader-message">{error || "Loading PDF…"}</div>}
          </div>
          <footer className="books-reader-footer">
            <span>{selectedBook.highlights.length} highlight{selectedBook.highlights.length === 1 ? "" : "s"} saved</span>
            <span>Last page saved automatically</span>
          </footer>
        </> : <div className="books-empty-reader">
          <div className="books-empty-icon"><BookOpen size={24} /></div>
          <h2>Select a PDF to read</h2>
          <p>Choose a book from the folder list, or upload a PDF to get started.</p>
          <button className="books-upload-button" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Upload PDF</button>
        </div>}
      </section>
    </div>
  </main>;
}

function FolderBranch({ folder, folders, books, expandedIds, selectedFolderId, selectedBookId, onToggle, onSelectFolder, onSelectBook, onCreateFolder, onDeleteFolder, onDeleteBook }: {
  folder: BookFolder; folders: BookFolder[]; books: BookPdf[]; expandedIds: string[]; selectedFolderId: string | null; selectedBookId: string | null;
  onToggle: (id: string) => void; onSelectFolder: (id: string) => void; onSelectBook: (book: BookPdf) => void; onCreateFolder: (parentId: string | null) => void; onDeleteFolder: (id: string) => void; onDeleteBook: (book: BookPdf) => void;
}) {
  const children = folders.filter((item) => item.parentId === folder.id);
  const childrenBooks = books.filter((book) => book.folderId === folder.id);
  const expanded = expandedIds.includes(folder.id);
  const hasChildren = children.length > 0 || childrenBooks.length > 0;
  return <div className="books-folder-branch">
    <div className={`books-folder-row ${selectedFolderId === folder.id ? "is-selected" : ""}`}>
      <button className="books-tree-chevron" aria-label={`${expanded ? "Collapse" : "Expand"} ${folder.name}`} onClick={() => onToggle(folder.id)}>{hasChildren && expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} className={!hasChildren ? "is-muted" : ""} />}</button>
      <button className="books-folder-select" title={folder.name} onClick={() => onSelectFolder(folder.id)}><Folder size={15} /><span>{folder.name}</span></button>
      <button className="books-row-action" title="Create subfolder" aria-label={`Create subfolder in ${folder.name}`} onClick={() => onCreateFolder(folder.id)}><FolderPlus size={14} /></button>
      <button className="books-row-action is-danger" title="Delete folder" aria-label={`Delete ${folder.name}`} onClick={() => onDeleteFolder(folder.id)}><Trash2 size={14} /></button>
    </div>
    {expanded && <div className="books-folder-children">
      {children.map((child) => <FolderBranch key={child.id} folder={child} folders={folders} books={books} expandedIds={expandedIds} selectedFolderId={selectedFolderId} selectedBookId={selectedBookId} onToggle={onToggle} onSelectFolder={onSelectFolder} onSelectBook={onSelectBook} onCreateFolder={onCreateFolder} onDeleteFolder={onDeleteFolder} onDeleteBook={onDeleteBook} />)}
      {childrenBooks.map((book) => <BookRow key={book.id} book={book} selected={selectedBookId === book.id} onSelect={() => onSelectBook(book)} onDelete={() => onDeleteBook(book)} />)}
    </div>}
  </div>;
}

function BookRow({ book, selected, onSelect, onDelete }: { book: BookPdf; selected: boolean; onSelect: () => void; onDelete: () => void }) {
  return <div className={`books-file-row ${selected ? "is-selected" : ""}`}>
    <button className="books-file-select" title={book.name} onClick={onSelect}><FileText size={14} /><span>{book.name}</span></button>
    <button className="books-row-action is-danger" title="Delete PDF" aria-label={`Delete ${book.name}`} onClick={onDelete}><Trash2 size={14} /></button>
  </div>;
}
