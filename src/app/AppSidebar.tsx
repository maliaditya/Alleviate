"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, ArrowDownUp, CalendarDays, Check, CheckSquare, Download, ExternalLink, FolderOpen, Github, Grid2X2, Home, Hourglass, LoaderCircle, Pencil, RefreshCw, Settings2, Upload, X, GitPullRequest, UploadCloud } from "lucide-react";
import { useAppDialogs } from "./AppDialogs";
import { createAppBackup, downloadAppBackup, parseAppBackup, restoreAppBackup } from "../lib/appBackup";
import { requestAppApi } from "../lib/desktopAuth";
import { applyAlleviateGitHubChanges, clearGitHubConflict, collectAlleviateGitHubFiles, decodeBase64Blob, encodeBlobBase64, getGitHubCheckpoint, getGitHubLastSyncAt, hashBlob, isSensitiveGitHubBackupPath, listGitHubConflicts, mergeGitHubFile, saveGitHubCheckpoint, saveGitHubLastSyncAt, saveGitHubRecoveryCopy, setGitHubSyncScope, stageGitHubOutbox, type GitHubBackupManifest } from "../lib/githubBackup";

type AppSection = "home" | "canvas" | "books" | "mind-map" | "feedback-loop" | "countdown" | "calendar" | "eisenhower" | "tasks" | "tracking" | "support";
type AutoBackupSettings = { directoryPath: string; lastRunWeek: string; lastRunAt: string; lastFilePath: string };
const AUTO_BACKUP_SETTINGS_KEY = "alleviate-auto-backup-settings-v1";
const profileKey = (username: string) => `alleviate-profile-v1:${username || "guest"}`;
type GitHubSettings = { githubToken: string; githubOwner: string; githubRepo: string; githubPath: string };
type GitHubSyncProgress = { mode: "push" | "pull"; status: "running" | "success" | "error" | "cancelled"; title: string; logs: string[]; processed: number; total: number; uploaded: number; skipped: number };
const emptyGitHubSettings: GitHubSettings = { githubToken: "", githubOwner: "", githubRepo: "", githubPath: "" };
const isSafeBackupPath = (path: string) => /^(canvases|mind-maps|app-data|books)\//.test(path) && path.split("/").every((part) => Boolean(part) && part !== "." && part !== ".." && /^[A-Za-z0-9._-]+$/.test(part));
const isValidBackupManifest = (manifest: GitHubBackupManifest) => Boolean(manifest && manifest.format === "alleviate-github-backup" && manifest.version === 1 && manifest.files && typeof manifest.files === "object" && !Array.isArray(manifest.files) && Object.entries(manifest.files).every(([path, hash]) => isSafeBackupPath(path) && typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash)) && (manifest.deleted === undefined || Array.isArray(manifest.deleted) && manifest.deleted.every(isSafeBackupPath)));
const currentWeekKey = (date = new Date()) => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
};
const emptyAutoBackup: AutoBackupSettings = { directoryPath: "", lastRunWeek: "", lastRunAt: "", lastFilePath: "" };
const todayDateValue = () => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`; };
const items: Array<{ id: AppSection; href: string; label: string; Icon: typeof Home }> = [
  { id: "home", href: "/", label: "Home", Icon: Home },
  { id: "tasks", href: "/task-list", label: "Tasks", Icon: CheckSquare },
  { id: "eisenhower", href: "/eisenhower", label: "Eisenhower Matrix", Icon: Grid2X2 },
  { id: "canvas", href: "/canvas", label: "Canvas", Icon: Pencil },
  { id: "tracking", href: "/tasks", label: "Tracking", Icon: Activity },
  { id: "calendar", href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { id: "countdown", href: "/countdown", label: "Countdown", Icon: Hourglass },
];

export default function AppSidebar({ active }: { active: AppSection }) {
  const dialogs = useAppDialogs();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoBackupOpen, setAutoBackupOpen] = useState(false);
  const [autoBackup, setAutoBackup] = useState<AutoBackupSettings>(emptyAutoBackup);
  const [autoBackupReady, setAutoBackupReady] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileBirthDate, setProfileBirthDate] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  const [backupBusy, setBackupBusy] = useState<"export" | "import" | "auto" | null>(null);
  const [githubMenuOpen, setGitHubMenuOpen] = useState(false);
  const [githubSettingsOpen, setGitHubSettingsOpen] = useState(false);
  const [githubSettings, setGitHubSettings] = useState<GitHubSettings>(emptyGitHubSettings);
  const [githubSettingsBusy, setGitHubSettingsBusy] = useState(false);
  const [githubConflicts, setGitHubConflicts] = useState<Array<{ path: string; message: string; local?: Blob; remote?: Blob }>>([]);
  const [githubLinked, setGitHubLinked] = useState(false);
  const [githubSyncScopeKey, setGitHubSyncScopeKey] = useState("");
  const [githubSyncReady, setGitHubSyncReady] = useState(false);
  const [githubLastSyncAt, setGitHubLastSyncAt] = useState(0);
  const [githubBusy, setGitHubBusy] = useState<"pull" | "push" | "hard-push" | null>(null);
  const [githubError, setGitHubError] = useState("");
  const [githubNeedsSettings, setGitHubNeedsSettings] = useState(false);
  const [githubProgress, setGitHubProgress] = useState<GitHubSyncProgress | null>(null);
  const githubActionInFlightRef = useRef(false);
  const githubAutoSyncInFlightRef = useRef(false);
  const autoBackupRunRef = useRef<string | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const githubMenuRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const getUsername = () => {
    try { return String(JSON.parse(localStorage.getItem("alleviate_current_user") || "null")?.username || "").trim().toLowerCase(); }
    catch { return ""; }
  };
  const githubAutoSyncPauseKey = `alleviate-github-auto-sync-paused-v1:${encodeURIComponent(githubSyncScopeKey || "default")}`;

  const reportGitHubProgress = (message: string, metrics?: Partial<Pick<GitHubSyncProgress, "processed" | "total" | "uploaded" | "skipped">>) => {
    setGitHubProgress((current) => current ? { ...current, ...metrics, logs: [...current.logs, message].slice(-8) } : current);
  };

  useEffect(() => {
    if (!profileOpen) return;
    try {
      const saved = JSON.parse(localStorage.getItem(profileKey(getUsername())) || "{}");
      setProfileBirthDate(typeof saved.birthDate === "string" ? saved.birthDate : "");
    } catch { setProfileBirthDate(""); }
  }, [profileOpen]);

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      localStorage.setItem(profileKey(getUsername()), JSON.stringify({ birthDate: profileBirthDate, updatedAt: new Date().toISOString() }));
      window.dispatchEvent(new Event("alleviate:profile-updated"));
      setProfileOpen(false);
    } catch {
      void dialogs.alert({ title: "Could not save birthday", message: "Alleviate could not save this profile detail on this device." });
    }
  };

  useEffect(() => {
    let active = true;
    const refreshGitHubLink = async () => {
      const username = getUsername();
      if (!username) { if (active) { setGitHubLinked(false); setGitHubSyncReady(true); setGitHubLastSyncAt(0); } return; }
      try {
        const response = await requestAppApi(`/api/github-settings?username=${encodeURIComponent(username)}`, { credentials: "include" }, username);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load GitHub settings.");
        const saved = { githubToken: result.settings?.githubToken || "", githubOwner: result.settings?.githubOwner || "", githubRepo: result.settings?.githubRepo || "", githubPath: result.settings?.githubPath || "" };
        const linked = Boolean(saved.githubToken.trim() && saved.githubOwner.trim() && saved.githubRepo.trim());
        if (!active) return;
        setGitHubSettings(saved);
        setGitHubLinked(linked);
        if (linked) {
          const rootPath = saved.githubPath.trim().replace(/^\/+|\/+$/g, "").replace(/\.zip$/i, "");
          const scope = `${username}:${saved.githubOwner.trim().toLowerCase()}/${saved.githubRepo.trim().toLowerCase()}/${rootPath}`;
          setGitHubSyncScope(scope); setGitHubSyncScopeKey(scope);
          const lastSync = await getGitHubLastSyncAt();
          if (active) { setGitHubLastSyncAt(lastSync); void listGitHubConflicts().then(setGitHubConflicts).catch(() => setGitHubConflicts([])); }
        } else if (active) { setGitHubLastSyncAt(0); setGitHubConflicts([]); }
      } catch {
        if (active) { setGitHubLinked(false); setGitHubLastSyncAt(0); }
      } finally { if (active) setGitHubSyncReady(true); }
    };
    void refreshGitHubLink();
    window.addEventListener("alleviate:auth-change", refreshGitHubLink);
    window.addEventListener("storage", refreshGitHubLink);
    return () => { active = false; window.removeEventListener("alleviate:auth-change", refreshGitHubLink); window.removeEventListener("storage", refreshGitHubLink); };
  }, []);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUTO_BACKUP_SETTINGS_KEY) || "null");
      if (parsed && typeof parsed === "object") setAutoBackup({ ...emptyAutoBackup, ...parsed });
    } catch { /* Ignore malformed backup settings. */ }
    setIsDesktop(Boolean((window as any).alleviateDesktop?.isDesktop));
    setAutoBackupReady(true);
  }, []);

  useEffect(() => {
    if (autoBackupReady) localStorage.setItem(AUTO_BACKUP_SETTINGS_KEY, JSON.stringify(autoBackup));
  }, [autoBackup, autoBackupReady]);

  const runAutoBackup = async () => {
    const bridge = (window as any).alleviateDesktop?.backup;
    const directoryPath = autoBackup.directoryPath.trim();
    const weekKey = currentWeekKey();
    const username = (() => {
      try { return JSON.parse(localStorage.getItem("alleviate_current_user") || "null")?.username || "user"; }
      catch { return "user"; }
    })();
    if (!bridge?.writeArchive || !directoryPath) return;
    const runKey = `${username.toLowerCase()}::${weekKey}`;
    if (autoBackupRunRef.current === runKey) return;
    autoBackupRunRef.current = runKey;
    setBackupBusy("auto");
    try {
      const archive = await createAppBackup();
      const result = await bridge.writeArchive({ directoryPath, username, buffer: await archive.arrayBuffer() });
      if (!result?.success || !result?.filePath) throw new Error(result?.error || "Could not save the automatic backup.");
      setAutoBackup((current) => ({ ...current, lastRunWeek: weekKey, lastRunAt: new Date().toISOString(), lastFilePath: result.filePath }));
    } catch (error) {
      autoBackupRunRef.current = null;
      await dialogs.alert({ title: "Automatic backup failed", message: error instanceof Error ? error.message : "Could not save the automatic backup." });
    } finally { setBackupBusy(null); }
  };

  useEffect(() => {
    if (!autoBackupReady || !isDesktop || !autoBackup.directoryPath || autoBackup.lastRunWeek === currentWeekKey()) return;
    void runAutoBackup();
  }, [autoBackupReady, isDesktop, autoBackup.directoryPath, autoBackup.lastRunWeek]);

  useEffect(() => {
    if (!settingsOpen && !githubMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!settingsRef.current?.contains(event.target)) setSettingsOpen(false);
      if (!githubMenuRef.current?.contains(event.target)) setGitHubMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { setSettingsOpen(false); setGitHubMenuOpen(false); } };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("pointerdown", onPointerDown); window.removeEventListener("keydown", onKeyDown); };
  }, [settingsOpen, githubMenuOpen]);

  const openGitHubSettings = async () => {
    setGitHubMenuOpen(false);
    setGitHubError("");
    setGitHubSettingsOpen(true);
    const username = getUsername();
    if (!username) { setGitHubError("Sign in to configure GitHub sync."); return; }
    setGitHubSettingsBusy(true);
    try {
      const response = await requestAppApi(`/api/github-settings?username=${encodeURIComponent(username)}`, { credentials: "include" }, username);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load GitHub settings.");
      const saved = { githubToken: result.settings?.githubToken || "", githubOwner: result.settings?.githubOwner || "", githubRepo: result.settings?.githubRepo || "", githubPath: result.settings?.githubPath || "" };
      setGitHubSettings(saved);
      const rootPath = saved.githubPath.trim().replace(/^\/+|\/+$/g, "").replace(/\.zip$/i, "");
      setGitHubSyncScope(`${username}:${saved.githubOwner.trim().toLowerCase()}/${saved.githubRepo.trim().toLowerCase()}/${rootPath}`);
      void listGitHubConflicts().then(setGitHubConflicts).catch(() => setGitHubConflicts([]));
    } catch (error) {
      setGitHubError(error instanceof Error ? error.message : "Could not load GitHub settings.");
    } finally { setGitHubSettingsBusy(false); }
  };

  const resolveGitHubConflict = async (path: string, version: "local" | "remote") => {
    const conflict = githubConflicts.find((item) => item.path === path);
    if (!conflict) return;
    try {
      if (version === "remote") {
        if (conflict.remote) {
          await applyAlleviateGitHubChanges([{ path, blob: conflict.remote }]);
          await saveGitHubCheckpoint(path, conflict.remote);
        } else {
          await applyAlleviateGitHubChanges([], [path]);
          await saveGitHubCheckpoint(path);
        }
      } else {
        if (!conflict.local) return;
        await saveGitHubCheckpoint(path, conflict.remote, false);
        await stageGitHubOutbox(path, conflict.local);
        await clearGitHubConflict(path);
      }
      setGitHubConflicts(await listGitHubConflicts());
    } catch (error) {
      await dialogs.alert({ title: "Could not resolve sync conflict", message: error instanceof Error ? error.message : "The conflict could not be resolved." });
    }
  };

  const saveGitHubSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = getUsername();
    if (!username) { setGitHubError("Sign in to save GitHub settings."); return; }
    if (!githubSettings.githubToken.trim() || !githubSettings.githubOwner.trim() || !githubSettings.githubRepo.trim()) {
      setGitHubError("Enter a GitHub token, owner, and repository."); return;
    }
    setGitHubSettingsBusy(true); setGitHubError("");
    try {
      const response = await requestAppApi("/api/github-settings", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, ...githubSettings, githubFetchMissingOnly: true }),
      }, username);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save GitHub settings.");
      const rootPath = githubSettings.githubPath.trim().replace(/^\/+|\/+$/g, "").replace(/\.zip$/i, "");
      const scope = `${username}:${githubSettings.githubOwner.trim().toLowerCase()}/${githubSettings.githubRepo.trim().toLowerCase()}/${rootPath}`;
      setGitHubSyncScope(scope); setGitHubSyncScopeKey(scope);
      setGitHubLinked(true);
      setGitHubNeedsSettings(false);
      setGitHubSyncReady(true);
      setGitHubLastSyncAt(await getGitHubLastSyncAt());
      setGitHubConflicts(await listGitHubConflicts());
      setGitHubSettingsOpen(false);
      await dialogs.alert({ title: "GitHub settings saved", message: "Your repository connection is ready to use." });
    } catch (error) {
      setGitHubError(error instanceof Error ? error.message : "Could not save GitHub settings.");
    } finally { setGitHubSettingsBusy(false); }
  };

  const getGitHubConfig = async () => {
    const username = getUsername();
    if (!username) throw new Error("Sign in to use GitHub sync.");
    const config = githubSettings.githubToken.trim() ? githubSettings : await (async () => {
      const response = await requestAppApi(`/api/github-settings?username=${encodeURIComponent(username)}`, { credentials: "include" }, username);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load GitHub settings.");
      const saved = { githubToken: result.settings?.githubToken || "", githubOwner: result.settings?.githubOwner || "", githubRepo: result.settings?.githubRepo || "", githubPath: result.settings?.githubPath || "" };
      setGitHubSettings(saved);
      return saved;
    })();
    if (!config.githubToken?.trim() || !config.githubOwner?.trim() || !config.githubRepo?.trim()) {
      throw new Error("Configure your GitHub token, owner, and repository in GitHub settings first.");
    }
    let rootPath = String(config.githubPath || "").trim().replace(/^\/+|\/+$/g, "");
    const legacyFilePath = rootPath.toLowerCase().endsWith(".zip") ? rootPath : [rootPath, "alleviate-backup.zip"].filter(Boolean).join("/");
    if (rootPath.toLowerCase().endsWith(".zip")) rootPath = rootPath.slice(0, -4);
    return { username, config, rootPath, legacyFilePath };
  };

  const requestGitHubFile = async (method: "GET" | "PUT" | "DELETE", username: string, config: GitHubSettings, filePath: string, body?: Record<string, unknown>, raw = false) => {
    const url = new URL("/api/github-contents", window.location.origin);
    url.searchParams.set("owner", config.githubOwner.trim()); url.searchParams.set("repo", config.githubRepo.trim());
    url.searchParams.set("path", `contents/${filePath}`); url.searchParams.set("username", username);
    if (raw) url.searchParams.set("raw", "1");
    const response = await requestAppApi(`${url.pathname}${url.search}`, { method, credentials: "include", headers: { "Content-Type": "application/json", "x-github-token": config.githubToken.trim() }, body: body ? JSON.stringify(body) : undefined }, username, raw ? "binary" : "json");
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message = response.status === 404
        ? `GitHub could not ${method === "GET" ? "find" : method === "DELETE" ? "delete" : "write"} "${filePath}" in ${config.githubOwner}/${config.githubRepo}.`
        : (data.message || data.error || `GitHub request failed (${response.status}).`);
      const error = new Error(message) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    if (raw) return response.blob();
    return response.json().catch(() => ({}));
  };

  const requestGitHubManifest = async (username: string, config: GitHubSettings, manifestPath: string) => {
    const file = await requestGitHubFile("GET", username, config, manifestPath) as { content?: unknown; encoding?: unknown; sha?: unknown };
    if (typeof file.content !== "string" || file.encoding !== "base64") {
      throw new Error("GitHub returned a manifest file in an unsupported encoding. No data was changed.");
    }
    let manifest: unknown;
    try { manifest = JSON.parse(await decodeBase64Blob(file.content, "application/json").text()); }
    catch { throw new Error("The GitHub backup manifest is not valid JSON. No data was changed."); }
    return { manifest: manifest as GitHubBackupManifest, sha: typeof file.sha === "string" ? file.sha : undefined };
  };

  const runGitHubAction = async (action: "pull" | "push" | "hard-push", options: { silent?: boolean } = {}): Promise<boolean> => {
    if (githubActionInFlightRef.current) return false;
    githubActionInFlightRef.current = true;
    let releaseCrossTabLock: (() => void) | undefined;
    let crossTabLockTask: Promise<unknown> | undefined;
    let releaseRemoteSyncLock: (() => Promise<void>) | undefined;
    if (typeof navigator !== "undefined" && navigator.locks) {
      let resolveLockAcquired!: (acquired: boolean) => void;
      const lockAcquired = new Promise<boolean>((resolve) => { resolveLockAcquired = resolve; });
      crossTabLockTask = navigator.locks.request("alleviate-github-backup-sync", { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) { resolveLockAcquired(false); return; }
        resolveLockAcquired(true);
        await new Promise<void>((resolve) => { releaseCrossTabLock = resolve; });
      }).catch(() => { resolveLockAcquired(false); });
      try {
        if (!await lockAcquired) {
          githubActionInFlightRef.current = false;
          if (!options.silent) await dialogs.alert({ title: "GitHub sync already running", message: "Another Alleviate tab or window is syncing this backup. Wait for it to finish, then try again." });
          return false;
        }
      } catch (error) {
        githubActionInFlightRef.current = false;
        throw error;
      }
    }
    setGitHubMenuOpen(false); setGitHubBusy(action);
    setGitHubProgress({ mode: action === "pull" ? "pull" : "push", status: "running", title: action === "pull" ? "GitHub Pull Running" : action === "hard-push" ? "GitHub Hard Push Running" : "GitHub Push Running", logs: ["Connecting to GitHub…"], processed: 0, total: 0, uploaded: 0, skipped: 0 });
    try {
      const { username, config, rootPath, legacyFilePath } = await getGitHubConfig();
      const remoteLockPath = [rootPath, ".alleviate-sync-lock.json"].filter(Boolean).join("/");
      const lockToken = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const lockTtlMs = 90_000;
      let lockSha: string | undefined;
      let lockLost = false;
      let lockQueue: Promise<unknown> = Promise.resolve();
      const serializedLockWork = <T,>(work: () => Promise<T>) => {
        const next = lockQueue.then(work, work);
        lockQueue = next.then(() => undefined, () => undefined);
        return next;
      };
      const readRemoteLock = async (): Promise<{ token: string; expiresAt: number; sha?: string } | null> => {
        try {
          const file = await requestGitHubFile("GET", username, config, remoteLockPath) as { content?: unknown; encoding?: unknown; sha?: unknown };
          if (typeof file.content !== "string" || file.encoding !== "base64") throw new Error("The GitHub sync lock file is unreadable. Remove .alleviate-sync-lock.json from the backup folder, then retry.");
          let data: { token?: unknown; expiresAt?: unknown };
          try { data = JSON.parse(await decodeBase64Blob(file.content, "application/json").text()); }
          catch { throw new Error("The GitHub sync lock file is invalid. Remove .alleviate-sync-lock.json from the backup folder, then retry."); }
          if (typeof data.token !== "string" || typeof data.expiresAt !== "number") throw new Error("The GitHub sync lock file is unsupported. Remove .alleviate-sync-lock.json from the backup folder, then retry.");
          return { token: data.token, expiresAt: data.expiresAt, sha: typeof file.sha === "string" ? file.sha : undefined };
        } catch (error) {
          if ((error as Error & { status?: number }).status === 404) return null;
          throw error;
        }
      };
      const writeRemoteLock = async (sha: string | undefined, expiresAt: number) => {
        const body: Record<string, unknown> = {
          message: "Alleviate sync lock",
          content: await encodeBlobBase64(new Blob([JSON.stringify({ token: lockToken, expiresAt, client: typeof window !== "undefined" && (window as Window & { alleviateDesktop?: { isDesktop?: boolean } }).alleviateDesktop?.isDesktop ? "desktop" : "browser" })], { type: "application/json" })),
        };
        if (sha) body.sha = sha;
        await requestGitHubFile("PUT", username, config, remoteLockPath, body);
        const saved = await readRemoteLock();
        if (!saved || saved.token !== lockToken) throw new Error("Another Alleviate client took the GitHub sync lock. This sync stopped before continuing.");
        lockSha = saved.sha;
      };
      let remoteLockTimer: number | undefined;
      const acquireRemoteLock = async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const current = await readRemoteLock();
          if (current && current.expiresAt > Date.now() && current.token !== lockToken) {
            const takeover = action === "hard-push" && await dialogs.confirm({
              title: "Stop the other GitHub sync?",
              message: "Another browser or desktop client is syncing this backup. Taking over will make that client stop before its next GitHub write, then continue with this hard push.",
              confirmLabel: "Stop other sync",
              destructive: true,
            });
            if (!takeover) {
              setGitHubProgress((progress) => progress ? { ...progress, status: "cancelled", title: "GitHub Sync Already Running", logs: [...progress.logs, "Another client owns the sync lock. No files were changed by this attempt."].slice(-8) } : progress);
              if (!options.silent && action !== "hard-push") await dialogs.alert({ title: "GitHub sync already running", message: "Another browser or desktop client is syncing this backup. Wait for it to finish, then retry." });
              return false;
            }
          }
          try {
            await writeRemoteLock(current?.sha, Date.now() + lockTtlMs);
            break;
          } catch (error) {
            const status = (error as Error & { status?: number }).status;
            if ((status !== 409 && status !== 422) || attempt === 4) throw error;
            await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt) + Math.random() * 100));
          }
        }
        const check = await readRemoteLock();
        if (!check || check.token !== lockToken) throw new Error("Could not acquire the GitHub sync lock. Another client may be syncing this backup.");
        remoteLockTimer = window.setInterval(() => {
          void serializedLockWork(async () => {
            try {
              const current = await readRemoteLock();
              if (!current || current.token !== lockToken) { lockLost = true; return; }
              await writeRemoteLock(current.sha, Date.now() + lockTtlMs);
            } catch { lockLost = true; }
          });
        }, 20_000);
        releaseRemoteSyncLock = async () => {
          if (remoteLockTimer !== undefined) window.clearInterval(remoteLockTimer);
          await serializedLockWork(async () => {
            try {
              const current = await readRemoteLock();
              if (current?.token === lockToken && current.sha) await requestGitHubFile("DELETE", username, config, remoteLockPath, { message: "Release Alleviate sync lock", sha: current.sha });
            } catch { /* The lease expires automatically if GitHub is temporarily unavailable. */ }
          });
        };
        return true;
      };
      const assertRemoteLock = async () => serializedLockWork(async () => {
        if (lockLost) throw new Error("Another client stopped this sync by taking over the GitHub lock. No further files will be written.");
        const current = await readRemoteLock();
        if (!current || current.token !== lockToken) {
          lockLost = true;
          throw new Error("Another client stopped this sync by taking over the GitHub lock. No further files will be written.");
        }
        lockSha = current.sha;
      });
      if (!await acquireRemoteLock()) return false;
      reportGitHubProgress(`Connected to ${config.githubOwner}/${config.githubRepo}${rootPath ? ` · ${rootPath}` : " · repository root"}.`);
      setGitHubSyncScope(`${username}:${config.githubOwner.trim().toLowerCase()}/${config.githubRepo.trim().toLowerCase()}/${rootPath}`);
      const manifestPath = [rootPath, "manifest.json"].filter(Boolean).join("/");
      if (action === "pull") {
        let remoteManifest: GitHubBackupManifest;
        try {
          reportGitHubProgress("Reading backup manifest…");
          remoteManifest = (await requestGitHubManifest(username, config, manifestPath)).manifest;
        } catch (error) {
          if ((error as Error & { status?: number }).status !== 404) throw error;
          let legacy: { content?: string; encoding?: string };
          try { legacy = await requestGitHubFile("GET", username, config, legacyFilePath) as { content?: string; encoding?: string }; }
          catch (legacyError) {
            if ((legacyError as Error & { status?: number }).status === 404) throw new Error("No Alleviate backup manifest or legacy archive was found at this GitHub repository path.");
            throw legacyError;
          }
          if (typeof legacy.content !== "string" || legacy.encoding !== "base64") throw new Error("No modular backup manifest or legacy Alleviate backup was found at this repository path.");
          reportGitHubProgress("Found a legacy archive. Waiting for restore confirmation…");
          const confirmed = await dialogs.confirm({ title: "Restore legacy GitHub backup?", message: "This older backup is a single archive. Restoring it replaces the data on this device. Your next Push will create the new folder-based backup structure.", confirmLabel: "Restore backup", destructive: true });
          if (!confirmed) { setGitHubProgress((current) => current ? { ...current, status: "cancelled", title: "GitHub Pull Cancelled", logs: [...current.logs, "Restore cancelled. No data was changed."].slice(-8) } : current); return false; }
          const binary = atob(legacy.content.replace(/\s/g, ""));
          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
          const backup = await parseAppBackup(new File([bytes], "alleviate-backup.zip", { type: "application/zip" }));
          const restored = await restoreAppBackup(backup);
          setGitHubProgress((current) => current ? { ...current, status: "success", title: "GitHub Pull Complete", logs: [...current.logs, `Restored ${restored.localStorageKeys} app data entries and ${restored.records} saved files.`].slice(-8) } : current);
          await dialogs.alert({ title: "Legacy backup restored", message: `Restored ${restored.localStorageKeys} app data entries and ${restored.records} saved files. Alleviate will reload now.` });
          window.location.reload();
          return true;
        }
        if (!isValidBackupManifest(remoteManifest)) throw new Error("This GitHub backup manifest is unsafe or uses a format this app does not support. No data was changed. Open GitHub settings to choose a different backup folder, or restore a legacy backup.");
        const firstPullOnThisDevice = await getGitHubLastSyncAt() === 0;
        if (firstPullOnThisDevice) reportGitHubProgress("First pull on this device · GitHub will replace the seeded local backup data. A recovery copy will be kept.");
        const pullPaths = Object.keys(remoteManifest.files);
        const pullTotal = pullPaths.length + (remoteManifest.deleted || []).filter((path) => !remoteManifest.files[path]).length;
        reportGitHubProgress(`Manifest loaded · ${pullPaths.length} files tracked. Preparing comparison…`, { total: pullTotal, processed: 0 });
        const localFiles = await collectAlleviateGitHubFiles();
        for (const file of localFiles) await stageGitHubOutbox(file.path, file.blob);
        const localByPath = new Map(localFiles.map((file) => [file.path, file]));
        const downloads: Array<{ path: string; blob: Blob }> = [];
        const checkpoints: Array<{ path: string; blob: Blob; acknowledge: boolean }> = [];
        let autoResolvedCount = 0;
        let pullProcessed = 0;
        let pullSkipped = 0;
        for (const [path, remoteHash] of Object.entries(remoteManifest.files)) {
          reportGitHubProgress(`Checking ${path}…`);
          if (isSensitiveGitHubBackupPath(path)) {
            await clearGitHubConflict(path);
            pullProcessed += 1;
            pullSkipped += 1;
            reportGitHubProgress(`Skipped sensitive credential · ${path}`, { processed: pullProcessed, skipped: pullSkipped });
            continue;
          }
          const local = localByPath.get(path)?.blob;
          const base = await getGitHubCheckpoint(path);
          await stageGitHubOutbox(path, local);
          const localHash = local ? await hashBlob(local) : undefined;
          if (localHash === remoteHash) { const same = local!; checkpoints.push({ path, blob: same, acknowledge: true }); await clearGitHubConflict(path); pullProcessed += 1; pullSkipped += 1; reportGitHubProgress(`Already current · ${path}`, { processed: pullProcessed, skipped: pullSkipped }); continue; }
          const remote = await requestGitHubFile("GET", username, config, [rootPath, path].filter(Boolean).join("/"), undefined, true) as Blob;
          const merged = firstPullOnThisDevice
            ? { blob: remote, conflict: false }
            : await mergeGitHubFile(path, base, local, remote, "remote");
          if (firstPullOnThisDevice && local && localHash !== remoteHash) {
            await saveGitHubRecoveryCopy(path, base, local, remote, "First pull replaced the new device's seeded or local backup data with the GitHub version.");
            reportGitHubProgress(`Saved first-pull recovery copy · ${path}`);
          } else if (merged.conflict) {
            autoResolvedCount += 1;
            await saveGitHubRecoveryCopy(path, base, local, remote, merged.reason || "Pull chose GitHub's version for this conflicting file.");
            reportGitHubProgress(`Auto-resolved conflict · kept GitHub version · ${path}`);
          }
          await clearGitHubConflict(path);
          if (merged.blob && (!local || await hashBlob(merged.blob) !== localHash)) { downloads.push({ path, blob: merged.blob }); reportGitHubProgress(`Merged remote changes · ${path}`); }
          else { pullSkipped += 1; reportGitHubProgress(`No local change needed · ${path}`); }
          checkpoints.push({ path, blob: remote, acknowledge: Boolean(merged.blob && await hashBlob(merged.blob) === remoteHash) });
          pullProcessed += 1;
          reportGitHubProgress(`Checked ${path}`, { processed: pullProcessed, skipped: pullSkipped });
        }
        const deletionsToApply: string[] = [];
        const remoteDeletedPaths = (remoteManifest.deleted || []).filter((path) => !remoteManifest.files[path]);
        const firstPullLocalOnlyPaths = firstPullOnThisDevice
          ? localFiles.map((file) => file.path).filter((path) => !remoteManifest.files[path] && !remoteDeletedPaths.includes(path))
          : [];
        for (const path of [...new Set([...remoteDeletedPaths, ...firstPullLocalOnlyPaths])]) {
          if (remoteManifest.files[path]) continue;
          reportGitHubProgress(`Checking remote deletion · ${path}`);
          const local = localByPath.get(path)?.blob;
          const base = await getGitHubCheckpoint(path);
          await stageGitHubOutbox(path, local);
          if (firstPullOnThisDevice) {
            if (local) {
              await saveGitHubRecoveryCopy(path, base, local, undefined, "First pull removed data that is not present in the GitHub backup. A local recovery copy was saved.");
              reportGitHubProgress(`Saved first-pull recovery copy · ${path}`);
            }
            deletionsToApply.push(path);
            await saveGitHubCheckpoint(path);
            await clearGitHubConflict(path);
          } else if (!local || !base || await hashBlob(local) === await hashBlob(base)) {
            deletionsToApply.push(path);
            await saveGitHubCheckpoint(path);
            await clearGitHubConflict(path);
          } else {
            autoResolvedCount += 1;
            await saveGitHubRecoveryCopy(path, base, local, undefined, "Pull followed GitHub's deletion; the local copy was kept for recovery.");
            deletionsToApply.push(path);
            await saveGitHubCheckpoint(path);
            await clearGitHubConflict(path);
            reportGitHubProgress(`Auto-resolved deletion · kept GitHub version · ${path}`);
          }
          pullProcessed += 1;
          reportGitHubProgress(`Processed deletion · ${path}`, { processed: pullProcessed });
        }
        reportGitHubProgress(`Applying ${downloads.length} downloaded file${downloads.length === 1 ? "" : "s"} on this device…`);
        await applyAlleviateGitHubChanges(downloads, deletionsToApply);
        for (const checkpoint of checkpoints) await saveGitHubCheckpoint(checkpoint.path, checkpoint.blob, checkpoint.acknowledge);
        const pullSummary = `Downloaded/merged ${downloads.length} · Already current ${pullSkipped} · Auto-resolved ${autoResolvedCount}`;
        setGitHubProgress((current) => current ? { ...current, status: "success", title: "GitHub Pull Complete", processed: pullTotal, total: pullTotal, skipped: pullSkipped, logs: [...current.logs, pullSummary].slice(-8) } : current);
        if (!options.silent) await dialogs.alert({ title: "GitHub pull complete", message: `Merged ${downloads.length} changed files from GitHub. Automatically resolved ${autoResolvedCount} conflict(s); recovery copies were saved on this device.` });
      } else {
        reportGitHubProgress("Scanning local backup data…");
        let snapshot = await collectAlleviateGitHubFiles();
        for (const file of snapshot) await stageGitHubOutbox(file.path, file.blob);
        reportGitHubProgress(`Prepared ${snapshot.length} local backup files. Checking the remote manifest…`, { total: snapshot.length, processed: 0, uploaded: 0, skipped: 0 });
        const previousManifest = await (async () => {
          try { return (await requestGitHubManifest(username, config, manifestPath)).manifest; }
          catch (error) { if ((error as Error & { status?: number }).status === 404) return null; throw error; }
        })();
        if (previousManifest && !isValidBackupManifest(previousManifest)) throw new Error("This GitHub backup manifest is unsafe or uses a format this app does not support. Push was stopped and no data was changed. Open GitHub settings to choose a different backup folder.");
        if (!previousManifest) {
          let remoteItems: unknown = [];
          try { remoteItems = await requestGitHubFile("GET", username, config, rootPath); }
          catch (error) { if ((error as Error & { status?: number }).status !== 404) throw error; }
          if (!Array.isArray(remoteItems) || remoteItems.some((item) => item && typeof item === "object" && (item as { name?: unknown }).name !== ".alleviate-sync-lock.json")) {
            throw new Error("No Alleviate manifest was found, but this GitHub backup folder already contains files. Push was stopped to protect them. Use Pull to restore a legacy backup, or choose an empty backup folder in GitHub settings.");
          }
        }
        let autoResolvedCount = 0;
        if (previousManifest && action !== "hard-push") {
          const localByPath = new Map(snapshot.map((file) => [file.path, file]));
          const remoteMerges: Array<{ path: string; blob: Blob }> = [];
          const checkpoints: Array<{ path: string; blob: Blob }> = [];
          let mergeProcessed = 0;
          reportGitHubProgress(`Comparing ${Object.keys(previousManifest.files).length} remote files before upload…`, { total: Object.keys(previousManifest.files).length, processed: 0 });
          for (const [path, remoteHash] of Object.entries(previousManifest.files)) {
            reportGitHubProgress(`Checking remote changes · ${path}`);
            if (isSensitiveGitHubBackupPath(path)) {
              await stageGitHubOutbox(path, undefined);
              await clearGitHubConflict(path);
              mergeProcessed += 1;
              reportGitHubProgress(`Excluded sensitive credential from backup · ${path}`, { processed: mergeProcessed });
              continue;
            }
            const local = localByPath.get(path)?.blob;
            const base = await getGitHubCheckpoint(path);
            await stageGitHubOutbox(path, local);
            const localHash = local ? await hashBlob(local) : undefined;
            if (localHash === remoteHash) { checkpoints.push({ path, blob: local! }); await clearGitHubConflict(path); mergeProcessed += 1; reportGitHubProgress(`Already current · ${path}`, { processed: mergeProcessed }); continue; }
            const remote = await requestGitHubFile("GET", username, config, [rootPath, path].filter(Boolean).join("/"), undefined, true) as Blob;
            const merged = await mergeGitHubFile(path, base, local, remote, "local");
            if (merged.conflict) {
              autoResolvedCount += 1;
              await saveGitHubRecoveryCopy(path, base, local, remote, merged.reason || "Push chose this device's version for the conflicting file.");
              reportGitHubProgress(`Auto-resolved conflict · kept this device · ${path}`);
              await clearGitHubConflict(path);
            }
            await clearGitHubConflict(path);
            if (merged.blob && (!local || await hashBlob(merged.blob) !== localHash)) remoteMerges.push({ path, blob: merged.blob });
            checkpoints.push({ path, blob: remote });
            mergeProcessed += 1;
            if (!merged.conflict) reportGitHubProgress(`Compared · ${path}`, { processed: mergeProcessed });
          }
          if (remoteMerges.length) await applyAlleviateGitHubChanges(remoteMerges);
          for (const checkpoint of checkpoints) await saveGitHubCheckpoint(checkpoint.path, checkpoint.blob, false);
          // Pull files created by another device since this device's last sync.
          for (const [path] of Object.entries(previousManifest.files)) if (!localByPath.has(path)) {
            const remote = await requestGitHubFile("GET", username, config, [rootPath, path].filter(Boolean).join("/"), undefined, true) as Blob;
            const base = await getGitHubCheckpoint(path);
            if (!base) { await applyAlleviateGitHubChanges([{ path, blob: remote }]); await saveGitHubCheckpoint(path, remote); }
          }
          snapshot = await collectAlleviateGitHubFiles();
        }
        const previousHashes = previousManifest?.files || {};
        const nextHashes = Object.fromEntries(snapshot.map(({ path, hash }) => [path, hash]).sort(([left], [right]) => String(left).localeCompare(String(right))));
        const stalePaths = Object.keys(previousHashes).filter((path) => !(path in nextHashes));
        let deleted = Array.from(new Set([...(previousManifest?.deleted || []), ...stalePaths])).filter((path) => !(path in nextHashes)).sort();
        if (action === "hard-push") {
          reportGitHubProgress("Waiting for hard push confirmation…");
          const confirmed = await dialogs.confirm({ title: "Hard push Alleviate data?", message: "Hard Push replaces every file tracked by the Alleviate backup on GitHub with this device’s data and removes tracked files deleted here. Remote-only backup files will also be removed.", confirmLabel: "Hard push", destructive: true });
          if (!confirmed) { setGitHubProgress((current) => current ? { ...current, status: "cancelled", title: "GitHub Hard Push Cancelled", logs: [...current.logs, "Cancelled. No hard push was performed."].slice(-8) } : current); return false; }
        }
        let pushed = 0;
        let fileProcessed = 0;
        let fileUploaded = 0;
        let fileSkipped = 0;
        reportGitHubProgress(`Ready to sync ${snapshot.length} local files. Uploading changed files…`, { total: snapshot.length, processed: 0, uploaded: 0, skipped: 0 });
        const mergedDownloads: Array<{ path: string; blob: Blob }> = [];
        for (const file of snapshot) {
          reportGitHubProgress(`Checking ${file.path}…`);
          if (action !== "hard-push" && previousHashes[file.path] === file.hash) {
            await saveGitHubCheckpoint(file.path, file.blob, true);
            await clearGitHubConflict(file.path);
            fileProcessed += 1; fileSkipped += 1;
            reportGitHubProgress(`Unchanged · ${file.path}`, { processed: fileProcessed, skipped: fileSkipped });
            continue;
          }
          const base = await getGitHubCheckpoint(file.path);
          let synced = false;
          for (let attempt = 0; attempt < 5 && !synced; attempt += 1) {
            let metadata: { sha?: string } | null = null;
            let remote: Blob | undefined;
            try {
              metadata = await requestGitHubFile("GET", username, config, [rootPath, file.path].filter(Boolean).join("/")) as { sha?: string };
              remote = await requestGitHubFile("GET", username, config, [rootPath, file.path].filter(Boolean).join("/"), undefined, true) as Blob;
            } catch (error) { if ((error as Error & { status?: number }).status !== 404) throw error; }
            const desired = action === "hard-push" ? { blob: file.blob, conflict: false } : await mergeGitHubFile(file.path, base, file.blob, remote, "local");
            if (desired.conflict) {
              autoResolvedCount += 1;
              await saveGitHubRecoveryCopy(file.path, base, file.blob, remote, desired.reason || "Push chose this device's version for the conflicting file.");
              await clearGitHubConflict(file.path);
              reportGitHubProgress(`Auto-resolved conflict · kept this device · ${file.path}`);
            }
            if (!desired.blob) throw new Error(`Could not produce a safe version for ${file.path}.`);
            const desiredHash = await hashBlob(desired.blob);
            if (remote && await hashBlob(remote) === desiredHash) {
              if (desiredHash !== file.hash) mergedDownloads.push({ path: file.path, blob: desired.blob });
              nextHashes[file.path] = desiredHash;
              await saveGitHubCheckpoint(file.path, remote, desiredHash === file.hash);
              fileProcessed += 1; fileSkipped += 1;
              reportGitHubProgress(`Already present on GitHub · ${file.path}`, { processed: fileProcessed, skipped: fileSkipped });
              synced = true;
              continue;
            }
            const payload: Record<string, unknown> = { message: `Alleviate backup: ${file.path}`, content: await encodeBlobBase64(desired.blob) };
            if (metadata?.sha) payload.sha = metadata.sha;
            try {
              await assertRemoteLock();
              const saved = await requestGitHubFile("PUT", username, config, [rootPath, file.path].filter(Boolean).join("/"), payload) as { content?: { sha?: unknown } };
              let verifiedMatches = false;
              let verifiedBlob = desired.blob;
              if (action === "hard-push" && typeof saved?.content?.sha === "string") {
                // The Contents API response identifies the exact Git blob it committed.
                // Confirm the current path still points to that blob; an immediate raw
                // download can briefly return a stale CDN copy and falsely look like a race.
                const latest = await requestGitHubFile("GET", username, config, [rootPath, file.path].filter(Boolean).join("/")) as { sha?: unknown };
                verifiedMatches = latest?.sha === saved.content.sha;
              } else {
                const verified = await requestGitHubFile("GET", username, config, [rootPath, file.path].filter(Boolean).join("/"), undefined, true) as Blob;
                verifiedBlob = verified;
                verifiedMatches = await hashBlob(verified) === desiredHash;
              }
              if (!verifiedMatches) {
                if (attempt === 4) throw new Error(action === "hard-push"
                  ? `GitHub could not confirm the uploaded version of ${file.path}. The local copy is still queued; retry Hard push.`
                  : `GitHub changed ${file.path} during sync. The local change remains queued for the next attempt.`);
                await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt) + Math.random() * 100));
                continue;
              }
              if (desiredHash !== file.hash) mergedDownloads.push({ path: file.path, blob: desired.blob });
              nextHashes[file.path] = desiredHash;
              await saveGitHubCheckpoint(file.path, verifiedBlob, true);
              pushed += 1;
              fileProcessed += 1; fileUploaded += 1;
              reportGitHubProgress(`Pushed ${file.path}`, { processed: fileProcessed, uploaded: fileUploaded, skipped: fileSkipped });
              synced = true;
            } catch (error) {
              const status = (error as Error & { status?: number }).status;
              if ((status === 409 || status === 422 || status === undefined || status >= 500) && attempt < 4) {
                await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt) + Math.random() * 100));
                continue;
              }
              throw error;
            }
          }
        }
        if (mergedDownloads.length) await applyAlleviateGitHubChanges(mergedDownloads);
        const pathsToRemove = action === "hard-push"
          ? Array.from(new Set([...stalePaths, ...Object.keys(previousManifest?.files || {}).filter((path) => !(path in nextHashes))])).sort()
          : stalePaths;
        for (const path of pathsToRemove) {
          reportGitHubProgress(`Checking removed local file · ${path}`);
          await stageGitHubOutbox(path, undefined);
          const base = await getGitHubCheckpoint(path);
          if (action !== "hard-push" && !isSensitiveGitHubBackupPath(path) && (!base || await hashBlob(base) !== previousHashes[path])) {
            // A device without a checkpoint cannot prove that absence means a deliberate deletion.
            nextHashes[path] = previousHashes[path];
            continue;
          }
          try {
            let removed = false;
            for (let attempt = 0; attempt < 5 && !removed; attempt += 1) {
              let remote: { sha?: string };
              let remoteBlob: Blob;
              try {
                remote = await requestGitHubFile("GET", username, config, [rootPath, path].filter(Boolean).join("/")) as { sha?: string };
                remoteBlob = await requestGitHubFile("GET", username, config, [rootPath, path].filter(Boolean).join("/"), undefined, true) as Blob;
              } catch (error) { if ((error as Error & { status?: number }).status === 404) { removed = true; break; } throw error; }
              if (action !== "hard-push" && !isSensitiveGitHubBackupPath(path) && (!base || await hashBlob(remoteBlob) !== await hashBlob(base))) {
                autoResolvedCount += 1;
                await saveGitHubRecoveryCopy(path, base, undefined, remoteBlob, "Push deleted this remote-only file; its contents were saved locally for recovery.");
                reportGitHubProgress(`Auto-resolved deletion · saved remote copy for recovery · ${path}`);
              }
              try {
                await assertRemoteLock();
                if (remote.sha) await requestGitHubFile("DELETE", username, config, [rootPath, path].filter(Boolean).join("/"), { message: `Remove deleted Alleviate data: ${path}`, sha: remote.sha });
                removed = true;
              } catch (error) {
                const status = (error as Error & { status?: number }).status;
                if (action !== "hard-push" || (status !== 409 && status !== 422) || attempt === 4) throw error;
                await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt) + Math.random() * 100));
              }
            }
            if (!removed) throw new Error(`Could not remove ${path} during hard push because GitHub kept changing it. Run Hard push again when no other sync is writing to this backup.`);
            if (!(path in nextHashes)) {
              delete nextHashes[path];
              await saveGitHubCheckpoint(path);
              reportGitHubProgress(`Removed stale backup file · ${path}`);
            }
          } catch (error) { if ((error as Error & { status?: number }).status !== 404) throw error; }
        }
        deleted = Array.from(new Set([...(previousManifest?.deleted || []), ...pathsToRemove])).filter((path) => !(path in nextHashes)).sort();
        const hashesChanged = JSON.stringify(Object.entries(previousHashes).sort(([a], [b]) => a.localeCompare(b))) !== JSON.stringify(Object.entries(nextHashes).sort(([a], [b]) => a.localeCompare(b)));
        const deletedChanged = JSON.stringify([...(previousManifest?.deleted || [])].sort()) !== JSON.stringify([...deleted].sort());
        const manifestChanged = !previousManifest || hashesChanged || deletedChanged;
        if (!previousManifest || manifestChanged || action === "hard-push") {
          reportGitHubProgress("Publishing the backup manifest…");
          let published = false;
          for (let attempt = 0; attempt < 5 && !published; attempt += 1) {
            let latest: GitHubBackupManifest | null = null;
            let manifestFileSha: string | undefined;
            try {
              const remote = await requestGitHubManifest(username, config, manifestPath);
              latest = remote.manifest;
              manifestFileSha = remote.sha;
            } catch (error) { if ((error as Error & { status?: number }).status !== 404) throw error; }
            if (latest && !isValidBackupManifest(latest)) throw new Error("The remote manifest changed to an unsafe or unsupported format during sync.");
            const latestHashes = latest?.files || {};
            const combinedHashes = action === "hard-push" ? { ...nextHashes } : { ...latestHashes, ...nextHashes };
            for (const path of deleted) delete combinedHashes[path];
            const combinedDeleted = Array.from(new Set([...(latest?.deleted || []), ...deleted])).filter((path) => !(path in combinedHashes)).sort();
            const manifest: GitHubBackupManifest = { format: "alleviate-github-backup", version: 1, updatedAt: new Date().toISOString(), files: combinedHashes, deleted: combinedDeleted };
            const payload: Record<string, unknown> = { message: "Alleviate backup manifest", content: await encodeBlobBase64(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" })) };
            if (manifestFileSha) payload.sha = manifestFileSha;
            try {
              await assertRemoteLock();
              await requestGitHubFile("PUT", username, config, manifestPath, payload);
              const verified = (await requestGitHubManifest(username, config, manifestPath)).manifest;
              if (verified.format !== "alleviate-github-backup" || verified.version !== 1) throw new Error("GitHub returned an invalid manifest after the write.");
              pushed += 1;
              published = true;
            } catch (error) {
              const status = (error as Error & { status?: number }).status;
              if ((status === 409 || status === 422 || status === undefined || status >= 500) && attempt < 4) {
                await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt) + Math.random() * 100));
                continue;
              }
              throw error;
            }
          }
          if (!published) throw new Error("Could not publish the latest sync manifest. Your local files remain saved and can be synced again.");
        }
        const pushSummary = `Uploaded ${fileUploaded} · Unchanged ${fileSkipped} · Removed ${deleted.length} · Auto-resolved ${autoResolvedCount}`;
        setGitHubProgress((current) => current ? { ...current, status: "success", title: action === "hard-push" ? "GitHub Hard Push Complete" : "GitHub Push Complete", processed: current.total, uploaded: fileUploaded, skipped: fileSkipped, logs: [...current.logs, pushSummary].slice(-8) } : current);
        if (!options.silent) await dialogs.alert({ title: action === "hard-push" ? "Hard push complete" : "GitHub sync complete", message: `Uploaded ${pushed} changed files${deleted.length ? ` and removed ${deleted.length} deleted files` : ""}. Automatically resolved ${autoResolvedCount} conflict(s); recovery copies were saved on this device. Unchanged files were skipped.` });
      }
      const syncedAt = Date.now();
      await saveGitHubLastSyncAt(syncedAt);
      setGitHubLastSyncAt(syncedAt);
      try { localStorage.removeItem(githubAutoSyncPauseKey); } catch { /* Keep sync usable if storage is unavailable. */ }
      setGitHubError("");
      setGitHubNeedsSettings(false);
      setGitHubConflicts(await listGitHubConflicts());
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete the GitHub action.";
      const settingsError = /bad credentials|requires authentication|invalid.{0,20}(token|credential)|expired.{0,20}token|manifest|backup folder/i.test(message)
        || (error as Error & { status?: number }).status === 401;
      setGitHubError(message);
      setGitHubProgress((current) => current ? { ...current, status: "error", title: action === "pull" ? "GitHub Pull Failed" : "GitHub Push Failed", logs: [...current.logs, message].slice(-8) } : current);
      if (settingsError) setGitHubNeedsSettings(true);
      if (!options.silent) {
        if (settingsError) {
          const openSettings = await dialogs.confirm({ title: "GitHub sync failed", message, confirmLabel: "Open settings" });
          if (openSettings) await openGitHubSettings();
        } else await dialogs.alert({ title: "GitHub sync failed", message });
      }
      return false;
    } finally {
      await releaseRemoteSyncLock?.();
      setGitHubBusy(null);
      githubActionInFlightRef.current = false;
      releaseCrossTabLock?.();
      await crossTabLockTask;
    }
  };

  useEffect(() => {
    if (!githubSyncReady || !githubLinked) return;
    try { if (localStorage.getItem(githubAutoSyncPauseKey)) return; } catch { /* Continue with this session's auto-sync schedule. */ }
    let active = true;
    let checking = false;
    let timer: number | undefined;
    const schedule = (delay: number) => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void checkAndSync(), delay);
    };
    const checkAndSync = async () => {
      if (!active || checking) return;
      try { if (localStorage.getItem(githubAutoSyncPauseKey)) return; } catch { /* Continue with this session's auto-sync schedule. */ }
      checking = true;
      if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; }
      try {
        const lastSync = await getGitHubLastSyncAt();
        if (!active) return;
        setGitHubLastSyncAt(lastSync);
        const delayUntilDue = lastSync ? lastSync + 24 * 60 * 60 * 1000 - Date.now() : 0;
        if (delayUntilDue > 0) { schedule(delayUntilDue); return; }
        if (document.visibilityState !== "visible" || !navigator.onLine || githubAutoSyncInFlightRef.current || githubActionInFlightRef.current) {
          schedule(60 * 1000);
          return;
        }
        githubAutoSyncInFlightRef.current = true;
        const succeeded = await runGitHubAction("push", { silent: true });
        githubAutoSyncInFlightRef.current = false;
        if (!active) return;
        if (succeeded) schedule(24 * 60 * 60 * 1000);
        else {
          // A persistent remote race should not trigger a push every few minutes
          // in every open window. Leave recovery to an explicit user retry.
          try { localStorage.setItem(githubAutoSyncPauseKey, new Date().toISOString()); } catch { /* The in-memory guard below still applies until reload. */ }
        }
      } finally {
        githubAutoSyncInFlightRef.current = false;
        checking = false;
      }
    };
    const onReturn = () => { if (document.visibilityState === "visible") void checkAndSync(); };
    void checkAndSync();
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("online", onReturn);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("online", onReturn);
    };
  }, [githubSyncReady, githubLinked, githubSyncScopeKey, githubLastSyncAt]);

  const exportBackup = async () => {
    setSettingsOpen(false);
    setBackupBusy("export");
    try {
      const blob = await createAppBackup();
      downloadAppBackup(blob);
    } catch (error) {
      await dialogs.alert({ title: "Export failed", message: error instanceof Error ? error.message : "Alleviate could not export its data." });
    } finally { setBackupBusy(null); }
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    setSettingsOpen(false);
    setBackupBusy("import");
    try {
      const backup = await parseAppBackup(file);
      const databaseRows = backup.manifest.databases.reduce((sum, database) => sum + database.stores.reduce((storeSum, store) => storeSum + store.recordCount, 0), 0);
      const confirmed = await dialogs.confirm({
        title: "Restore Alleviate backup?",
        message: `This backup contains ${Object.keys(backup.localStorage).length} app data entries and ${databaseRows} saved files. Restoring it replaces the data on this device. Continue?`,
        confirmLabel: "Restore backup",
        destructive: true,
      });
      if (!confirmed) return;
      const restored = await restoreAppBackup(backup);
      await dialogs.alert({ title: "Backup restored", message: `Restored ${restored.localStorageKeys} app data entries and ${restored.records} saved files. Alleviate will reload to show the restored data.` });
      window.location.reload();
    } catch (error) {
      await dialogs.alert({ title: "Import failed", message: error instanceof Error ? error.message : "Alleviate could not import this backup." });
    } finally {
      setBackupBusy(null);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const chooseAutoBackupFolder = async () => {
    const picker = (window as any).alleviateDesktop?.backup?.browseDirectory;
    if (!picker) return;
    try {
      const result = await picker({ title: "Choose automatic backup folder", defaultPath: autoBackup.directoryPath });
      if (result?.success && result.directoryPath) setAutoBackup((current) => ({ ...current, directoryPath: result.directoryPath }));
    } catch (error) {
      await dialogs.alert({ title: "Folder picker failed", message: error instanceof Error ? error.message : "Could not choose a backup folder." });
    }
  };

  const openAutoBackupFolder = async () => {
    const opener = (window as any).alleviateDesktop?.backup?.openFolder;
    if (!opener || !autoBackup.directoryPath) return;
    const result = await opener({ path: autoBackup.directoryPath });
    if (!result?.success) await dialogs.alert({ title: "Could not open folder", message: result?.error || "The backup folder could not be opened." });
  };

  return <aside className="home-sidebar" aria-label="Main navigation">
    <nav className="home-sidebar-nav">{items.map(({ id, href, label, Icon }) => <Link key={id} className={`sidebar-link ${active === id ? "is-active" : ""}`} href={href} aria-label={label} title={label} aria-current={active === id ? "page" : undefined}><Icon size={19} /></Link>)}</nav>
    <div className="sidebar-bottom-actions">
      <div className="sidebar-settings-wrap" ref={githubMenuRef}>
        <button type="button" className={`sidebar-link sidebar-settings-button ${githubMenuOpen ? "is-active" : ""}`} aria-label="GitHub sync" title="GitHub sync" aria-haspopup="menu" aria-expanded={githubMenuOpen} disabled={Boolean(githubBusy)} onClick={() => setGitHubMenuOpen((open) => !open)}>
          <Github size={19} aria-hidden="true"/>
        </button>
        {githubMenuOpen && <div className="sidebar-github-menu" role="menu" aria-label="GitHub sync actions">
          <div className="sidebar-settings-menu-title">GitHub sync</div>
          <button type="button" role="menuitem" disabled={Boolean(githubBusy)} onClick={() => void runGitHubAction("pull")}><GitPullRequest size={15}/><span>Pull backup</span></button>
          <button type="button" role="menuitem" disabled={Boolean(githubBusy)} onClick={() => void runGitHubAction("push")}><UploadCloud size={15}/><span>Push backup</span></button>
          <button type="button" role="menuitem" disabled={Boolean(githubBusy)} onClick={() => void runGitHubAction("hard-push")}><Upload size={15}/><span>Hard push</span></button>
        </div>}
      </div>
      {githubLinked && <button type="button" className={`sidebar-link sidebar-settings-button sidebar-sync-now ${githubBusy ? "is-active" : ""}`} aria-label={githubBusy ? "GitHub sync in progress" : "Sync GitHub now"} title={githubError ? `Sync issue: ${githubError}` : `Sync now · automatic every 24 hours${githubLastSyncAt ? ` · Last synced ${new Date(githubLastSyncAt).toLocaleString()}` : " · First sync is due"}`} disabled={Boolean(githubBusy)} onClick={() => void runGitHubAction("push", { silent: true })}>
        {githubBusy ? <LoaderCircle size={18} className="sidebar-backup-spinner" aria-hidden="true"/> : <RefreshCw size={18} aria-hidden="true"/>}
      </button>}
      <div className="sidebar-settings-wrap" ref={settingsRef}>
        <button type="button" className={`sidebar-link sidebar-settings-button ${settingsOpen ? "is-active" : ""}`} aria-label="Import and export data" title="Import / Export" aria-haspopup="menu" aria-expanded={settingsOpen} disabled={Boolean(backupBusy)} onClick={() => setSettingsOpen((open) => !open)}>
          {backupBusy ? <LoaderCircle size={18} className="sidebar-backup-spinner" /> : <ArrowDownUp size={19} aria-hidden="true" />}
        </button>
        {settingsOpen && <div className="sidebar-settings-menu" role="menu" aria-label="Import and export data">
          <div className="sidebar-settings-menu-title">Backup</div>
          <button type="button" role="menuitem" disabled={Boolean(backupBusy)} onClick={() => void exportBackup()}><Download size={15} /><span>Export data</span></button>
          <button type="button" role="menuitem" disabled={Boolean(backupBusy)} onClick={() => importInputRef.current?.click()}><Upload size={15} /><span>Import data</span></button>
          <button type="button" role="menuitem" onClick={() => { setSettingsOpen(false); setAutoBackupOpen(true); }}><Settings2 size={15} /><span>Automatic backup settings</span></button>
        </div>}
      </div>
      {githubSyncReady && (!githubLinked || githubNeedsSettings) && <button type="button" className={`sidebar-link sidebar-settings-button ${githubNeedsSettings ? "github-settings-needs-attention" : ""}`} aria-label="GitHub settings" title={githubNeedsSettings ? "GitHub settings need attention · Open settings" : "GitHub settings"} onClick={() => void openGitHubSettings()}><Settings2 size={19}/></button>}
      <input ref={importInputRef} hidden type="file" accept=".zip,application/zip" onChange={(event) => void importBackup(event.target.files?.[0])} />
      <button type="button" className="sidebar-avatar" aria-label="Open profile" title="Profile" onClick={() => setProfileOpen(true)}>A</button>
    </div>
    {profileOpen && <div className="auto-backup-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
      <form className="auto-backup-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title" onSubmit={saveProfile}>
        <header><div><span className="auto-backup-kicker">YOUR PROFILE</span><h2 id="profile-dialog-title">Profile</h2></div><button type="button" className="auto-backup-close" aria-label="Close profile" onClick={() => setProfileOpen(false)}><X size={18}/></button></header>
        <p className="auto-backup-description">Add your birthday to your profile.</p>
        <label className="profile-birthday-field"><span>Birthdate</span><input type="date" value={profileBirthDate} max={todayDateValue()} onChange={(event) => setProfileBirthDate(event.target.value)}/></label>
        <footer><button type="button" className="countdown-cancel" onClick={() => setProfileOpen(false)}>Cancel</button><button type="submit" className="auto-backup-primary">Save birthday</button></footer>
      </form>
    </div>}
    {autoBackupOpen && <div className="auto-backup-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) setAutoBackupOpen(false); }}>
      <section className="auto-backup-dialog" role="dialog" aria-modal="true" aria-labelledby="auto-backup-title">
        <header><div><span className="auto-backup-kicker">DATA SAFETY</span><h2 id="auto-backup-title">Automatic backup</h2></div><button type="button" className="auto-backup-close" aria-label="Close automatic backup settings" onClick={() => setAutoBackupOpen(false)}><X size={18}/></button></header>
        {isDesktop ? <>
          <p className="auto-backup-description">Save a backup to a folder on your computer once a week. If Alleviate is closed on Monday, it catches up the next time you open the app. The three newest backups are kept.</p>
          <div className="auto-backup-folder"><div className="auto-backup-folder-label"><FolderOpen size={16}/><span>Backup folder</span></div><div className="auto-backup-folder-path">{autoBackup.directoryPath || "Choose a folder to enable automatic backups"}</div><div className="auto-backup-actions"><button type="button" className="auto-backup-secondary" onClick={() => void chooseAutoBackupFolder()}>{autoBackup.directoryPath ? "Change folder" : "Choose folder"}</button>{autoBackup.directoryPath && <button type="button" className="auto-backup-icon-button" title="Open backup folder" aria-label="Open backup folder" onClick={() => void openAutoBackupFolder()}><ExternalLink size={15}/></button>}</div></div>
          <div className="auto-backup-status">{autoBackup.directoryPath ? <><Check size={15}/><span>Weekly backup is enabled</span></> : <><span className="auto-backup-status-dot"/><span>Choose a folder to enable</span></>}</div>
          <div className="auto-backup-last"><span>Last backup</span><strong>{autoBackup.lastRunAt ? new Date(autoBackup.lastRunAt).toLocaleString() : "Not yet created"}</strong>{autoBackup.lastFilePath && <small title={autoBackup.lastFilePath}>{autoBackup.lastFilePath}</small>}</div>
          <footer>{autoBackup.directoryPath && <button type="button" className="auto-backup-disable" onClick={() => { setAutoBackup({ ...emptyAutoBackup }); autoBackupRunRef.current = null; }}>Turn off automatic backup</button>}<button type="button" className="auto-backup-primary" disabled={!autoBackup.directoryPath || Boolean(backupBusy)} onClick={() => void runAutoBackup()}>{backupBusy === "auto" ? <><LoaderCircle size={14} className="sidebar-backup-spinner"/> Saving…</> : "Back up now"}</button></footer>
        </> : <>
          <p className="auto-backup-description">Automatic folder backups run in the Alleviate desktop app. Export a backup manually here, or open this settings panel in the desktop app to choose a folder and enable weekly backups.</p>
          <div className="auto-backup-status auto-backup-status-muted"><span className="auto-backup-status-dot"/><span>Desktop app required for automatic backups</span></div>
          <footer><button type="button" className="auto-backup-primary" onClick={() => setAutoBackupOpen(false)}>Done</button></footer>
        </>}
      </section>
    </div>}
    {githubSettingsOpen && <div className="github-settings-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) setGitHubSettingsOpen(false); }}>
      <form className="github-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="github-settings-title" onSubmit={(event) => void saveGitHubSettings(event)}>
        <header><div><span className="auto-backup-kicker">REPOSITORY SYNC</span><h2 id="github-settings-title">GitHub settings</h2></div><button type="button" className="auto-backup-close" aria-label="Close GitHub settings" onClick={() => setGitHubSettingsOpen(false)}><X size={18}/></button></header>
        <p className="auto-backup-description">Connect a GitHub repository to store and restore Alleviate backups.</p>
        {githubSettingsBusy ? <p className="github-settings-loading">Loading GitHub settings…</p> : <>
          <label className="github-settings-field"><span>Personal access token</span><input type="password" autoComplete="off" value={githubSettings.githubToken} onChange={(event) => setGitHubSettings((current) => ({ ...current, githubToken: event.target.value }))} placeholder="ghp_…"/></label>
          <div className="github-settings-grid"><label className="github-settings-field"><span>Repository owner</span><input value={githubSettings.githubOwner} onChange={(event) => setGitHubSettings((current) => ({ ...current, githubOwner: event.target.value }))} placeholder="your-username"/></label><label className="github-settings-field"><span>Repository name</span><input value={githubSettings.githubRepo} onChange={(event) => setGitHubSettings((current) => ({ ...current, githubRepo: event.target.value }))} placeholder="my-backups"/></label></div>
          <label className="github-settings-field"><span>Backup folder <small>(optional)</small></span><input value={githubSettings.githubPath} onChange={(event) => setGitHubSettings((current) => ({ ...current, githubPath: event.target.value }))} placeholder="AlleviateBackups"/></label>
          <p className="github-settings-note">Alleviate stores a manifest and separate canvas, image, mind map, and app data files. Push uploads changed files only. Use a token with Contents read and write access.</p>
          {githubConflicts.length > 0 && <section className="github-sync-conflicts" aria-label="Unresolved GitHub sync conflicts"><strong>{githubConflicts.length} sync conflict{githubConflicts.length === 1 ? "" : "s"} need review</strong>{githubConflicts.map((conflict) => <article key={conflict.path}><b title={conflict.path}>{conflict.path}</b><p>{conflict.message}</p><div><button type="button" onClick={() => void resolveGitHubConflict(conflict.path, "local")} disabled={!conflict.local}>Keep this device</button><button type="button" onClick={() => void resolveGitHubConflict(conflict.path, "remote")}>Use GitHub</button></div></article>)}</section>}
        </>}
        {githubError && <p className="github-settings-error" role="alert">{githubError}</p>}
        <footer><button type="button" className="countdown-cancel" onClick={() => setGitHubSettingsOpen(false)}>Cancel</button><button type="submit" className="auto-backup-primary" disabled={githubSettingsBusy}>{githubSettingsBusy ? "Loading…" : "Save settings"}</button></footer>
      </form>
    </div>}
    {githubProgress && <section className={`github-sync-progress is-${githubProgress.status}`} role="status" aria-live="polite" aria-label="GitHub sync progress">
      <header><div className="github-sync-progress-heading"><span className={`github-sync-progress-indicator ${githubProgress.status === "running" ? "is-spinning" : ""}`}>{githubProgress.status === "running" ? <LoaderCircle size={16}/> : githubProgress.status === "success" ? <Check size={16}/> : githubProgress.status === "cancelled" ? <X size={16}/> : <X size={16}/>}</span><div><strong>{githubProgress.title}</strong><small>{githubProgress.mode === "push" ? "GitHub push status" : "GitHub pull status"} · {githubProgress.status}</small></div></div><button type="button" aria-label="Close GitHub sync progress" onClick={() => setGitHubProgress(null)}><X size={16}/></button></header>
      <div className="github-sync-progress-track"><span className={githubProgress.status === "running" && !githubProgress.total ? "is-indeterminate" : ""} style={{ width: githubProgress.total ? `${Math.min(100, Math.round(githubProgress.processed / githubProgress.total * 100))}%` : undefined }}/></div>
      <div className="github-sync-progress-counts"><span>{githubProgress.total ? `${Math.min(githubProgress.processed, githubProgress.total)} / ${githubProgress.total} checked` : githubProgress.status === "running" ? "Working…" : "Finished"}</span><span>{githubProgress.uploaded} pushed · {githubProgress.skipped} unchanged</span></div>
      <ul>{githubProgress.logs.slice(-6).map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}</ul>
    </section>}
  </aside>;
}


