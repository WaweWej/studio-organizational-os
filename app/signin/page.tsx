import { redirect } from 'next/navigation';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { loginProviders } from '@/lib/login-auth';
import './signin.css';
export const dynamic = 'force-dynamic';

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; return_to?: string }>;
}) {
  const user = await getChatGPTUser();
  if (user) redirect('/');
  const params = await searchParams;
  const providers = loginProviders();
  const returnTo = encodeURIComponent(
    params.return_to && params.return_to.startsWith('/') ? params.return_to : '/',
  );
  return (
    <main className="signin">
      <div className="signin-card">
        <p className="signin-mark">studio</p>
        <h1>Sign in to your workspace</h1>
        {params.error && <p className="signin-error">{params.error}</p>}
        {providers.github || providers.google ? (
          <div className="signin-actions">
            {providers.github && (
              <a href={`/api/auth/github?return_to=${returnTo}`}>
                Continue with GitHub
              </a>
            )}
            {providers.google && (
              <a href={`/api/auth/google?return_to=${returnTo}`}>
                Continue with Google
              </a>
            )}
          </div>
        ) : (
          <p className="signin-note">
            Sign-in is not configured yet. Set the GitHub or Google sign-in
            settings on this deployment — see docs/DEPLOY.md in the repository.
          </p>
        )}
      </div>
    </main>
  );
}
