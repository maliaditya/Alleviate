import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/serverSession';
import { isAuthDbConfigured, readAuthUserByUsernameOrEmail } from '@/lib/authUsersServer';
import { assertDesktopEntitlementStoreReady, isDesktopEntitlementActive, isDesktopEntitlementStoreConfigured, readDesktopEntitlement, type DesktopPlanId } from '@/lib/desktopEntitlements';

export const dynamic = 'force-dynamic';

const plans: Record<DesktopPlanId, { amountInr: number; label: string }> = {
  yearly: { amountInr: 943, label: 'Alleviate Windows yearly access' },
  lifetime: { amountInr: 3499, label: 'Alleviate Windows lifetime access' },
};

export async function POST(request: Request) {
  try {
    const username = getSessionUserFromRequest(request);
    if (!username) return NextResponse.json({ error: 'Sign in or create an Alleviate account before purchasing a desktop plan.' }, { status: 401 });
    if (!isAuthDbConfigured() || !isDesktopEntitlementStoreConfigured()) return NextResponse.json({ error: 'Desktop checkout is not configured. Set the shared Supabase server credentials.' }, { status: 503 });
    try {
      await assertDesktopEntitlementStoreReady();
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Desktop purchase storage is not ready.' }, { status: 503 });
    }

    const { planId: requestedPlan } = await request.json() as { planId?: string };
    if (requestedPlan !== 'yearly' && requestedPlan !== 'lifetime') return NextResponse.json({ error: 'Choose a valid desktop plan.' }, { status: 400 });
    const planId: DesktopPlanId = requestedPlan;
    const existing = await readDesktopEntitlement(username);
    if (existing?.plan_id === 'lifetime' && isDesktopEntitlementActive(existing)) {
      return NextResponse.json({ error: 'This account already has lifetime desktop access.' }, { status: 409 });
    }

    const { id: keyId, secret } = { id: (process.env.RAZORPAY_KEY_ID || '').trim(), secret: (process.env.RAZORPAY_KEY_SECRET || '').trim() };
    if (!keyId || !secret) return NextResponse.json({ error: 'Razorpay is not configured for Alleviate.' }, { status: 503 });
    const user = await readAuthUserByUsernameOrEmail(username, '');
    if (!user) return NextResponse.json({ error: 'The signed-in account could not be found.' }, { status: 404 });

    const sessionId = randomUUID();
    const plan = plans[planId];
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: plan.amountInr * 100,
        currency: 'INR',
        receipt: `allev_${sessionId.replace(/-/g, '').slice(0, 24)}`,
        notes: { app: 'Alleviate', username, planId, sessionId },
      }),
      cache: 'no-store',
    });
    const order = await response.json().catch(() => null) as { id?: string; amount?: number; currency?: string; error?: { description?: string } } | null;
    if (!response.ok || !order?.id) return NextResponse.json({ error: order?.error?.description || 'Razorpay could not create a payment order.' }, { status: 502 });

    return NextResponse.json({
      sessionId,
      planId,
      checkoutData: {
        keyId,
        orderId: order.id,
        amount: order.amount || plan.amountInr * 100,
        currency: order.currency || 'INR',
        name: 'Alleviate',
        description: plan.label,
        prefill: { ...(user.email ? { email: user.email } : {}), name: username },
      },
    });
  } catch (error) {
    console.error('POST /api/desktop-purchase/start error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start desktop checkout.' }, { status: 500 });
  }
}
