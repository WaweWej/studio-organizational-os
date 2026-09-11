import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// Local runtime settings. The inline binding config below bypasses Wrangler's
// own `.dev.vars` discovery, so load it here: KEY=VALUE lines, `#` comments.
// The file is gitignored; production values live in the hosting settings.
function localVars() {
  try {
    const lines = readFileSync('.dev.vars', 'utf8').split('\n');
    const vars: Record<string, string> = {};
    for (const line of lines) {
      const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !line.trimStart().startsWith('#'))
        vars[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
    }
    return vars;
  } catch {
    return {};
  }
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  vars: localVars(),
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    // Test copies may share dependencies, but must not share optimizer output.
    // Keep optimized packages under node_modules for Vinext's CJS transform.
    cacheDir: process.env.STUDIO_TEST_STATE ? 'node_modules/.vite-studio-tests' : 'node_modules/.vite',
    css: { postcss: { plugins: [tailwindcss()] } },
    // The API suites and documentation address the preview at localhost:5173.
    server: {
      port: Number(process.env.STUDIO_DEV_PORT) || 5173,
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        // Isolated end-to-end runs never use the owner's preview database.
        persistState: process.env.STUDIO_TEST_STATE
          ? { path: process.env.STUDIO_TEST_STATE }
          : true,
        inspectorPort: process.env.STUDIO_TEST_STATE ? false : undefined,
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
