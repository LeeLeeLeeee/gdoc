import { spawnSync } from 'node:child_process';
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

function projectRefFromUrl(url) {
  const match = String(url ?? '').match(/^https:\/\/([^.]+)\.supabase\.co\/?$/);
  return match?.[1] ?? null;
}

function run(args, env) {
  console.log(`\n> npx supabase ${args.join(' ')}`);
  const result = spawnSync('npx', ['supabase', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const env = readEnv();
const projectRef = projectRefFromUrl(env.SUPABASE_URL ?? env.VITE_SUPABASE_URL);

if (!projectRef) {
  console.error('SUPABASE_URL 또는 VITE_SUPABASE_URL에서 project ref를 찾지 못했습니다.');
  process.exit(1);
}

if (!env.SUPABASE_ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN이 없습니다.');
  console.error('먼저 `npx supabase login`을 실행하거나 SUPABASE_ACCESS_TOKEN 환경변수를 설정하세요.');
  process.exit(1);
}

run(['link', '--project-ref', projectRef], env);
run(['db', 'push', '--yes'], env);
run(['functions', 'deploy', 'admin-docs', '--project-ref', projectRef], env);

console.log('\nSupabase migration/function deploy completed.');
