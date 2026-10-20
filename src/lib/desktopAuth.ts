type AuthPayload = {
  success?: boolean;
  user?: { username?: string; email?: string | null };
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  [key: string]: unknown;
};

type AuthRequestResult = { ok: boolean; status: number; data: AuthPayload | null };

type DesktopAuthBridge = {
  isDesktop?: boolean;
  authBaseUrl?: string;
  authHttp?: {
    request: (payload: { url: string; method: string; headers: Record<string, string>; body: string }) => Promise<{
      success: boolean;
      ok?: boolean;
      status?: number;
      data?: AuthPayload | null;
      error?: string;
    }>;
  };
  authTokenStore?: {
    set: (username: string, refreshToken: string) => Promise<{ success: boolean; error?: string }>;
    get: (username: string) => Promise<{ success: boolean; token?: string | null; error?: string }>;
    clear: (username: string) => Promise<{ success: boolean; error?: string }>;
  };
};

const desktopBridge = (): DesktopAuthBridge | undefined =>
  typeof window === "undefined" ? undefined : (window as Window & { alleviateDesktop?: DesktopAuthBridge }).alleviateDesktop;

export async function requestAuthJson(path: string, payload: Record<string, unknown>): Promise<AuthRequestResult> {
  const bridge = desktopBridge();
  const body = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json" };

  if (bridge?.isDesktop) {
    const baseUrl = bridge.authBaseUrl?.trim();
    if (!baseUrl || !bridge.authHttp?.request) throw new Error("Desktop authentication service is unavailable.");
    const response = await bridge.authHttp.request({
      url: new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString(),
      method: "POST",
      headers,
      body,
    });
    if (!response.success) throw new Error(response.error || "Unable to reach the authentication service.");
    return { ok: Boolean(response.ok), status: Number(response.status || 0), data: response.data || null };
  }

  const response = await fetch(path, { method: "POST", headers, body, credentials: "include" });
  const data = (await response.json().catch(() => null)) as AuthPayload | null;
  return { ok: response.ok, status: response.status, data };
}

export async function storeDesktopAuthTokens(username: string, payload: AuthPayload) {
  const bridge = desktopBridge();
  if (!bridge?.isDesktop) return;
  const normalizedUsername = username.trim().toLowerCase();
  if (payload.accessToken) localStorage.setItem(`alleviate_access_token:${normalizedUsername}`, payload.accessToken);
  if (payload.refreshToken && bridge.authTokenStore?.set) {
    const result = await bridge.authTokenStore.set(normalizedUsername, payload.refreshToken);
    if (!result.success) throw new Error(result.error || "Could not securely save the sign-in session.");
  }
}

export async function signOutAuth(username?: string) {
  const bridge = desktopBridge();
  const normalizedUsername = String(username || "").trim().toLowerCase();
  let refreshToken: string | null = null;
  if (bridge?.isDesktop && normalizedUsername && bridge.authTokenStore?.get) {
    const result = await bridge.authTokenStore.get(normalizedUsername);
    refreshToken = result.success ? result.token || null : null;
  }

  try {
    await requestAuthJson("/api/auth/logout", { ...(refreshToken ? { refreshToken } : {}) });
  } catch {
    // Signing out locally should work even when the auth server is unreachable.
  }
  if (normalizedUsername) localStorage.removeItem(`alleviate_access_token:${normalizedUsername}`);
  if (bridge?.isDesktop && normalizedUsername && bridge.authTokenStore?.clear) {
    await bridge.authTokenStore.clear(normalizedUsername).catch(() => undefined);
  }
}
