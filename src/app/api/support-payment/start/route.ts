import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createSupporterId, readSupportState, writeSupportState } from "../../../../lib/supportStore";

export const dynamic = "force-dynamic";

const getCredentials = () => ({ id: (process.env.RAZORPAY_KEY_ID || "").trim(), secret: (process.env.RAZORPAY_KEY_SECRET || "").trim() });
const safePrefill = (username: string, email: string) => {
  const contactDigits = username.replace(/\D/g, "");
  const contact = /^\+?\d{10,15}$/.test(username) ? (username.startsWith("+") ? username : `+${contactDigits}`) : undefined;
  const normalizedEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
  return { ...(username && !contact ? { name: username.slice(0, 64) } : {}), ...(contact ? { contact } : {}), ...(normalizedEmail ? { email: normalizedEmail } : {}) };
};

export async function POST(request: Request) {
  try {
    const { id: keyId, secret } = getCredentials();
    if (!keyId || !secret) return NextResponse.json({ error: "Razorpay is not configured for Alleviate. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the Alleviate server environment." }, { status: 503 });
    const body = await request.json() as { amountInr?: number; username?: string; email?: string };
    const amountInr = Math.round(Number(body.amountInr));
    if (!Number.isFinite(amountInr) || amountInr < 99 || amountInr > 1_000_000) return NextResponse.json({ error: "Choose a support amount between ₹99 and ₹10,00,000." }, { status: 400 });

    const sessionId = randomUUID();
    const receipt = `alleviate_${sessionId.replace(/-/g, "").slice(0, 24)}`;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountInr * 100, currency: "INR", receipt, notes: { supportSessionId: sessionId, app: "Alleviate" } }),
      cache: "no-store",
    });
    const order = await response.json().catch(() => null) as { id?: string; amount?: number; currency?: string; error?: { description?: string } } | null;
    if (!response.ok || !order?.id) return NextResponse.json({ error: order?.error?.description || "Razorpay could not create a payment order." }, { status: 502 });

    const state = await readSupportState();
    state.donations[sessionId] = {
      sessionId, orderId: order.id, amountInr, currency: "INR",
      supporterId: createSupporterId(body.username, body.email, sessionId),
      status: "started", createdAt: new Date().toISOString(),
    };
    await writeSupportState(state);
    const username = String(body.username || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    return NextResponse.json({ success: true, sessionId, checkoutData: { keyId, orderId: order.id, amount: order.amount || amountInr * 100, currency: order.currency || "INR", name: "Alleviate", description: `Support Alleviate (₹${amountInr.toLocaleString("en-IN")})`, prefill: safePrefill(username, email) } });
  } catch (error) {
    console.error("POST /api/support-payment/start error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start Alleviate support checkout." }, { status: 500 });
  }
}
