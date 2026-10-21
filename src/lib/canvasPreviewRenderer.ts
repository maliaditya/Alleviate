type PreviewWorkerResponse = { id: number; preview?: Blob; error?: string };
type PendingRender = { resolve: (preview: Blob | null) => void; reject: (error: Error) => void; signal: AbortSignal; abort: () => void; timer?: ReturnType<typeof setTimeout> };

let previewWorker: Worker | null = null;
let nextRenderId = 0;
const pendingRenders = new Map<number, PendingRender>();

function getPreviewWorker() {
  if (previewWorker) return previewWorker;
  const worker = new Worker(new URL("../workers/canvasPreview.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<PreviewWorkerResponse>) => {
    const pending = pendingRenders.get(event.data.id);
    if (!pending) return;
    pendingRenders.delete(event.data.id);
    pending.signal.removeEventListener("abort", pending.abort);
    if (pending.timer) clearTimeout(pending.timer);
    if (event.data.error) pending.reject(new Error(event.data.error));
    else pending.resolve(event.data.preview ?? null);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Canvas preview worker failed.");
    for (const pending of pendingRenders.values()) {
      pending.signal.removeEventListener("abort", pending.abort);
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    pendingRenders.clear();
    worker.terminate();
    if (previewWorker === worker) previewWorker = null;
  };
  previewWorker = worker;
  return worker;
}

function compactElement(element: any) {
  const compact: Record<string, any> = {};
  for (const key of ["id", "type", "x", "y", "width", "height", "strokeColor", "backgroundColor", "strokeWidth", "strokeStyle", "opacity", "angle", "roundness", "text", "fontFamily", "fontSize", "lineHeight", "textAlign", "startArrowhead", "endArrowhead", "fileId", "isDeleted"]) {
    if (element[key] !== undefined) compact[key] = element[key];
  }
  if (Array.isArray(element.points)) {
    const points = element.points;
    const stride = Math.max(1, Math.ceil(points.length / 500));
    const sampled = [];
    for (let index = 0; index < points.length; index += stride) sampled.push(points[index]);
    if (points.length > 0 && (points.length - 1) % stride !== 0) sampled.push(points[points.length - 1]);
    compact.points = sampled;
  }
  return compact;
}

export function renderCanvasPreviewInWorker(
  elements: any[],
  files: Record<string, Blob>,
  background: string,
  signal: AbortSignal,
): Promise<Blob | null> {
  if (signal.aborted) return Promise.resolve(null);
  const id = ++nextRenderId;
  const worker = getPreviewWorker();
  return new Promise((resolve, reject) => {
    const abort = () => {
      if (pending.timer) clearTimeout(pending.timer);
      worker.postMessage({ type: "cancel", id });
      pendingRenders.delete(id);
      signal.removeEventListener("abort", abort);
      resolve(null);
    };
    const pending: PendingRender = { resolve, reject, signal, abort };
    pendingRenders.set(id, pending);
    signal.addEventListener("abort", abort, { once: true });
    worker.postMessage({ type: "begin", id, background });

    let cursor = 0;
    const sendBatch = () => {
      if (signal.aborted || !pendingRenders.has(id)) return;
      const end = Math.min(elements.length, cursor + 80);
      const batch: any[] = [];
      for (; cursor < end; cursor += 1) batch.push(compactElement(elements[cursor]));
      worker.postMessage({ type: "elements", id, elements: batch });
      if (cursor < elements.length) pending.timer = setTimeout(sendBatch, 0);
      else {
        const fileEntries = Object.entries(files || {});
        let fileCursor = 0;
        const sendFile = () => {
          if (signal.aborted || !pendingRenders.has(id)) return;
          if (fileCursor >= fileEntries.length) {
            worker.postMessage({ type: "finish", id });
            return;
          }
          const [fileId, blob] = fileEntries[fileCursor++];
          worker.postMessage({ type: "file", id, fileId, blob });
          pending.timer = setTimeout(sendFile, 0);
        };
        sendFile();
      }
    };
    if (elements.length) pending.timer = setTimeout(sendBatch, 0);
    else worker.postMessage({ type: "finish", id });
  });
}
