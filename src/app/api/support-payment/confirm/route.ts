import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { readSupportState, writeSupportState } from "../../../../lib/supportStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
    const secret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
    if (!keyId || !secret) return NextResponse.json({ error: "Razorpay is not configured for Alleviate." }, { status: 503 });
    const body = await request.json() as { sessionId?: string; providerSessionId?: string; providerOrderId?: string; providerSignature?: string };
    const sessionId = String(body.sessionId || "").trim();
    const paymentId = String(body.providerSessionId || "").trim();
    const orderId = String(body.providerOrderId || "").trim();
    const signature = String(body.providerSignature || "").trim();
    if (!sessionId || !paymentId || !orderId || !signature) return NextResponse.json({ error: "The payment response is incomplete." }, { status: 400 });

    const state = await readSupportState();
    const donation = state.donations[sessionId];
    if (!donation || donation.orderId !== orderId) return NextResponse.json({ error: "This Alleviate support order could not be verified." }, { status: 404 });
    if (donation.status === "completed") return NextResponse.json({ success: true, message: `Thanks for supporting Alleviate with ₹${donation.amountInr.toLocaleString("en-IN")}.`, count: state.supporters.length });

    const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
    let supplied: Buffer;
    try { supplied = Buffer.from(signature, "hex"); } catch { supplied = Buffer.alloc(0); }
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ error: "Razorpay payment signature verification failed." }, { status: 400 });

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}` }, cache: "no-store",
    });
    const payment = await paymentResponse.json().catch(() => null) as { id?: string; order_id?: string; amount?: number; currency?: string; status?: string; error?: { description?: string } } | null;
    if (!paymentResponse.ok || !payment) return NextResponse.json({ error: payment?.error?.description || "Could not verify the payment with Razorpay." }, { status: 502 });
    if (payment.id !== paymentId || payment.order_id !== donation.orderId || payment.amount !== donation.amountInr * 100 || payment.currency !== donation.currency || payment.status !== "captured") {
      return NextResponse.json({ error: "Razorpay has not confirmed a captured payment for this Alleviate order." }, { status: 400 });
    }

    const supporterId = donation.supporterId;
    state.donations[sessionId] = { ...donation, paymentId, status: "completed", completedAt: new Date().toISOString() };
    if (!state.supporters.includes(supporterId)) state.supporters.push(supporterId);
    await writeSupportState(state);
    return NextResponse.json({ success: true, message: `Thanks for supporting Alleviate with ₹${donation.amountInr.toLocaleString("en-IN")}.`, count: state.supporters.length });
  } catch (error) {
    console.error("POST /api/support-payment/confirm error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to confirm the Alleviate support payment." }, { status: 500 });
  }
}
