const { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell, utilityProcess } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = 3210;
const APP_URL = `http://${HOST}:${PORT}`;
const AUTH_BASE_URL = process.env.ELECTRON_AUTH_BASE_URL || process.env.NEXT_PUBLIC_AUTH_BASE_URL || "https://vdock.vercel.app";
const AUTH_TOKEN_FILE = "secure-auth.json";

let appWindow;
let serverProcess;
let serverExited = false;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!appWindow) return;
    if (appWindow.isMinimized()) appWindow.restore();
    appWindow.focus();
  });

  app.whenReady().then(startDesktopApp);
}

async function startDesktopApp() {
  try {
    Menu.setApplicationMenu(null);
    registerDesktopAuthIpc();
    log("Starting desktop app.");
    await assertPortAvailable();
    log(`Port ${PORT} is available.`);
    startNextServer();
    await waitForNextServer();
    log("Next.js server is ready.");
    createWindow();
  } catch (error) {
    log(`Startup failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    dialog.showErrorBox(
      "Alleviate could not start",
      `${error instanceof Error ? error.message : String(error)}\n\nRestart Alleviate and try again.`,
    );
    app.quit();
  }
}

function readDesktopAuthTokens() {
  const filePath = path.join(app.getPath("userData"), AUTH_TOKEN_FILE);
  try {
    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (stored?.encrypted && typeof stored.data === "string" && safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(Buffer.from(stored.data, "base64")) || "{}");
    }
    return stored?.data && typeof stored.data === "object" ? stored.data : {};
  } catch {
    return {};
  }
}

function writeDesktopAuthTokens(tokens) {
  const filePath = path.join(app.getPath("userData"), AUTH_TOKEN_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const data = JSON.stringify(tokens);
  const stored = safeStorage.isEncryptionAvailable()
    ? { encrypted: true, data: safeStorage.encryptString(data).toString("base64") }
    : { encrypted: false, data: tokens };
  fs.writeFileSync(filePath, JSON.stringify(stored), "utf8");
}

function registerDesktopAuthIpc() {
  ipcMain.handle("alleviate:auth-token:set", (event, payload) => {
    if (event.sender !== appWindow?.webContents) return { success: false, error: "Untrusted app window." };
    const username = String(payload?.username || "").trim().toLowerCase();
    const refreshToken = String(payload?.refreshToken || "");
    if (!username || !refreshToken) return { success: false, error: "Username and refresh token are required." };
    const tokens = readDesktopAuthTokens();
    tokens[username] = { refreshToken, updatedAt: Date.now() };
    writeDesktopAuthTokens(tokens);
    return { success: true };
  });

  ipcMain.handle("alleviate:auth-token:get", (event, payload) => {
    if (event.sender !== appWindow?.webContents) return { success: false, error: "Untrusted app window." };
    const username = String(payload?.username || "").trim().toLowerCase();
    return { success: true, token: username ? readDesktopAuthTokens()[username]?.refreshToken || null : null };
  });

  ipcMain.handle("alleviate:auth-token:clear", (event, payload) => {
    if (event.sender !== appWindow?.webContents) return { success: false, error: "Untrusted app window." };
    const username = String(payload?.username || "").trim().toLowerCase();
    if (!username) return { success: false, error: "Username is required." };
    const tokens = readDesktopAuthTokens();
    delete tokens[username];
    writeDesktopAuthTokens(tokens);
    return { success: true };
  });

  ipcMain.handle("alleviate:auth-http:request", async (event, payload) => {
    if (event.sender !== appWindow?.webContents) return { success: false, error: "Untrusted app window." };
    try {
      const target = new URL(String(payload?.url || ""));
      const allowedOrigin = new URL(AUTH_BASE_URL).origin;
      if (target.origin !== allowedOrigin) return { success: false, error: "Auth request origin is not allowed." };
      const routeMethods = {
        "/api/auth/login": ["POST"],
        "/api/auth/register": ["POST"],
        "/api/auth/refresh": ["POST"],
        "/api/auth/logout": ["POST"],
        "/api/github-settings": ["GET", "POST"],
        "/api/github-contents": ["GET", "PUT", "DELETE"],
        "/api/desktop-access": ["GET"],
        "/api/desktop-purchase/start": ["POST"],
        "/api/desktop-purchase/confirm": ["POST"],
      };
      const allowedMethods = routeMethods[target.pathname];
      if (!allowedMethods) return { success: false, error: "App API route is not allowed." };
      const method = String(payload?.method || "POST").toUpperCase();
      if (!allowedMethods.includes(method)) return { success: false, error: "App API method is not allowed for this route." };
      const headers = payload?.headers && typeof payload.headers === "object" ? payload.headers : {};
      const response = await fetch(target, {
        method,
        headers: { ...headers, "x-studio-desktop": "1" },
        body: typeof payload?.body === "string" ? payload.body : undefined,
      });
      const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
      if (payload?.responseType === "binary") {
        const base64 = Buffer.from(await response.arrayBuffer()).toString("base64");
        return { success: true, ok: response.ok, status: response.status, contentType, base64 };
      }
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { /* Preserve non-JSON response text below. */ }
      return { success: true, ok: response.ok, status: response.status, contentType, data, text };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

function getServerDirectory() {
  return app.isPackaged ? path.join(process.resourcesPath, "app") : path.resolve(__dirname, "..");
}

function log(message) {
  try {
    fs.appendFileSync(path.join(app.getPath("userData"), "desktop.log"), `${new Date().toISOString()} ${message}\n`);
  } catch { /* Startup should continue if diagnostic logging is unavailable. */ }
}

function startNextServer() {
  const cwd = getServerDirectory();
  const env = {
    ...process.env,
    HOSTNAME: HOST,
    PORT: String(PORT),
    NODE_PATH: app.isPackaged ? path.join(cwd, "modules") : process.env.NODE_PATH || "",
    NODE_ENV: app.isPackaged ? "production" : process.env.NODE_ENV || "development",
  };

  if (app.isPackaged) {
    serverExited = false;
    log(`Launching bundled server from ${path.join(cwd, "server.js")}; utilityProcess=${typeof utilityProcess?.fork}`);
    serverProcess = utilityProcess.fork(path.join(cwd, "desktop-server-bootstrap.cjs"), [], {
      cwd,
      env,
      stdio: "pipe",
      serviceName: "Alleviate App Server",
    });
    log(`Bundled server process created; pid=${serverProcess.pid}`);
  } else {
    const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run dev -- --hostname 127.0.0.1 --port 3210"]
      : ["run", "dev", "--", "--hostname", HOST, "--port", String(PORT)];
    serverProcess = spawn(command, args, {
      cwd,
      env,
      stdio: "ignore",
      windowsHide: true,
    });
  }

  serverProcess.on("error", (...details) => {
    log(`Server error: ${details.map(String).join(" | ")}`);
    if (!quitting) dialog.showErrorBox("Alleviate server error", details.map(String).join("\n") || "Unknown server error.");
  });
  serverProcess.stdout?.on("data", (chunk) => log(`Server: ${String(chunk).trimEnd()}`));
  serverProcess.stderr?.on("data", (chunk) => log(`Server error output: ${String(chunk).trimEnd()}`));
  serverProcess.on("exit", (code) => {
    serverExited = true;
    log(`Server exited with code ${code}.`);
    if (!quitting && code !== 0 && code !== null) {
      dialog.showErrorBox("Alleviate server stopped", `The app server exited with code ${code}.`);
      app.quit();
    }
  });
}

function assertPortAvailable() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => {
      reject(new Error(`Port ${PORT} is already in use. Close the other app using it, then try again.`));
    });
    probe.listen(PORT, HOST, () => probe.close((error) => error ? reject(error) : resolve()));
  });
}

function waitForNextServer() {
  const timeoutAt = Date.now() + 60_000;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (!serverProcess || serverExited) {
        log("Server exited before the HTTP readiness check succeeded.");
        reject(new Error("The app server stopped before the home page was ready."));
        return;
      }
      const request = http.get(APP_URL, (response) => {
        response.resume();
        log(`HTTP readiness check returned ${response.statusCode}.`);
        resolve();
      });
      request.on("error", () => {
        if (Date.now() >= timeoutAt) {
          reject(new Error("The app server did not become ready in time."));
          return;
        }
        setTimeout(check, 350);
      });
      request.setTimeout(1500, () => request.destroy());
    };
    check();
  });
}

function createWindow() {
  appWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 920,
    minHeight: 640,
    title: "Alleviate",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "assets", "icon.ico"),
    backgroundColor: "#101115",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  appWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("mailto:")) shell.openExternal(url);
    return { action: "deny" };
  });
  appWindow.once("ready-to-show", () => appWindow.show());
  appWindow.on("closed", () => { appWindow = undefined; });
  appWindow.loadURL(APP_URL);
}

ipcMain.handle("alleviate:backup-browse-directory", async (_event, payload) => {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || appWindow, {
    title: String(payload?.title || "Choose automatic backup folder"),
    defaultPath: String(payload?.defaultPath || "").trim() || app.getPath("documents"),
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };
  return { success: true, directoryPath: result.filePaths[0] };
});

ipcMain.handle("alleviate:backup-write-archive", async (_event, payload) => {
  try {
    const directoryPath = String(payload?.directoryPath || "").trim();
    const username = String(payload?.username || "user").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "user";
    const raw = payload?.buffer;
    const buffer = raw instanceof ArrayBuffer
      ? Buffer.from(raw)
      : ArrayBuffer.isView(raw)
        ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
        : null;
    if (!directoryPath) return { success: false, error: "Choose a backup folder first." };
    if (!buffer?.length) return { success: false, error: "Backup data is empty." };

    fs.mkdirSync(directoryPath, { recursive: true });
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const prefix = `alleviate_backup_${username}_`;
    const fileName = `${prefix}${stamp}.zip`;
    const filePath = path.join(directoryPath, fileName);
    fs.writeFileSync(filePath, buffer);

    const oldBackups = fs.readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().startsWith(prefix.toLowerCase()) && entry.name.toLowerCase().endsWith(".zip"))
      .map((entry) => ({ filePath: path.join(directoryPath, entry.name), mtime: fs.statSync(path.join(directoryPath, entry.name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    oldBackups.slice(3).forEach((entry) => { try { fs.unlinkSync(entry.filePath); } catch { /* Retention cleanup is best effort. */ } });
    return { success: true, filePath, fileName };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("alleviate:backup-open-folder", async (_event, payload) => {
  const folder = String(payload?.path || "").trim();
  if (!folder) return { success: false, error: "Choose a backup folder first." };
  const error = await shell.openPath(folder);
  return error ? { success: false, error } : { success: true };
});

app.on("before-quit", () => {
  quitting = true;
  serverProcess?.kill();
});

app.on("window-all-closed", () => app.quit());
