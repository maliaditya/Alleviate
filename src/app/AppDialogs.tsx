"use client";

import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type PromptOptions = { title: string; message?: string; defaultValue?: string; placeholder?: string; confirmLabel?: string };
type ConfirmOptions = { title: string; message: string; confirmLabel?: string; destructive?: boolean };
type AlertOptions = { title: string; message: string; confirmLabel?: string };
type DialogRequest =
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void }
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "alert"; options: AlertOptions; resolve: () => void };

type DialogApi = {
  prompt: (options: PromptOptions) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useAppDialogs() {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useAppDialogs must be used inside AppDialogsProvider.");
  return value;
}

export function AppDialogsProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const prompt = useCallback((options: PromptOptions) => new Promise<string | null>((resolve) => {
    setDialog({ kind: "prompt", options, resolve });
  }), []);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setDialog({ kind: "confirm", options, resolve });
  }), []);
  const alert = useCallback((options: AlertOptions) => new Promise<void>((resolve) => {
    setDialog({ kind: "alert", options, resolve });
  }), []);
  const api = useMemo(() => ({ prompt, confirm, alert }), [alert, confirm, prompt]);

  const finish = useCallback((value?: string | boolean | null) => {
    if (!dialog) return;
    if (dialog.kind === "prompt") dialog.resolve(typeof value === "string" ? value : null);
    else if (dialog.kind === "confirm") dialog.resolve(value === true);
    else dialog.resolve();
    setDialog(null);
  }, [dialog]);

  useEffect(() => {
    if (!dialog) {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
      return;
    }
    if (!previousFocusRef.current) previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      } else if (event.key === "Tab") {
        const focusable = document.querySelector<HTMLElement>(".app-dialog")?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    if (dialog.kind === "prompt") inputRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [dialog, finish]);

  useEffect(() => {
    const onEmbeddedPrompt = (event: MessageEvent) => {
      const request = event.data;
      if (event.origin !== window.location.origin || request?.type !== "alleviate-dialog-prompt" || typeof request.requestId !== "string") return;
      void prompt({ title: "Add link", message: typeof request.message === "string" ? request.message : "Enter a value" }).then((value) => {
        (event.source as Window | null)?.postMessage({ type: "alleviate-dialog-response", requestId: request.requestId, value }, event.origin);
      });
    };
    window.addEventListener("message", onEmbeddedPrompt);
    return () => window.removeEventListener("message", onEmbeddedPrompt);
  }, [prompt]);

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind === "prompt") finish(inputRef.current?.value ?? "");
  };

  const options = dialog?.options;
  return <DialogContext.Provider value={api}>
    {children}
    {dialog && options && <div className="app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(null); }}>
      <section className="app-dialog" role={dialog.kind === "prompt" ? "dialog" : "alertdialog"} aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby={options.message ? "app-dialog-message" : undefined}>
        <header className="app-dialog-header"><h2 id="app-dialog-title">{options.title}</h2><button type="button" aria-label="Close dialog" className="app-dialog-close" onClick={() => finish(null)}>×</button></header>
        {options.message && <p id="app-dialog-message" className="app-dialog-message">{options.message}</p>}
        {dialog.kind === "prompt" ? <form onSubmit={submitPrompt}>
          <input ref={inputRef} className="app-dialog-input" defaultValue={dialog.options.defaultValue ?? ""} placeholder={dialog.options.placeholder} aria-label={dialog.options.title} />
          <footer className="app-dialog-actions"><button type="button" className="app-dialog-button" onClick={() => finish(null)}>Cancel</button><button type="submit" className="app-dialog-button is-primary">{dialog.options.confirmLabel ?? "Save"}</button></footer>
        </form> : <footer className="app-dialog-actions">
          {dialog.kind === "confirm" && <button type="button" className="app-dialog-button" onClick={() => finish(false)}>Cancel</button>}
          <button type="button" autoFocus className={`app-dialog-button is-primary ${dialog.kind === "confirm" && dialog.options.destructive ? "is-destructive" : ""}`} onClick={() => finish(dialog.kind === "confirm")}>{options.confirmLabel ?? (dialog.kind === "confirm" ? "Continue" : "OK")}</button>
        </footer>}
      </section>
    </div>}
  </DialogContext.Provider>;
}
