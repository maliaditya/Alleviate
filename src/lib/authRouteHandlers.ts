import { NextResponse } from 'next/server.js';

export type LoginRouteUserRecord = {
  username: string;
  email: string | null;
  isPriviledge?: boolean;
  passwordHash: string;
  passwordSalt: string;
  passwordAlgo: string;
};

export type DesktopEntitlementRecord = {
  paymentCompleted: boolean;
  purchaseDate: string | null;
  expiresAt: string | null;
  isPriviledge?: boolean;
};

type LoginRouteDeps = {
  verifyPassword: (
    password: string,
    record: { passwordHash: string; passwordSalt: string; passwordAlgo: string }
  ) => boolean;
  attachSessionCookie: (response: NextResponse, username: string, request?: Request) => void;
  issueAuthTokens: (username: string) => Promise<Record<string, unknown>>;
  isAuthDbConfigured: () => boolean;
  readAuthUserByUsernameOrEmail: (username: string, email: string) => Promise<LoginRouteUserRecord | null>;
  assertDesktopAppLoginAllowed: (username: string) => Promise<DesktopEntitlementRecord>;
};

type RefreshRouteDeps = {
  createAccessToken: (username: string) => string;
  rotateRefreshToken: (refreshToken: string) => Promise<{ refreshToken: string; expiresAt: string } | null>;
  verifyRefreshToken: (refreshToken: string) => Promise<{ username: string } | null>;
  attachSessionCookie: (response: NextResponse, username: string, request?: Request) => void;
  readAuthUserByUsername: (username: string) => Promise<{ email: string | null } | null>;
  assertDesktopAppLoginAllowed: (username: string) => Promise<DesktopEntitlementRecord>;
};

const normalizeUsername = (username: string) => String(username || '').trim().toLowerCase();

const normalizeEmail = (email: string | null | undefined) => {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isDesktopAuthRequest = (request: Request) => request.headers.get('x-studio-desktop') === '1';

const toDesktopEntitlementPayload = (entitlement: DesktopEntitlementRecord) => ({
  paymentCompleted: entitlement.paymentCompleted,
  purchaseDate: entitlement.purchaseDate,
  expiresAt: entitlement.expiresAt,
  isPriviledge: Boolean(entitlement.isPriviledge),
});

export const createLoginPostHandler = (deps: LoginRouteDeps) => {
  return async function POST(request: Request) {
    const desktopAuthRequest = isDesktopAuthRequest(request);
    const { username, password } = await request.json();
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmailInput = normalizeEmail(username);
    const isEmailLogin = Boolean(normalizedEmailInput && EMAIL_PATTERN.test(normalizedEmailInput));

    if (normalizedUsername === 'demo' && password === 'demo') {
      const responsePayload: Record<string, unknown> = {
        success: true,
        message: 'Demo login successful.',
        user: { username: normalizedUsername },
      };
      if (deps.isAuthDbConfigured()) {
        try {
          const tokens = await deps.issueAuthTokens(normalizedUsername);
          Object.assign(responsePayload, tokens);
        } catch (error) {
          console.error('Demo login token issuance failed; continuing without cloud tokens:', error);
        }
      }
      const response = NextResponse.json(responsePayload);
      deps.attachSessionCookie(response, normalizedUsername, request);
      return response;
    }

    if (!deps.isAuthDbConfigured()) {
      return NextResponse.json(
        {
          error:
            'Cloud authentication database is not configured for this build. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and run docs/auth-users.sql before first login on this device.',
          code: 'CLOUD_AUTH_UNAVAILABLE',
        },
        { status: 503 }
      );
    }

    if ((!normalizedUsername && !normalizedEmailInput) || !password) {
      return NextResponse.json({ error: 'Username or email and password are required.' }, { status: 400 });
    }

    try {
      const lookupUsername = isEmailLogin ? '' : normalizedUsername;
      const lookupEmail = isEmailLogin ? (normalizedEmailInput as string) : '';
      const userData = await deps.readAuthUserByUsernameOrEmail(lookupUsername, lookupEmail);
      if (!userData) {
        return NextResponse.json({ error: isEmailLogin ? 'Email not found.' : 'Username not found.' }, { status: 404 });
      }

      const isPasswordValid = deps.verifyPassword(password, {
        passwordHash: userData.passwordHash,
        passwordSalt: userData.passwordSalt,
        passwordAlgo: userData.passwordAlgo,
      });

      if (!isPasswordValid) {
        return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
      }

      const canonicalUsername = normalizeUsername(userData.username);
      let desktopEntitlement: DesktopEntitlementRecord | null = null;
      if (desktopAuthRequest) {
        try {
          desktopEntitlement = await deps.assertDesktopAppLoginAllowed(canonicalUsername);
        } catch (error) {
          return NextResponse.json(
            {
              error: error instanceof Error ? error.message : 'Desktop access is inactive for this account.',
              code: 'DESKTOP_ACCESS_EXPIRED',
            },
            { status: 403 }
          );
        }
      }

      const tokens = await deps.issueAuthTokens(canonicalUsername);
      const email = normalizeEmail(userData.email);
      const response = NextResponse.json({
        success: true,
        message: 'Login successful.',
        user: {
          username: canonicalUsername,
          ...(email ? { email } : {}),
        },
        ...(desktopEntitlement ? { desktopEntitlement: toDesktopEntitlementPayload(desktopEntitlement) } : {}),
        ...tokens,
      });
      deps.attachSessionCookie(response, canonicalUsername, request);
      return response;
    } catch (error) {
      console.error(`Auth database login error for user ${normalizedUsername}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      return NextResponse.json({ error: `Cloud authentication request failed: ${errorMessage}` }, { status: 500 });
    }
  };
};

export const createRefreshPostHandler = (deps: RefreshRouteDeps) => {
  return async function POST(request: Request) {
    try {
      const desktopAuthRequest = isDesktopAuthRequest(request);
      const payload = (await request.json()) as { refreshToken?: string };
      const refreshToken = String(payload?.refreshToken || '');
      if (!refreshToken) {
        return NextResponse.json({ error: 'refreshToken is required.' }, { status: 400 });
      }

      const current = await deps.verifyRefreshToken(refreshToken);
      if (!current) {
        return NextResponse.json({ error: 'Invalid or expired refresh token.' }, { status: 401 });
      }

      let desktopEntitlement: DesktopEntitlementRecord | null = null;
      if (desktopAuthRequest) {
        try {
          desktopEntitlement = await deps.assertDesktopAppLoginAllowed(current.username);
        } catch (error) {
          return NextResponse.json(
            {
              error: error instanceof Error ? error.message : 'Desktop access is inactive for this account.',
              code: 'DESKTOP_ACCESS_EXPIRED',
            },
            { status: 403 }
          );
        }
      }

      const rotated = await deps.rotateRefreshToken(refreshToken);
      if (!rotated) {
        return NextResponse.json({ error: 'Invalid or expired refresh token.' }, { status: 401 });
      }
      const userData = await deps.readAuthUserByUsername(current.username);
      const accessToken = deps.createAccessToken(current.username);
      const email = normalizeEmail(userData?.email);
      const response = NextResponse.json({
        success: true,
        user: {
          username: current.username,
          ...(email ? { email } : {}),
        },
        ...(desktopEntitlement ? { desktopEntitlement: toDesktopEntitlementPayload(desktopEntitlement) } : {}),
        accessToken,
        accessTokenExpiresInSec: 15 * 60,
        refreshToken: rotated.refreshToken,
        refreshTokenExpiresAt: rotated.expiresAt,
      });
      deps.attachSessionCookie(response, current.username, request);
      return response;
    } catch (error) {
      console.error('POST /api/auth/refresh error:', error);
      return NextResponse.json({ error: 'Failed to refresh session.' }, { status: 500 });
    }
  };
};
