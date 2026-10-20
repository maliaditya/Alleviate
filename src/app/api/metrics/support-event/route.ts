import { NextResponse } from "next/server";
import { readSupportState, writeSupportState } from "../../../../lib/supportStore";

export const dynamic = "force-dynamic";
const VALID_EVENTS = new Set(["support_page_view", "support_cta_click", "donation_intent"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { event?: string };
    if (!body.event || !VALID_EVENTS.has(body.event)) return NextResponse.json({ error: "Unsupported support metric." }, { status: 400 });
    const state = await readSupportState();
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const key = `${body.event}:${month}`;
    state.metrics[key] = (state.metrics[key] || 0) + 1;
    await writeSupportState(state);
    return NextResponse.json({ success: true, month });
  } catch (error) {
    console.error("POST /api/metrics/support-event error:", error);
    return NextResponse.json({ error: "Could not record support metric." }, { status: 500 });
  }
}
