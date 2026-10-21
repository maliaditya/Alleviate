type Point = [number, number];
type RenderMessage =
  | { type: "begin"; id: number; background: string }
  | { type: "elements"; id: number; elements: any[] }
  | { type: "file"; id: number; fileId: string; blob: Blob }
  | { type: "finish"; id: number };
type SceneRenderMessage = { type: "render"; id: number; elements: any[]; files: Record<string, any>; background: string };
type CancelMessage = { type: "cancel"; id: number };
type RenderJob = { elements: any[]; files: Record<string, any>; background: string; pendingFiles: number; rendering: boolean };

const cancelled = new Set<number>();
const activeJobs = new Set<number>();
const jobs = new Map<number, RenderJob>();
const escapeXml = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]!);
const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const number = (value: number) => Number.isFinite(value) ? Number(value.toFixed(2)).toString() : "0";

function getPoints(element: any): Point[] {
  if (!Array.isArray(element.points)) return [];
  return element.points.map((point: any) => Array.isArray(point)
    ? [finite(point[0]), finite(point[1])] as Point
    : [finite(point?.x), finite(point?.y)] as Point);
}

function elementBounds(element: any) {
  const points = getPoints(element);
  if (points.length > 1 && (element.type === "line" || element.type === "arrow" || element.type === "freedraw")) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [pointX, pointY] of points) {
      minX = Math.min(minX, pointX);
      minY = Math.min(minY, pointY);
      maxX = Math.max(maxX, pointX);
      maxY = Math.max(maxY, pointY);
    }
    return { minX: finite(element.x) + minX, minY: finite(element.y) + minY, maxX: finite(element.x) + maxX, maxY: finite(element.y) + maxY };
  }
  const x = finite(element.x);
  const y = finite(element.y);
  const width = finite(element.width);
  const height = finite(element.height);
  return { minX: Math.min(x, x + width), minY: Math.min(y, y + height), maxX: Math.max(x, x + width), maxY: Math.max(y, y + height) };
}

function makeArrowHead(from: Point, to: Point, color: string, width: number, type: unknown) {
  if (!type || type === "none") return "";
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const size = Math.max(8, width * 4);
  const baseX = to[0] - ux * size;
  const baseY = to[1] - uy * size;
  const px = -uy * size * 0.46;
  const py = ux * size * 0.46;
  if (type === "bar") return `<path d="M ${number(baseX + px)} ${number(baseY + py)} L ${number(baseX - px)} ${number(baseY - py)}" fill="none" stroke="${color}" stroke-width="${number(width)}"/>`;
  if (type === "dot") return `<circle cx="${number(to[0])}" cy="${number(to[1])}" r="${number(size * 0.28)}" fill="${color}"/>`;
  return `<path d="M ${number(to[0])} ${number(to[1])} L ${number(baseX + px)} ${number(baseY + py)} L ${number(baseX - px)} ${number(baseY - py)} Z" fill="${color}"/>`;
}

function makeElementSvg(element: any, files: Record<string, any>) {
  const x = finite(element.x);
  const y = finite(element.y);
  const width = Math.abs(finite(element.width));
  const height = Math.abs(finite(element.height));
  const stroke = escapeXml(element.strokeColor || "#1e1e1e");
  const background = element.backgroundColor && element.backgroundColor !== "transparent" ? escapeXml(element.backgroundColor) : "none";
  const strokeWidth = Math.max(0, finite(element.strokeWidth, 2));
  const opacity = Math.max(0, Math.min(1, finite(element.opacity, 100) / 100));
  const dash = element.strokeStyle === "dashed" ? ` stroke-dasharray="${number(strokeWidth * 4)} ${number(strokeWidth * 3)}"` : element.strokeStyle === "dotted" ? ` stroke-dasharray="${number(strokeWidth)} ${number(strokeWidth * 2.5)}" stroke-linecap="round"` : "";
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const transform = finite(element.angle) ? ` transform="rotate(${number(finite(element.angle) * 180 / Math.PI)} ${number(centerX)} ${number(centerY)})"` : "";
  const common = `stroke="${stroke}" stroke-width="${number(strokeWidth)}" fill="${background}" opacity="${number(opacity)}" stroke-linejoin="round"${dash}${transform}`;

  if (element.type === "rectangle" || element.type === "frame") {
    const radius = element.roundness ? Math.min(14, width / 8, height / 8) : 0;
    return `<rect x="${number(x)}" y="${number(y)}" width="${number(width)}" height="${number(height)}" rx="${number(radius)}" ${common}/>`;
  }
  if (element.type === "ellipse") return `<ellipse cx="${number(centerX)}" cy="${number(centerY)}" rx="${number(width / 2)}" ry="${number(height / 2)}" ${common}/>`;
  if (element.type === "diamond") return `<path d="M ${number(centerX)} ${number(y)} L ${number(x + width)} ${number(centerY)} L ${number(centerX)} ${number(y + height)} L ${number(x)} ${number(centerY)} Z" ${common}/>`;
  if (element.type === "text") {
    const fontFamily = typeof element.fontFamily === "string" ? element.fontFamily : ({ 1: "Virgil, Comic Sans MS, cursive", 2: "Arial, sans-serif", 3: "Cascadia Code, monospace" } as Record<number, string>)[element.fontFamily] || "Arial, sans-serif";
    const fontSize = Math.max(8, finite(element.fontSize, 20));
    const lines = String(element.text || "").split("\n");
    const lineHeight = fontSize * (typeof element.lineHeight === "number" ? element.lineHeight : 1.25);
    const anchor = element.textAlign === "center" ? "middle" : element.textAlign === "right" ? "end" : "start";
    const textX = element.textAlign === "center" ? centerX : element.textAlign === "right" ? x + width : x;
    const spans = lines.map((line, index) => `<tspan x="${number(textX)}" dy="${index === 0 ? "0" : number(lineHeight)}">${escapeXml(line) || "&#8203;"}</tspan>`).join("");
    return `<text x="${number(textX)}" y="${number(y)}" dominant-baseline="hanging" text-anchor="${anchor}" font-family="${escapeXml(fontFamily)}" font-size="${number(fontSize)}" font-weight="${element.fontFamily === 3 ? 500 : 400}" fill="${stroke}" opacity="${number(opacity)}"${transform}>${spans}</text>`;
  }
  if (element.type === "image") {
    const file = files?.[element.fileId];
    const href = typeof file?.dataURL === "string" ? escapeXml(file.dataURL) : "";
    if (!href) return `<rect x="${number(x)}" y="${number(y)}" width="${number(width)}" height="${number(height)}" fill="#252832" stroke="#777d89"/>`;
    return `<image x="${number(x)}" y="${number(y)}" width="${number(width)}" height="${number(height)}" href="${href}" preserveAspectRatio="none" opacity="${number(opacity)}"${transform}/>`;
  }
  if (["line", "arrow", "freedraw"].includes(element.type)) {
    const points = getPoints(element);
    if (!points.length) return "";
    const absolute = points.map(([px, py]) => [px + x, py + y] as Point);
    const path = `M ${number(absolute[0][0])} ${number(absolute[0][1])} ${absolute.slice(1).map(([px, py]) => `L ${number(px)} ${number(py)}`).join(" ")}`;
    const line = `<path d="${path}" fill="none" ${common}/>`;
    if (element.type !== "arrow" || absolute.length < 2) return line;
    const start = absolute[0];
    const second = absolute[1];
    const end = absolute[absolute.length - 1];
    const beforeEnd = absolute[absolute.length - 2];
    return line + makeArrowHead(second, start, stroke, strokeWidth, element.startArrowhead) + makeArrowHead(beforeEnd, end, stroke, strokeWidth, element.endArrowhead);
  }
  return "";
}

async function makePreviewImage(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not render preview image.");
    context.drawImage(bitmap, 0, 0, width, height);
    const previewBlob = await canvas.convertToBlob({ type: "image/png" });
    const SyncReader = (globalThis as typeof globalThis & { FileReaderSync: new () => { readAsDataURL(blob: Blob): string } }).FileReaderSync;
    const reader = new SyncReader();
    return reader.readAsDataURL(previewBlob) as string;
  } finally {
    bitmap.close();
  }
}

async function rasterizePreview(svgMarkup: string): Promise<Blob> {
  const sizedSvg = svgMarkup.replace(/<svg\b[^>]*>/, (root) => root
    .replace(/\swidth="[^"]*"/, ' width="1280"')
    .replace(/\sheight="[^"]*"/, ' height="720"'));
  const svgBlob = new Blob([sizedSvg], { type: "image/svg+xml;charset=utf-8" });
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(svgBlob);
    const width = 1280;
    const height = 720;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create canvas preview image.");
    context.drawImage(bitmap, 0, 0, width, height);
    const png = await canvas.convertToBlob({ type: "image/png" });
    return png;
  } catch {
    // Some Electron/Chromium builds cannot decode SVG blobs in workers. The
    // <img> fallback decodes away from the page DOM and keeps the UI lightweight.
    return svgBlob;
  } finally {
    bitmap?.close();
  }
}

async function render(message: SceneRenderMessage) {
  const elements = message.elements.filter((element) => element && !element.isDeleted && element.type !== "selection");
  if (!elements.length) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="100%" height="100%" preserveAspectRatio="none"><rect width="1" height="1" fill="${escapeXml(message.background)}"/></svg>`;
  const bounds = elements.map(elementBounds);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const bound of bounds) {
    minX = Math.min(minX, bound.minX);
    minY = Math.min(minY, bound.minY);
    maxX = Math.max(maxX, bound.maxX);
    maxY = Math.max(maxY, bound.maxY);
  }
  const padding = Math.max(16, Math.min(80, Math.max(maxX - minX, maxY - minY) * 0.025));
  const viewX = minX - padding;
  const viewY = minY - padding;
  const viewWidth = Math.max(1, maxX - minX + padding * 2);
  const viewHeight = Math.max(1, maxY - minY + padding * 2);
  const content: string[] = [];
  for (let index = 0; index < elements.length; index += 1) {
    if (cancelled.has(message.id)) return null;
    content.push(makeElementSvg(elements[index], message.files));
    if (index > 0 && index % 180 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (cancelled.has(message.id)) return null;
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${number(viewX)} ${number(viewY)} ${number(viewWidth)} ${number(viewHeight)}" width="100%" height="100%" preserveAspectRatio="none"><rect x="${number(viewX)}" y="${number(viewY)}" width="${number(viewWidth)}" height="${number(viewHeight)}" fill="${escapeXml(message.background)}"/>${content.join("")}</svg>`;
  return markup;
}

self.onmessage = (event: MessageEvent<RenderMessage | CancelMessage>) => {
  const message = event.data;
  if (message.type === "cancel") {
    if (activeJobs.has(message.id)) {
      cancelled.add(message.id);
      const job = jobs.get(message.id);
      jobs.delete(message.id);
      if (!job?.rendering) {
        activeJobs.delete(message.id);
        cancelled.delete(message.id);
      }
    }
    return;
  }
  if (message.type === "begin") {
    cancelled.delete(message.id);
    activeJobs.add(message.id);
    jobs.set(message.id, { elements: [], files: {}, background: message.background, pendingFiles: 0, rendering: false });
    return;
  }
  if (message.type === "elements") {
    const job = jobs.get(message.id);
    if (job && !cancelled.has(message.id)) job.elements.push(...message.elements);
    return;
  }
  if (message.type === "file") {
    const job = jobs.get(message.id);
    if (job && !cancelled.has(message.id)) {
      job.pendingFiles += 1;
      void makePreviewImage(message.blob).then((dataURL) => {
        const current = jobs.get(message.id);
        if (current && !cancelled.has(message.id)) current.files[message.fileId] = { dataURL };
      }).catch(() => undefined).finally(() => {
        const current = jobs.get(message.id);
        if (current) current.pendingFiles = Math.max(0, current.pendingFiles - 1);
      });
    }
    return;
  }
  if (message.type === "finish") {
    const job = jobs.get(message.id);
    if (!job) return;
    job.rendering = true;
    // Let any pending image downsampling finish before drawing image elements.
    void (async () => {
      while (jobs.has(message.id) && !cancelled.has(message.id) && job.pendingFiles > 0) await new Promise((resolve) => setTimeout(resolve, 0));
      if (!jobs.has(message.id) || cancelled.has(message.id)) return null;
      const svgMarkup = await render({ type: "render", id: message.id, elements: job.elements, files: job.files, background: job.background });
      return svgMarkup ? rasterizePreview(svgMarkup) : null;
    })().then((preview) => {
      if (preview && !cancelled.has(message.id)) self.postMessage({ id: message.id, preview });
      jobs.delete(message.id); cancelled.delete(message.id); activeJobs.delete(message.id);
    }).catch((error: unknown) => {
      self.postMessage({ id: message.id, error: error instanceof Error ? error.message : "Canvas preview rendering failed." });
      jobs.delete(message.id); cancelled.delete(message.id); activeJobs.delete(message.id);
    });
    return;
  }
};
