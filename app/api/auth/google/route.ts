import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { googleLoginConfigured, googleAuthorizeUrl } from '@/lib/login-auth';
import { signState, safeReturnPath } from '@/lib/session';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!googleLoginConfigured())
    return Response.json(
      { error: 'Google sign-in is not configured.' },
      { status: 404 },
    );
  const url = new URL(request.url);
  const state = await signState(
    { db: env.DB },
    safeReturnPath(url.searchParams.get('return_to')),
  );
  redirect(googleAuthorizeUrl(url.origin, state));
}
