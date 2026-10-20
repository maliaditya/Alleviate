import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readJsonFromStorage } from '@/lib/supabaseStorageServer';

const GITHUB_SETTINGS_TABLE = 'user_github_settings';

export type GitHubSettingsRecord = {
  username: string;
  githubToken: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  githubPath: string | null;
  githubFetchMissingOnly: boolean;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  supabasePdfBucket: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  migratedFromStorageAt: string | null;
};

type GitHubSettingsRow = {
  username: string;
  github_token: string | null;
  github_owner: string | null;
  github_repo: string | null;
  github_path: string | null;
  github_fetch_missing_only: boolean | null;
  supabase_url: string | null;
  supabase_anon_key: string | null;
  supabase_pdf_bucket: string | null;
  created_at: string | null;
  updated_at: string | null;
  migrated_from_storage_at: string | null;
};

type LegacyGitHubSettings = {
  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubPath?: string;
  githubFetchMissingOnly?: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabasePdfBucket?: string;
};

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const getServiceRoleKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const normalizeUsername = (username: string) => String(username || '').trim().toLowerCase();
const toNullableTrimmed = (value?: string | null) => {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
};

const toRecord = (row: GitHubSettingsRow): GitHubSettingsRecord => ({
  username: normalizeUsername(row.username),
  githubToken: toNullableTrimmed(row.github_token),
  githubOwner: toNullableTrimmed(row.github_owner),
  githubRepo: toNullableTrimmed(row.github_repo),
  githubPath: toNullableTrimmed(row.github_path),
  githubFetchMissingOnly: row.github_fetch_missing_only ?? true,
  supabaseUrl: toNullableTrimmed(row.supabase_url),
  supabaseAnonKey: toNullableTrimmed(row.supabase_anon_key),
  supabasePdfBucket: toNullableTrimmed(row.supabase_pdf_bucket),
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
  migratedFromStorageAt: row.migrated_from_storage_at ?? null,
});

const withHelpfulTableError = (error: unknown, fallbackMessage: string): never => {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  if (lower.includes('relation') && lower.includes(GITHUB_SETTINGS_TABLE)) {
    throw new Error('GitHub settings table is missing. Run docs/auth-users.sql in Supabase SQL Editor before saving per-user GitHub settings.');
  }
  if (lower.includes('could not find the table') && lower.includes(GITHUB_SETTINGS_TABLE)) {
    throw new Error('GitHub settings table is missing. Run docs/auth-users.sql in Supabase SQL Editor before saving per-user GitHub settings.');
  }
  throw new Error(message || fallbackMessage);
};

export const isGitHubSettingsDbConfigured = (): boolean => Boolean(getSupabaseUrl().trim() && getServiceRoleKey().trim());

const getAdminClient = () => {
  const url = getSupabaseUrl().trim();
  const key = getServiceRoleKey().trim();
  if (!url || !key) {
    throw new Error('Supabase server credentials are missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const configKey = `${url}::${key}`;
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedConfigKey = configKey;
  }
  return cachedClient;
};

export async function readGitHubSettingsFromDb(username: string): Promise<GitHubSettingsRecord | null> {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  try {
    const client = getAdminClient();
    const { data, error } = await client
      .from(GITHUB_SETTINGS_TABLE)
      .select('username, github_token, github_owner, github_repo, github_path, github_fetch_missing_only, supabase_url, supabase_anon_key, supabase_pdf_bucket, created_at, updated_at, migrated_from_storage_at')
      .eq('username', normalizedUsername)
      .maybeSingle<GitHubSettingsRow>();

    if (error) {
      withHelpfulTableError(error, 'Failed to read GitHub settings.');
    }

    return data ? toRecord(data) : null;
  } catch (error) {
    return withHelpfulTableError(error, 'Failed to read GitHub settings.');
  }
}

export async function upsertGitHubSettings(payload: {
  username: string;
  githubToken?: string | null;
  githubOwner?: string | null;
  githubRepo?: string | null;
  githubPath?: string | null;
  githubFetchMissingOnly?: boolean;
  supabaseUrl?: string | null;
  supabaseAnonKey?: string | null;
  supabasePdfBucket?: string | null;
  migratedFromStorageAt?: string | null;
}): Promise<GitHubSettingsRecord> {
  const normalizedUsername = normalizeUsername(payload.username);
  const now = new Date().toISOString();

  try {
    const client = getAdminClient();
    const { data, error } = await client
      .from(GITHUB_SETTINGS_TABLE)
      .upsert(
        {
          username: normalizedUsername,
          github_token: toNullableTrimmed(payload.githubToken),
          github_owner: toNullableTrimmed(payload.githubOwner),
          github_repo: toNullableTrimmed(payload.githubRepo),
          github_path: toNullableTrimmed(payload.githubPath),
          github_fetch_missing_only: typeof payload.githubFetchMissingOnly === 'boolean' ? payload.githubFetchMissingOnly : true,
          supabase_url: toNullableTrimmed(payload.supabaseUrl),
          supabase_anon_key: toNullableTrimmed(payload.supabaseAnonKey),
          supabase_pdf_bucket: toNullableTrimmed(payload.supabasePdfBucket),
          updated_at: now,
          migrated_from_storage_at: payload.migratedFromStorageAt ?? null,
        },
        { onConflict: 'username' }
      )
      .select('username, github_token, github_owner, github_repo, github_path, github_fetch_missing_only, supabase_url, supabase_anon_key, supabase_pdf_bucket, created_at, updated_at, migrated_from_storage_at')
      .single<GitHubSettingsRow>();

    if (error) {
      withHelpfulTableError(error, 'Failed to save GitHub settings.');
    }

    if (!data) throw new Error('GitHub settings save returned no record.');
    return toRecord(data);
  } catch (error) {
    return withHelpfulTableError(error, 'Failed to save GitHub settings.');
  }
}

export async function migrateLegacyGitHubSettingsToDb(username: string): Promise<GitHubSettingsRecord | null> {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  const existing = await readGitHubSettingsFromDb(normalizedUsername);
  if (existing) return existing;

  const legacy = await readJsonFromStorage<LegacyGitHubSettings>(`github-settings/${normalizedUsername}.json`);
  if (!legacy) return null;

  const migratedAt = new Date().toISOString();
  return await upsertGitHubSettings({
    username: normalizedUsername,
    githubToken: legacy.githubToken,
    githubOwner: legacy.githubOwner,
    githubRepo: legacy.githubRepo,
    githubPath: legacy.githubPath,
    githubFetchMissingOnly: typeof legacy.githubFetchMissingOnly === 'boolean' ? legacy.githubFetchMissingOnly : true,
    supabaseUrl: legacy.supabaseUrl,
    supabaseAnonKey: legacy.supabaseAnonKey,
    supabasePdfBucket: legacy.supabasePdfBucket,
    migratedFromStorageAt: migratedAt,
  });
}

export async function readGitHubSettings(username: string): Promise<GitHubSettingsRecord | null> {
  const existing = await readGitHubSettingsFromDb(username);
  if (existing) return existing;
  return await migrateLegacyGitHubSettingsToDb(username);
}
