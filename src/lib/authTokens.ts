import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import { isSupabaseStorageConfigured, readJsonFromStorage, writeJsonToStorage } from "@/lib/supabaseStorageServer";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 45;
const REFRESH_PREFIX = "auth-refresh/";

type AccessPayload = {
  sub: string;
  iat: number;
  exp: number;
  typ: "access";
};

type RefreshRecord = {
  tokenId: string;
  username: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  rotatedTo?: string;
  lastUsedAt?: string;
};

const getTokenSecret = () =>
  process.env.LIFEOS_TOKEN_SECRET || process.env.LIFEOS_SESSION_SECRET || "lifeos-dev-token-secret";

const toBase64Url = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const fromBase64Url = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const sign = (payloadEncoded: string) =>
  createHmac("sha256", getTokenSecret()).update(payloadEncoded).digest("base64url");

const normalizeUsername = (username: string) => username.trim().toLowerCase();

const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

const getRefreshPath = (tokenId: string) => `${REFRESH_PREFIX}${tokenId}.json`;

const assertStorageConfigured = () => {
  if (!isSupabaseStorageConfigured()) {
    throw new Error("Supabase storage is not configured.");
  }
};

export const createAccessToken = (username: string, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS) => {
  const nowMs = Date.now();
  const payload: AccessPayload = {
    sub: normalizeUsername(username),
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor((nowMs + ttlSeconds * 1000) / 1000),
    typ: "access",
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
};

export const verifyAccessToken = (token: string): AccessPayload | null => {
  const [encoded, providedSignature] = token.split(".");
  if (!encoded || !providedSignature) return null;
  const expectedSignature = sign(encoded);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encoded)) as AccessPayload;
    if (payload?.typ !== "access" || !payload?.sub || !payload?.exp) return null;
    if (Date.now() >= payload.exp * 1000) return null;
    return payload;
  } catch {
    return null;
  }
};

const loadRefreshRecord = async (tokenId: string): Promise<RefreshRecord | null> => {
  assertStorageConfigured();
  const pathname = getRefreshPath(tokenId);
  return await readJsonFromStorage<RefreshRecord>(pathname);
};

const saveRefreshRecord = async (record: RefreshRecord): Promise<void> => {
  assertStorageConfigured();
  await writeJsonToStorage(getRefreshPath(record.tokenId), record);
};

export const issueRefreshToken = async (username: string) => {
  assertStorageConfigured();
  const normalized = normalizeUsername(username);
  const tokenId = randomBytes(12).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const refreshToken = `${tokenId}.${secret}`;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const record: RefreshRecord = {
    tokenId,
    username: normalized,
    tokenHash: tokenHash(secret),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  await saveRefreshRecord(record);
  return { refreshToken, tokenId, expiresAt: record.expiresAt };
};

export const verifyRefreshToken = async (refreshToken: string): Promise<RefreshRecord | null> => {
  const [tokenId, secret] = String(refreshToken || "").split(".");
  if (!tokenId || !secret) return null;
  const record = await loadRefreshRecord(tokenId);
  if (!record) return null;
  if (record.revokedAt) return null;
  if (new Date(record.expiresAt).getTime() <= Date.now()) return null;
  if (record.tokenHash !== tokenHash(secret)) return null;
  return record;
};

export const revokeRefreshToken = async (refreshToken: string): Promise<boolean> => {
  const record = await verifyRefreshToken(refreshToken);
  if (!record) return false;
  record.revokedAt = new Date().toISOString();
  await saveRefreshRecord(record);
  return true;
};

export const rotateRefreshToken = async (refreshToken: string) => {
  const record = await verifyRefreshToken(refreshToken);
  if (!record) return null;

  const next = await issueRefreshToken(record.username);
  record.revokedAt = new Date().toISOString();
  record.rotatedTo = next.tokenId;
  record.lastUsedAt = new Date().toISOString();
  await saveRefreshRecord(record);
  return next;
};

export const issueAuthTokens = async (username: string) => {
  const accessToken = createAccessToken(username);
  const refresh = await issueRefreshToken(username);
  return {
    accessToken,
    accessTokenExpiresInSec: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: refresh.refreshToken,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
};
