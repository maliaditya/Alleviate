
import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/serverSession';
import { verifyAccessToken } from '@/lib/authTokens';
import { isGitHubSettingsDbConfigured, readGitHubSettings, upsertGitHubSettings } from '@/lib/githubSettingsServer';

export const dynamic = 'force-dynamic';
const normalizeUsername = (username: string) => username.trim().toLowerCase();
const getAuthorizedUser = (request: Request) => {
  const sessionUser = getSessionUserFromRequest(request);
  if (sessionUser) return sessionUser;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const tokenPayload = bearer ? verifyAccessToken(bearer) : null;
  return tokenPayload?.sub?.trim().toLowerCase() || null;
};

/**
 * POST /api/github-settings
 * Saves a user's GitHub sync settings to the database.
 */
export async function POST(request: Request) {
  const {
    username,
    githubToken,
    githubOwner,
    githubRepo,
    githubPath,
    githubFetchMissingOnly,
    supabaseUrl,
    supabaseAnonKey,
    supabasePdfBucket,
  } = await request.json();

  if (!isGitHubSettingsDbConfigured()) {
    return NextResponse.json(
      { error: 'GitHub settings database is not configured on the server. Run docs/auth-users.sql after setting Supabase server credentials.' },
      { status: 500 }
    );
  }

  if (!username) {
    return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
  }

  const requestedUsername = normalizeUsername(username);
  const sessionUser = getAuthorizedUser(request);
  if (!sessionUser) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in again.' }, { status: 401 });
  }
  if (sessionUser !== requestedUsername) {
    return NextResponse.json({ error: 'Forbidden. You can only access your own settings.' }, { status: 403 });
  }
  try {
    await upsertGitHubSettings({
      username: requestedUsername,
      githubToken,
      githubOwner,
      githubRepo,
      githubPath,
      githubFetchMissingOnly,
      supabaseUrl,
      supabaseAnonKey,
      supabasePdfBucket,
    });

    return NextResponse.json({ success: true, message: 'GitHub settings saved.' });
  } catch (error) {
    console.error(`Error in POST /api/github-settings for user ${requestedUsername}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * GET /api/github-settings?username=<username>
 * Fetches a user's GitHub settings from the database.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  
  if (!isGitHubSettingsDbConfigured()) {
    return NextResponse.json(
      { error: 'GitHub settings database is not configured on the server. Run docs/auth-users.sql after setting Supabase server credentials.' },
      { status: 500 }
    );
  }

  if (!username) {
    return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
  }

  const requestedUsername = normalizeUsername(username);
  const sessionUser = getAuthorizedUser(request);
  if (!sessionUser) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in again.' }, { status: 401 });
  }
  if (sessionUser !== requestedUsername) {
    return NextResponse.json({ error: 'Forbidden. You can only access your own settings.' }, { status: 403 });
  }
  try {
    const settingsData = await readGitHubSettings(requestedUsername);
    if (!settingsData) {
      return NextResponse.json({ settings: null, message: "No GitHub settings found for this user." }, { status: 200 });
    }
    return NextResponse.json({ settings: settingsData });

  } catch (error: any) {
    console.error(`GitHub settings read error for user ${requestedUsername}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `Failed to read GitHub settings: ${errorMessage}` }, { status: 500 });
  }
}
