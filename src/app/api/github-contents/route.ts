import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/serverSession';
import { verifyAccessToken } from '@/lib/authTokens';

export const dynamic = 'force-dynamic';

const normalize = (value: string | null) => String(value || '').trim();
const normalizeGitHubToken = (value: string | null) => normalize(value).replace(/^Bearer\s+/i, '').replace(/^token\s+/i, '').trim();
const normalizeUser = (value: string | null) => normalize(value).toLowerCase();
const getAuthorizedUser = (request: Request) => {
  const sessionUser = getSessionUserFromRequest(request);
  if (sessionUser) return sessionUser;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const tokenPayload = bearer ? verifyAccessToken(bearer) : null;
  return tokenPayload?.sub?.trim().toLowerCase() || null;
};

const buildGitHubUrl = (owner: string, repo: string, path: string, searchParams: URLSearchParams) => {
  // Support different API endpoints by checking the path prefix
  // Paths like "git/blobs/sha" or "contents/file.json" will be handled appropriately
  let apiPath = path;
  
  // If path doesn't start with a known API endpoint, assume it's a /contents path
  if (!path.startsWith('git/') && !path.startsWith('contents/')) {
    apiPath = `contents/${path}`;
  }

  const encodedPath = apiPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const perPage = normalize(searchParams.get('per_page'));
  const page = normalize(searchParams.get('page'));
  const qs = new URLSearchParams();
  if (perPage) qs.set('per_page', perPage);
  if (page) qs.set('page', page);
  const tail = qs.toString();
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodedPath}${tail ? `?${tail}` : ''}`;
};

async function forward(request: Request) {
  try {
    const url = new URL(request.url);
    const owner = normalize(url.searchParams.get('owner'));
    const repo = normalize(url.searchParams.get('repo'));
    const path = normalize(url.searchParams.get('path'));
    const username = normalizeUser(url.searchParams.get('username'));
    const sessionUser = getAuthorizedUser(request);

    if (!owner || !repo || !path || !username) {
      return NextResponse.json({ error: 'owner, repo, path, and username are required.' }, { status: 400 });
    }
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in again.' }, { status: 401 });
    }
    if (sessionUser !== username) {
      return NextResponse.json({ error: 'Forbidden. You can only access your own GitHub sync settings.' }, { status: 403 });
    }

    let token = normalizeGitHubToken(request.headers.get('x-github-token'));
    let bodyText: string | undefined;
    if (request.method === 'GET') {
      token = token || normalizeGitHubToken(url.searchParams.get('token'));
    } else {
      const raw = await request.text();
      bodyText = raw || undefined;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown> & { token?: string };
          if (!token) {
            token = normalize(parsed?.token ?? '');
          }
          if ('token' in parsed) {
            delete parsed.token;
            bodyText = JSON.stringify(parsed);
          }
        } catch {
          if (!token) token = '';
        }
      }
    }
    if (!token) {
      return NextResponse.json({ error: 'GitHub token is required.' }, { status: 400 });
    }

    const githubUrl = buildGitHubUrl(owner, repo, path, url.searchParams);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: request.method === 'GET' && url.searchParams.get('raw') === '1' ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'User-Agent': 'dock-sync-proxy',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (request.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    let upstream: Response | null = null;
    let lastFetchError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        upstream = await fetch(githubUrl, {
          method: request.method,
          headers,
          body: request.method === 'GET' ? undefined : bodyText,
        });
        break;
      } catch (error) {
        lastFetchError = error;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
          continue;
        }
      }
    }
    if (!upstream) {
      const message = lastFetchError instanceof Error ? lastFetchError.message : 'Upstream GitHub fetch failed.';
      return NextResponse.json({ error: message }, { status: 502 });
    }
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': contentType },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub proxy request failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return forward(request);
}

export async function PUT(request: Request) {
  return forward(request);
}

export async function DELETE(request: Request) {
  return forward(request);
}
