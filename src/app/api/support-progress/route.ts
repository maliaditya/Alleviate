import { NextResponse } from "next/server";
import { readSupportState } from "../../../lib/supportStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    const state = await readSupportState();
    const donations = Object.values(state.donations).filter((item) => item.status === "completed" && item.completedAt && Date.parse(item.completedAt) >= monthStart && Date.parse(item.completedAt) < nextMonth);
    return NextResponse.json({
      storageConfigured: true,
      monthKey,
      monthLabel: now.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }),
      monthlyContributionInr: donations.reduce((sum, item) => sum + item.amountInr, 0),
      monthlyDonorCount: new Set(donations.map((item) => item.supporterId)).size,
      monthlyDonationCount: donations.length,
    });
  } catch (error) {
    console.error("GET /api/support-progress error:", error);
    return NextResponse.json({ error: "Could not load Alleviate support progress." }, { status: 500 });
  }
}
