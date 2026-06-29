import { existsSync, readFileSync } from 'node:fs';

function readEnv() {
  const values = { ...process.env };
  if (!existsSync('.env')) return values;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (values[key]) continue;
    values[key] = raw.replace(/^["']|["']$/g, '');
  }
  return values;
}

async function checkRestTable(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  return { name: table, ok: res.ok, status: res.status, body: await res.text() };
}

async function checkFunction(url) {
  const options = await fetch(`${url}/functions/v1/admin-docs`, { method: 'OPTIONS' });
  if (!options.ok) return { name: 'admin-docs:options', ok: false, status: options.status, body: await options.text() };

  const res = await fetch(`${url}/functions/v1/admin-docs`);
  const body = await res.text();
  return {
    name: 'admin-docs',
    ok: res.status === 401,
    status: res.status,
    body,
  };
}

async function checkSharedFunction(url) {
  const res = await fetch(`${url}/functions/v1/shared-docs/not-a-real-token`);
  const body = await res.text();
  return {
    name: 'shared-docs',
    ok: res.status === 404 && body.includes('Share link not found'),
    status: res.status,
    body,
  };
}

const env = readEnv();
const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  process.exit(1);
}

const checks = [
  await checkRestTable(url, key, 'documents'),
  await checkRestTable(url, key, 'document_folders'),
  await checkRestTable(url, key, 'document_share_links'),
  await checkFunction(url),
  await checkSharedFunction(url),
];

let failed = false;
for (const check of checks) {
  const status = check.ok ? 'ok' : 'fail';
  console.log(`${status} ${check.name} (${check.status})`);
  if (!check.ok) {
    failed = true;
    console.log(check.body.slice(0, 500));
  }
}

if (failed) process.exit(1);
