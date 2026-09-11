import { redirect } from 'next/navigation';
import Studio from './studio';
import { context } from '@/lib/store';
import { loginProviders } from '@/lib/login-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  try {
    await context();
  } catch {
    const providers = loginProviders();
    if (providers.github || providers.google) redirect('/signin');
  }
  return <Studio />;
}
