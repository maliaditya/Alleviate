import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type DesktopPlanId = 'yearly' | 'lifetime';
export type DesktopEntitlement = {
  username: string;
  plan_id: DesktopPlanId;
  purchase_date: string;
  expires_at: string | null;
};

// Dock and Alleviate share this table. Keep the schema aligned with Dock's
// user_desktop_status records so a purchase made in either app grants access.
const table = 'user_desktop_status';
let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

const config = () => ({
  url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
  key: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
});

const client = () => {
  const { url, key } = config();
  if (!url || !key) throw new Error('Shared desktop access storage is not configured. Set Supabase server credentials.');
  const configKey = `${url}::${key}`;
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    cachedConfigKey = configKey;
  }
  return cachedClient;
};

export const isDesktopEntitlementStoreConfigured = () => Boolean(config().url && config().key);

export async function assertDesktopEntitlementStoreReady() {
  const { error } = await client().from(table).select('username').limit(0);
  if (error) {
    throw new Error(`Shared Dock desktop access storage is not ready: ${error.message}`);
  }
}

export async function readDesktopEntitlement(username: string): Promise<DesktopEntitlement | null> {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (!normalizedUsername) return null;

  const { data, error } = await client()
    .from(table)
    .select('username, payment_completed, purchase_date, expires_at')
    .eq('username', normalizedUsername)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const { data: user, error: userError } = await client()
    .from('auth_users')
    .select('is_priviledge, created_at')
    .eq('username', normalizedUsername)
    .maybeSingle();
  if (userError) throw new Error(userError.message);
  if (user?.is_priviledge) {
    return {
      username: normalizedUsername,
      plan_id: 'lifetime',
      purchase_date: data?.purchase_date || user.created_at,
      expires_at: null,
    };
  }
  if (!data?.payment_completed || !data.purchase_date) return null;
  return {
    username: data.username,
    plan_id: 'yearly',
    purchase_date: data.purchase_date,
    expires_at: data.expires_at,
  };
}

export const isDesktopEntitlementActive = (record: DesktopEntitlement | null, now = Date.now()) =>
  Boolean(record && (record.plan_id === 'lifetime' || (record.expires_at && Date.parse(record.expires_at) > now)));

export async function assertDesktopAccess(username: string) {
  const record = await readDesktopEntitlement(username);
  if (!isDesktopEntitlementActive(record)) {
    throw new Error(record ? 'Your Alleviate desktop access has expired. Renew your plan to sign in.' : 'A desktop plan is required to sign in to the Windows app. Choose a plan on the Alleviate website.');
  }
  return {
    paymentCompleted: true,
    purchaseDate: record!.purchase_date,
    expiresAt: record!.expires_at,
    isPriviledge: record!.plan_id === 'lifetime',
  };
}

export async function grantDesktopEntitlement(input: {
  username: string;
  planId: DesktopPlanId;
  orderId: string;
  paymentId: string;
}) {
  const username = String(input.username || '').trim().toLowerCase();
  const now = new Date();

  const existing = await client()
    .from(table)
    .select('purchase_date, expires_at, payment_provider')
    .eq('username', username)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const currentExpiry = existing.data?.expires_at ? Date.parse(existing.data.expires_at) : Number.NaN;
  const baseDate = Number.isFinite(currentExpiry) && currentExpiry > now.getTime()
    ? new Date(currentExpiry)
    : now;
  const expiresAt = input.planId === 'lifetime'
    ? null
    : new Date(baseDate.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const purchaseDate = now.toISOString();

  const { data, error } = await client()
    .from(table)
    .upsert({
      username,
      payment_completed: true,
      purchase_date: purchaseDate,
      expires_at: expiresAt,
      payment_provider: 'razorpay',
      updated_at: now.toISOString(),
    }, { onConflict: 'username' })
    .select('username, purchase_date, expires_at')
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Payment ${input.paymentId} for order ${input.orderId} was verified but shared desktop access could not be saved.`);
  if (input.planId === 'lifetime') {
    const { error: privilegeError } = await client()
      .from('auth_users')
      .update({ is_priviledge: true, updated_at: now.toISOString() })
      .eq('username', username);
    if (privilegeError) throw new Error(privilegeError.message);
  }
  return {
    username: data.username,
    plan_id: input.planId,
    purchase_date: data.purchase_date,
    expires_at: data.expires_at,
  } satisfies DesktopEntitlement;
}
