import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/serverSession';
import { isDesktopEntitlementActive, readDesktopEntitlement } from '@/lib/desktopEntitlements';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const username = getSessionUserFromRequest(request);
  if (!username) return NextResponse.json({ error: 'Sign in to check desktop access.' }, { status: 401 });
  try {
    const entitlement = await readDesktopEntitlement(username);
    return NextResponse.json({
      active: isDesktopEntitlementActive(entitlement),
      planId: entitlement?.plan_id || null,
      expiresAt: entitlement?.expires_at || null,
    });
  } catch (error) {
    console.error('GET /api/desktop-access error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read desktop access.' }, { status: 503 });
  }
}
