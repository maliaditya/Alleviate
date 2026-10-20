const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourceBase = path.join(projectRoot, "node_modules", "@excalidraw", "excalidraw", "dist");
const targetBase = path.join(projectRoot, "public", "vendor", "excalidraw", "dist");

for (const directory of ["excalidraw-assets", "excalidraw-assets-dev"]) {
  const source = path.join(sourceBase, directory);
  // Excalidraw's webpack public path points at /vendor/excalidraw/, so
  // development chunks are requested directly from that root. Its font and
  // image helpers separately append /dist/excalidraw-assets/.
  const target = directory === "excalidraw-assets-dev"
    ? path.join(projectRoot, "public", "vendor", "excalidraw", directory)
    : path.join(targetBase, directory);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing Excalidraw assets: ${source}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

const pdfWorkerSource = path.join(projectRoot, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const pdfWorkerTarget = path.join(projectRoot, "public", "pdf.worker.min.mjs");
if (!fs.existsSync(pdfWorkerSource)) throw new Error(`Missing PDF.js worker: ${pdfWorkerSource}`);
fs.copyFileSync(pdfWorkerSource, pdfWorkerTarget);

console.log("Synced Excalidraw assets and PDF.js worker.");
