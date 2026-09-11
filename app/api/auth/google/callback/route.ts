import { env } from 'cloudflare:workers';
import { googleUserFromCode } from '@/lib/login-auth';
import { createSession, verifyState } from '@/lib/session';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = { db: env.DB };
  const state = await verifyState(db, url.searchParams.get('state') || '');
  const code = url.searchParams.get('code');
  try {
    if (!state || !code) throw new Error('The sign-in link expired. Try again.');
    const user = await googleUserFromCode(url.origin, code);
    return new Response(null, {
      status: 303,
      headers: {
        Location: state.returnTo,
        'Set-Cookie': await createSession(db, user),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sign-in failed.';
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/signin?error=' + encodeURIComponent(message),
        'Cache-Control': 'no-store',
      },
    });
  }
}
