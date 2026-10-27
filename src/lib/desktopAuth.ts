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
    request: (payload: { url: string; method: string; headers: Record<string, string>; body?: string; responseType?: "binary" }) => Promise<{
      success: boolean;
      ok?: boolean;
      status?: number;
      data?: AuthPayload | null;
      error?: string;
      text?: string;
      base64?: string;
      contentType?: string;
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

export async function requestAppApi(path: string, init: RequestInit = {}, username = "", responseType: "json" | "binary" = "json"): Promise<Response> {
  const bridge = desktopBridge();
  if (!bridge?.isDesktop) return fetch(path, init);
  const baseUrl = bridge.authBaseUrl?.trim();
  if (!baseUrl || !bridge.authHttp?.request) return new Response(JSON.stringify({ error: "The Alleviate cloud service is unavailable." }), { status: 503, headers: { "Content-Type": "application/json" } });

  const normalizedUsername = username.trim().toLowerCase();
  const targetUrl = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const headers = new Headers(init.headers);
  headers.set("x-studio-desktop", "1");
  const method = String(init.method || "GET").toUpperCase();
  const makeRequest = async (accessToken = "") => {
    const requestHeaders: Record<string, string> = {};
    headers.forEach((value, key) => { requestHeaders[key] = value; });
    if (accessToken) requestHeaders.Authorization = `Bearer ${accessToken}`;
    return bridge.authHttp!.request({
      url: targetUrl.toString(),
      method,
      headers: requestHeaders,
      ...(typeof init.body === "string" ? { body: init.body } : {}),
      ...(responseType === "binary" ? { responseType: "binary" as const } : {}),
    });
  };
  const createResponse = (result: Awaited<ReturnType<NonNullable<DesktopAuthBridge["authHttp"]>["request"]>>) => {
    const contentType = result.contentType || (responseType === "binary" ? "application/octet-stream" : "application/json; charset=utf-8");
    if (!result.success) return new Response(JSON.stringify({ error: result.error || "Unable to reach the Alleviate cloud service." }), { status: 502, headers: { "Content-Type": "application/json" } });
    let body: BodyInit | null = result.text || "";
    if (responseType === "binary") {
      const binary = atob(result.base64 || "");
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      body = bytes;
    }
    const status = Number(result.status || 502);
    return new Response(status === 204 || status === 205 || status === 304 ? null : body, { status, headers: { "Content-Type": contentType } });
  };

  let token = normalizedUsername ? localStorage.getItem(`alleviate_access_token:${normalizedUsername}`) || "" : "";
  let result = await makeRequest(token);
  if (result.success && result.status === 401 && normalizedUsername && bridge.authTokenStore?.get) {
    const stored = await bridge.authTokenStore.get(normalizedUsername);
    if (stored.success && stored.token) {
      const refreshUrl = new URL("/api/auth/refresh", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
      const refreshed = await bridge.authHttp.request({ url: refreshUrl.toString(), method: "POST", headers: { "Content-Type": "application/json", "x-studio-desktop": "1" }, body: JSON.stringify({ refreshToken: stored.token }) });
      if (refreshed.success && refreshed.ok && refreshed.data?.accessToken) {
        await storeDesktopAuthTokens(normalizedUsername, refreshed.data);
        token = refreshed.data.accessToken;
        result = await makeRequest(token);
      }
    }
  }
  return createResponse(result);
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
