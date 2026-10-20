
import { NextResponse } from 'next/server';
import { hashPassword } from '@/lib/password';
import { attachSessionCookie } from '@/lib/serverSession';
import { issueAuthTokens } from '@/lib/authTokens';
import { createAuthUser, isAuthDbConfigured, readAuthUserByUsernameOrEmail } from '@/lib/authUsersServer';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const requireBrevoConfig = () => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'Alleviate';
  if (!apiKey || !senderEmail) return null;
  return { apiKey, senderEmail, senderName };
};

const sendWelcomeEmail = async (email: string, username: string) => {
  const config = requireBrevoConfig();
  if (!config) return;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': config.apiKey },
    body: JSON.stringify({
      sender: { email: config.senderEmail, name: config.senderName },
      to: [{ email }],
      subject: 'Welcome to Alleviate',
      htmlContent: `<p>Welcome to Alleviate, ${username}! Your account is ready to use.</p>`,
      textContent: `Welcome to Alleviate, ${username}! Your account is ready to use.`,
    }),
  });
  if (!response.ok) throw new Error(`Welcome email failed: ${response.statusText}`);
};
export async function POST(request: Request) {
  const { username, password, email } = await request.json();

  if (!isAuthDbConfigured()) {
    return NextResponse.json(
      {
        error: 'Cloud authentication database is not configured for this build. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and run docs/auth-users.sql before first-time registration.',
        code: 'CLOUD_AUTH_UNAVAILABLE',
      },
      { status: 503 }
    );
  }

  if (!username || !password || !email) {
    return NextResponse.json({ error: 'Username, email, and password are required.' }, { status: 400 });
  }

  const normalizedUsername = String(username).trim().toLowerCase();
  const normalizedEmail = String(email).trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  try {
    const existingUsername = await readAuthUserByUsernameOrEmail(normalizedUsername, '');
    if (existingUsername) {
      return NextResponse.json({ error: 'That username is already registered. Try logging in or choose another username.' }, { status: 409 });
    }
    const existingEmail = await readAuthUserByUsernameOrEmail('', normalizedEmail);
    if (existingEmail) {
      return NextResponse.json({ error: 'That email is already registered. Try logging in or use another email.' }, { status: 409 });
    }

    await createAuthUser({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashPassword(password),
      createdAt: new Date().toISOString(),
    });

    try {
      await sendWelcomeEmail(normalizedEmail, normalizedUsername);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    const tokens = await issueAuthTokens(normalizedUsername);
    const response = NextResponse.json({
      success: true,
      message: 'Registration successful.',
      user: { username: normalizedUsername, email: normalizedEmail },
      ...tokens,
    });
    attachSessionCookie(response, normalizedUsername, request);
    return response;
  } catch (error) {
    console.error('Error in POST /api/auth/register:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    if (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('store has been suspended')) {
      return NextResponse.json(
        {
          error: 'Cloud registration is temporarily unavailable because the Supabase backend is suspended.',
          code: 'CLOUD_AUTH_SUSPENDED',
        },
        { status: 503 }
      );
    }
    if (/duplicate key value|unique constraint|23505/i.test(errorMessage)) {
      return NextResponse.json({ error: 'An account with that username or email already exists. Try logging in.' }, { status: 409 });
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}



