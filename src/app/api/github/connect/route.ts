import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/serverSession";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const username = getSessionUserFromRequest(request);
  const clientId = process.env.GITHUB_APP_CLIENT_ID?.trim();
  if (!username) return NextResponse.redirect(new URL("/?github=sign-in-required", request.url));
  if (!clientId) return NextResponse.redirect(new URL("/?github=not-configured", request.url));
  const state = randomBytes(32).toString("hex");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${new URL(request.url).origin}/api/github/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "true");
  const response = NextResponse.redirect(url);
  response.cookies.set("alleviate_github_oauth_state", `${username}:${state}`, {
    httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/api/github/callback", maxAge: 600,
  });
  return response;
}
