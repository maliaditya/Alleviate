import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/serverSession';
import { revokeRefreshToken } from '@/lib/authTokens';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { refreshToken?: string };
    if (body?.refreshToken) {
      await revokeRefreshToken(body.refreshToken);
    }
  } catch {
    // Ignore logout payload parsing errors to preserve sign-out UX.
  }
  const response = NextResponse.json({ success: true, message: 'Logged out.' });
  clearSessionCookie(response, request);
  return response;
}
