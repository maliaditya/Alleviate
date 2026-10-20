import { NextResponse } from "next/server";
import { readSupportState } from "../../../lib/supportStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readSupportState();
    return NextResponse.json({ releases: state.releases });
  } catch (error) {
    console.error("GET /api/support-releases error:", error);
    return NextResponse.json({ error: "Could not load Alleviate release updates." }, { status: 500 });
  }
}
