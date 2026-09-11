import { clearSessionCookie } from '@/lib/session';
import { sameOrigin } from '@/lib/api-safety';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  sameOrigin(request);
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/signin',
      'Set-Cookie': clearSessionCookie,
      'Cache-Control': 'no-store',
    },
  });
}
