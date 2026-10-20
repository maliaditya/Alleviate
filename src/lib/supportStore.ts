import { createHash, randomUUID } from "crypto";
import { readJsonFromStorage, writeJsonToStorage } from "./supabaseStorageServer";

export type SupportFundingRequirement = { id: string; label: string; priceInr: number };
export type SupportRelease = { id: string; name: string; launchDate: string; features?: string[] };
export type SupportDonation = {
  sessionId: string;
  orderId: string;
  paymentId?: string;
  amountInr: number;
  currency: "INR";
  supporterId: string;
  status: "started" | "completed";
  createdAt: string;
  completedAt?: string;
};
export type SupportState = {
  donations: Record<string, SupportDonation>;
  supporters: string[];
  requirements: SupportFundingRequirement[];
  releases: SupportRelease[];
  metrics: Record<string, number>;
};

const STATE_PATH = "alleviate/support/state.json";
const defaultRequirements: SupportFundingRequirement[] = [
  { id: "infrastructure", label: "Infrastructure and hosting", priceInr: 120000 },
  { id: "content", label: "Content and product improvements", priceInr: 180000 },
  { id: "support", label: "Support and maintenance", priceInr: 90000 },
];

export function createSupporterId(username?: string, email?: string, sessionId?: string): string {
  const identity = String(username || email || sessionId || "").trim().toLowerCase();
  return createHash("sha256").update(identity || randomUUID()).digest("hex");
}

export async function readSupportState(): Promise<SupportState> {
  const saved = await readJsonFromStorage<Partial<SupportState>>(STATE_PATH);
  return {
    donations: saved?.donations && typeof saved.donations === "object" ? saved.donations : {},
    supporters: Array.isArray(saved?.supporters) ? saved.supporters.filter((value): value is string => typeof value === "string") : [],
    requirements: Array.isArray(saved?.requirements) ? saved.requirements : defaultRequirements,
    releases: Array.isArray(saved?.releases) ? saved.releases : [],
    metrics: saved?.metrics && typeof saved.metrics === "object" ? saved.metrics : {},
  };
}

export async function writeSupportState(state: SupportState): Promise<void> {
  await writeJsonToStorage(STATE_PATH, state);
}
