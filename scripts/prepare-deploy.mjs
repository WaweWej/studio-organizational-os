// Prepare the built worker for a self-hosted Cloudflare deployment.
// vinext build emits dist/server/wrangler.json aimed at local development;
// this script rewrites it for production: the studio worker name, the real
// D1 database, the R2 bucket, the migrations directory, and no baked-in
// variables (configuration lives in Cloudflare settings, never in the
// artifact). Usage:
//   node scripts/prepare-deploy.mjs <database_id>
import { readFileSync, writeFileSync } from 'node:fs';

const databaseId = process.argv[2];
if (!databaseId || !/^[0-9a-f-]{36}$/.test(databaseId)) {
  console.error('Usage: node scripts/prepare-deploy.mjs <d1 database id>');
  process.exit(1);
}
const path = 'dist/server/wrangler.json';
const config = JSON.parse(readFileSync(path, 'utf8'));

config.name = 'studio';
config.vars = {};
delete config.dev;
config.d1_databases = [
  {
    binding: 'DB',
    database_name: 'studio-d1',
    database_id: databaseId,
    migrations_dir: '../../drizzle',
  },
];
config.r2_buckets = [{ binding: 'ASSETS', bucket_name: 'studio-r2' }];
config.workers_dev = true;

writeFileSync(path, JSON.stringify(config, null, 2));
console.log('prepared: studio worker, d1 ' + databaseId + ', r2 studio-r2');
