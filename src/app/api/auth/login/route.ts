import { verifyPassword } from '@/lib/password';
import { attachSessionCookie } from '@/lib/serverSession';
import { issueAuthTokens } from '@/lib/authTokens';
import { isAuthDbConfigured, readAuthUserByUsernameOrEmail } from '@/lib/authUsersServer';
import { createLoginPostHandler } from '@/lib/authRouteHandlers';

export const dynamic = 'force-dynamic';
export const POST = createLoginPostHandler({
  verifyPassword,
  attachSessionCookie,
  issueAuthTokens,
  isAuthDbConfigured,
  readAuthUserByUsernameOrEmail,
  assertDesktopAppLoginAllowed: async () => ({ paymentCompleted: true, purchaseDate: null, expiresAt: null }),
});
