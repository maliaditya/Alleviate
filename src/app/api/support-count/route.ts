import { NextResponse } from "next/server";
import { readSupportState } from "../../../lib/supportStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readSupportState();
    return NextResponse.json({ count: state.supporters.length });
  } catch (error) {
    console.error("GET /api/support-count error:", error);
    return NextResponse.json({ error: "Could not load Alleviate supporter count." }, { status: 500 });
  }
}
