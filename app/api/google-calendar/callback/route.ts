import { env } from 'cloudflare:workers';
import { context } from '@/lib/store';
import { finishGoogle, type GoogleConfig } from '@/lib/google-calendar-auth';
import { AppError } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Set-Cookie': `studio_google=; HttpOnly; SameSite=Lax; Path=/api/google-calendar; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`,
  };
  try {
    const c = await context();
    if (url.searchParams.has('error'))
      throw new AppError(
        'Google connection was cancelled. Return to Studio and try again.',
      );
    const secret =
      (request.headers.get('cookie') || '')
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('studio_google='))
        ?.slice('studio_google='.length) || '';
    await finishGoogle(
      c,
      env as unknown as GoogleConfig,
      url.searchParams.get('state') || '',
      secret,
      url.searchParams.get('code') || '',
    );
    return new Response(null, {
      status: 303,
      headers: { ...headers, Location: '/?view=calendar&google=connected' },
    });
  } catch (error) {
    return new Response(
      (error instanceof AppError
        ? error.message
        : 'Google Calendar could not connect. Please return to Studio and try again.') +
        '\n\nReturn to Studio: /?view=calendar',
      {
        status: error instanceof AppError ? error.status : 500,
        headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
      },
    );
  }
}
