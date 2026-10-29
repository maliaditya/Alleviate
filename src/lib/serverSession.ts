import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/authTokens';

export const SESSION_COOKIE_NAME = 'lifeos_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

type SessionPayload = {
  u: string;
  iat: number;
};

const getSessionSecret = () => {
  // Prefer dedicated session secret; fallback keeps dev usable.
  return process.env.LIFEOS_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'lifeos-dev-session-secret';
};

const toBase64Url = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const fromBase64Url = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const sign = (encodedPayload: string) =>
  createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url');

const normalizeUsername = (username: string) => username.trim().toLowerCase();
const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const shouldUseSecureCookie = (request?: Request) => {
  if (!request) return process.env.NODE_ENV === 'production';
  try {
    const url = new URL(request.url);
    if (url.protocol === 'https:') return true;
    if (isLocalHostname(url.hostname)) return false;
    return process.env.NODE_ENV === 'production';
  } catch {
    return process.env.NODE_ENV === 'production';
  }
};

export const createSessionValue = (username: string) => {
  const payload: SessionPayload = {
    u: normalizeUsername(username),
    iat: Date.now(),
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
};

const parseCookieHeader = (cookieHeader: string) => {
  const parts = cookieHeader.split(';');
  const matches: string[] = [];
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (!rawName) continue;
    const name = rawName.trim();
    const value = rest.join('=').trim();
    if (name === SESSION_COOKIE_NAME) matches.push(decodeURIComponent(value));
  }
  return matches;
};

export const getSessionUserFromRequest = (request: Request): string | null => {
  const authorization = request.headers.get('authorization') || '';
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const accessToken = verifyAccessToken(bearerMatch[1].trim());
    if (accessToken?.sub) return normalizeUsername(accessToken.sub);
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const cookieValues = parseCookieHeader(cookieHeader);
  if (!cookieValues.length) return null;

  // Prefer the most recently listed cookie and accept the first valid signature.
  for (let i = cookieValues.length - 1; i >= 0; i -= 1) {
    const cookieValue = cookieValues[i];
    const [encoded, providedSignature] = cookieValue.split('.');
    if (!encoded || !providedSignature) continue;

    const expectedSignature = sign(encoded);
    const provided = Buffer.from(providedSignature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length) continue;
    if (!timingSafeEqual(provided, expected)) continue;

    try {
      const payload = JSON.parse(fromBase64Url(encoded)) as SessionPayload;
      if (!payload?.u || typeof payload.u !== 'string') continue;
      return normalizeUsername(payload.u);
    } catch {
      continue;
    }
  }
  return null;
};

export const attachSessionCookie = (response: NextResponse, username: string, request?: Request) => {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: createSessionValue(username),
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(request),
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
};

export const clearSessionCookie = (response: NextResponse, request?: Request) => {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(request),
    path: '/',
    maxAge: 0,
  });
};

export const isAuthorizedUserRequest = (request: Request, username: string | null | undefined) => {
  if (!username) return false;
  const sessionUser = getSessionUserFromRequest(request);
  if (!sessionUser) return false;
  return sessionUser === normalizeUsername(username);
};
