import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/serverSession';
import { isDesktopEntitlementStoreConfigured, grantDesktopEntitlement, type DesktopPlanId } from '@/lib/desktopEntitlements';

export const dynamic = 'force-dynamic';

const plans: Record<DesktopPlanId, { amountInr: number }> = {
  yearly: { amountInr: 943 },
  lifetime: { amountInr: 3499 },
};

type RazorpayOrder = { id?: string; amount?: number; currency?: string; notes?: Record<string, string>; error?: { description?: string } };
type RazorpayPayment = { id?: string; order_id?: string; amount?: number; currency?: string; status?: string; error?: { description?: string } };

export async function POST(request: Request) {
  try {
    const username = getSessionUserFromRequest(request);
    if (!username) return NextResponse.json({ error: 'Sign in to confirm this desktop purchase.' }, { status: 401 });
    if (!isDesktopEntitlementStoreConfigured()) return NextResponse.json({ error: 'Desktop entitlement storage is not configured.' }, { status: 503 });

    const body = await request.json() as { orderId?: string; paymentId?: string; signature?: string };
    const orderId = String(body.orderId || '').trim();
    const paymentId = String(body.paymentId || '').trim();
    const signature = String(body.signature || '').trim();
    if (!orderId || !paymentId || !signature) return NextResponse.json({ error: 'The payment confirmation is incomplete.' }, { status: 400 });

    const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
    const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    if (!keyId || !secret) return NextResponse.json({ error: 'Razorpay is not configured for Alleviate.' }, { status: 503 });

    const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
    const supplied = Buffer.from(signature, 'hex');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return NextResponse.json({ error: 'Razorpay payment signature verification failed.' }, { status: 400 });
    }

    const authHeader = { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}` };
    const orderResponse = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, { headers: authHeader, cache: 'no-store' });
    const order = await orderResponse.json().catch(() => null) as RazorpayOrder | null;
    if (!orderResponse.ok || !order?.id) return NextResponse.json({ error: order?.error?.description || 'Could not verify this Razorpay order.' }, { status: 502 });

    const planId = order.notes?.planId;
    if ((planId !== 'yearly' && planId !== 'lifetime') || order.notes?.app !== 'Alleviate' || order.notes?.username !== username) {
      return NextResponse.json({ error: 'This order does not belong to the signed-in Alleviate account.' }, { status: 403 });
    }
    const plan: DesktopPlanId = planId;
    const expectedAmount = plans[plan].amountInr * 100;
    if (order.amount !== expectedAmount || order.currency !== 'INR') return NextResponse.json({ error: 'The order amount does not match the selected desktop plan.' }, { status: 400 });

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: authHeader, cache: 'no-store' });
    const payment = await paymentResponse.json().catch(() => null) as RazorpayPayment | null;
    if (!paymentResponse.ok || !payment) return NextResponse.json({ error: payment?.error?.description || 'Could not verify payment with Razorpay.' }, { status: 502 });
    if (payment.id !== paymentId || payment.order_id !== orderId || payment.amount !== expectedAmount || payment.currency !== 'INR' || payment.status !== 'captured') {
      return NextResponse.json({ error: 'Razorpay has not confirmed a captured payment for this desktop order.' }, { status: 400 });
    }

    const entitlement = await grantDesktopEntitlement({ username, planId: plan, orderId, paymentId });
    return NextResponse.json({ success: true, planId: entitlement.plan_id, expiresAt: entitlement.expires_at });
  } catch (error) {
    console.error('POST /api/desktop-purchase/confirm error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not confirm desktop purchase.' }, { status: 500 });
  }
}
