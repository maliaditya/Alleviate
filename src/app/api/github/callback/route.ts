import { NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/serverSession";
import { isGitHubSettingsDbConfigured, upsertGitHubSettings } from "@/lib/githubSettingsServer";

export const dynamic = "force-dynamic";
const githubHeaders = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Alleviate" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("alleviate_github_oauth_state="))?.split("=").slice(1).join("=");
  const stateValue = cookie ? decodeURIComponent(cookie) : "";
  const [stateUser, expectedState] = stateValue.split(":");
  const sessionUser = getSessionUserFromRequest(request);
  const returnTo = new URL("/", request.url);
  if (!code || !state || !expectedState || state !== expectedState || !sessionUser || sessionUser !== stateUser) {
    returnTo.searchParams.set("github", "authorization-failed");
    const response = NextResponse.redirect(returnTo); response.cookies.delete("alleviate_github_oauth_state"); return response;
  }
  const clientId = process.env.GITHUB_APP_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !isGitHubSettingsDbConfigured()) {
    returnTo.searchParams.set("github", "server-not-configured");
    const response = NextResponse.redirect(returnTo); response.cookies.delete("alleviate_github_oauth_state"); return response;
  }
  try {
    const exchange = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", headers: { ...githubHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }), cache: "no-store",
    });
    const tokens = await exchange.json() as { access_token?: string; error?: string };
    if (!exchange.ok || !tokens.access_token) throw new Error(tokens.error || "GitHub authorization failed.");
    const token = tokens.access_token;
    const create = await fetch("https://api.github.com/user/repos", {
      method: "POST", headers: { ...githubHeaders, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alleviate-Backup", description: "Private backup repository for Alleviate", private: true, auto_init: true }), cache: "no-store",
    });
    let repo: { name?: string; owner?: { login?: string }; message?: string };
    if (create.status === 422) {
      const who = await fetch("https://api.github.com/user", { headers: { ...githubHeaders, Authorization: `Bearer ${token}` }, cache: "no-store" });
      const user = await who.json() as { login?: string };
      const existing = await fetch(`https://api.github.com/repos/${encodeURIComponent(user.login || "")}/Alleviate-Backup`, { headers: { ...githubHeaders, Authorization: `Bearer ${token}` }, cache: "no-store" });
      repo = await existing.json() as typeof repo;
      if (!existing.ok) throw new Error("Could not create or access the Alleviate-Backup repository.");
    } else {
      repo = await create.json() as typeof repo;
      if (!create.ok) throw new Error(repo.message || "GitHub could not create the backup repository.");
    }
    if (!repo.owner?.login || !repo.name) throw new Error("GitHub returned incomplete repository details.");
    await upsertGitHubSettings({ username: sessionUser, githubToken: token, githubOwner: repo.owner.login, githubRepo: repo.name, githubPath: "" });
    returnTo.searchParams.set("github", "connected");
  } catch (error) {
    console.error("GitHub OAuth callback failed:", error);
    returnTo.searchParams.set("github", "connection-failed");
  }
  const response = NextResponse.redirect(returnTo);
  response.cookies.delete("alleviate_github_oauth_state");
  return response;
}
