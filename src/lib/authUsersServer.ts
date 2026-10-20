import { createClient } from '@supabase/supabase-js';
import type { PasswordRecord } from '@/lib/password';

const table = 'auth_users';
const config = () => ({ url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '', key: process.env.SUPABASE_SERVICE_ROLE_KEY || '' });
export const isAuthDbConfigured = () => Boolean(config().url.trim() && config().key.trim());
const client = () => {
  const { url, key } = config();
  if (!url || !key) throw new Error('Supabase server credentials are missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};
export type AuthUserRecord = { username: string; email: string | null; passwordHash: string; passwordSalt: string; passwordAlgo: string };
const normalize = (v: unknown) => String(v || '').trim().toLowerCase();
const toRecord = (row: any): AuthUserRecord => ({ username: normalize(row.username), email: row.email || null, passwordHash: row.password_hash, passwordSalt: row.password_salt, passwordAlgo: row.password_algo });
export async function readAuthUserByUsernameOrEmail(username: string, email: string): Promise<AuthUserRecord | null> {
  const db = client();
  const value = normalize(username || email);
  const field = email ? 'email' : 'username';
  const { data, error } = await db.from(table).select('username,email,password_hash,password_salt,password_algo').eq(field, value).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRecord(data) : null;
}
export async function createAuthUser(payload: { username: string; email: string; password: PasswordRecord; createdAt?: string }) {
  const now = new Date().toISOString();
  const { error } = await client().from(table).insert({
    username: normalize(payload.username), email: normalize(payload.email), is_priviledge: false,
    password_hash: payload.password.passwordHash, password_salt: payload.password.passwordSalt,
    password_algo: payload.password.passwordAlgo, created_at: payload.createdAt || now, updated_at: now, migrated_from_storage_at: null,
  });
  if (error) throw new Error(error.message);
}
