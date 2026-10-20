"use server";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = "";
const bucketReadyByConfig = new Map<string, Promise<void>>();

const resolveConfig = (): SupabaseStorageConfig | null => {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET ||
    "dock-data";

  if (!url.trim() || !serviceRoleKey.trim()) return null;
  return { url: url.trim(), serviceRoleKey: serviceRoleKey.trim(), bucket: bucket.trim() || "dock-data" };
};

export const isSupabaseStorageConfigured = (): boolean => Boolean(resolveConfig());

const getAdminClient = (): { client: SupabaseClient; bucket: string; configKey: string } => {
  const cfg = resolveConfig();
  if (!cfg) {
    throw new Error("Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  const key = `${cfg.url}::${cfg.serviceRoleKey}::${cfg.bucket}`;
  if (!cachedClient || cachedConfigKey !== key) {
    cachedClient = createClient(cfg.url, cfg.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedConfigKey = key;
  }
  return { client: cachedClient, bucket: cfg.bucket, configKey: key };
};

const isNotFound = (error: any): boolean => {
  const msg = String(error?.message || "").toLowerCase();
  return error?.statusCode === 404 || msg.includes("not found") || msg.includes("404");
};

const ensureBucketReady = async (client: SupabaseClient, bucket: string, configKey: string) => {
  if (bucketReadyByConfig.has(configKey)) {
    await bucketReadyByConfig.get(configKey);
    return;
  }

  const readyPromise = (async () => {
    const { data: buckets, error: listErr } = await client.storage.listBuckets();
    if (listErr) {
      throw new Error(listErr.message || "Failed to list Supabase buckets.");
    }
    const exists = (buckets || []).some((b) => b.name === bucket);
    if (!exists) {
      const { error: createErr } = await client.storage.createBucket(bucket, {
        public: false,
        allowedMimeTypes: ["application/json"],
      });
      if (createErr && !String(createErr.message || "").toLowerCase().includes("already")) {
        throw new Error(createErr.message || "Failed to create Supabase bucket.");
      }
    }
  })();

  bucketReadyByConfig.set(configKey, readyPromise);
  await readyPromise;
};

export async function readJsonFromStorage<T = unknown>(path: string): Promise<T | null> {
  const { client, bucket, configKey } = getAdminClient();
  await ensureBucketReady(client, bucket, configKey);
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) {
    const errorMessage = String((error as any)?.message || "").trim();
    const lowerMessage = errorMessage.toLowerCase();
    if (
      !data ||
      isNotFound(error) ||
      !errorMessage ||
      errorMessage === "{}" ||
      lowerMessage.includes("not found") ||
      lowerMessage.includes("no such") ||
      lowerMessage.includes("does not exist") ||
      lowerMessage.includes("failed to generate cache key")
    ) {
      return null;
    }
    throw new Error(errorMessage || "Failed to read from Supabase storage.");
  }
  const text =
    typeof (data as any).text === "function"
      ? await (data as any).text()
      : Buffer.from(
          typeof (data as any).arrayBuffer === "function"
            ? await (data as any).arrayBuffer()
            : (data as any)
        ).toString("utf8");
  if (!text) return null;
  return JSON.parse(text) as T;
}

export async function writeJsonToStorage(path: string, payload: unknown): Promise<void> {
  const { client, bucket, configKey } = getAdminClient();
  await ensureBucketReady(client, bucket, configKey);
  const body = Buffer.from(JSON.stringify(payload, null, 2));
  const { error } = await client.storage.from(bucket).upload(path, body, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "0",
  });
  if (error) {
    throw new Error(error.message || "Failed to write to Supabase storage.");
  }
}
