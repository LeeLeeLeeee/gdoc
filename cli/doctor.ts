import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';

/** One preflight check result. `fix` tells the owner how to resolve a fail/warn. */
export type Check = {
  name: string;
  status: 'ok' | 'fail' | 'warn';
  detail: string;
  fix?: string;
};

// .env.example ships placeholder values; treat them as "not configured" so a
// half-filled .env fails loudly instead of erroring mid-upload.
const PLACEHOLDER = /YOUR_PROJECT|your_.*_here|your_service_role_key|your_anon_key/i;
const unset = (v?: string) => !v || !v.trim() || PLACEHOLDER.test(v);

const REQUIRED: [string, string][] = [
  ['SUPABASE_URL', 'CLI가 Supabase에 연결'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'CLI 업로드(서버 키)'],
  ['VITE_SUPABASE_URL', '뷰어가 Supabase에 연결'],
  ['VITE_SUPABASE_ANON_KEY', '뷰어 읽기(익명 키)'],
];

/** Pure env-var audit: required CLI/viewer vars + the OWNER_UID footgun. */
export function checkEnv(env: Record<string, string | undefined>): Check[] {
  const checks: Check[] = REQUIRED.map(([key, why]) =>
    unset(env[key])
      ? { name: key, status: 'fail', detail: `없음 — ${why}`, fix: `.env에 ${key} 채우기` }
      : { name: key, status: 'ok', detail: '설정됨' },
  );
  checks.push(
    unset(env.OWNER_UID)
      ? {
          name: 'OWNER_UID',
          status: 'warn',
          detail: '비어 있음 — 비공개 문서가 소유자에게도 안 보임',
          fix: 'Supabase 대시보드 → Auth → 본인 user id를 .env OWNER_UID에 넣고 재업로드',
        }
      : { name: 'OWNER_UID', status: 'ok', detail: '설정됨' },
  );
  return checks;
}

const ICON = { ok: '✓', fail: '✗', warn: '!' } as const;

/** Pure render of checks to a printable report. */
export function formatChecks(checks: Check[]): string {
  return checks
    .map((c) => {
      const head = `${ICON[c.status]} ${c.name} — ${c.detail}`;
      return c.fix && c.status !== 'ok' ? `${head}\n    고치기: ${c.fix}` : head;
    })
    .join('\n');
}

function checkNode(): Promise<Check> {
  return new Promise((resolve) => {
    try {
      const p = spawn('node', ['--version']);
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('error', () =>
        resolve({
          name: 'node (analyze 임베딩용)',
          status: 'warn',
          detail: 'PATH에 없음 — gdoc analyze 임베딩 불가',
          fix: 'Node 설치 후 PATH에 추가',
        }),
      );
      p.on('close', (code) =>
        resolve(
          code === 0
            ? { name: 'node (analyze 임베딩용)', status: 'ok', detail: out.trim() }
            : { name: 'node (analyze 임베딩용)', status: 'warn', detail: `종료 코드 ${code}` },
        ),
      );
    } catch {
      resolve({ name: 'node (analyze 임베딩용)', status: 'warn', detail: '확인 실패' });
    }
  });
}

/**
 * `gdoc doctor` — preflight the setup before the owner hits a mid-upload error:
 * env vars, Supabase connectivity, the documents table, the public/private buckets,
 * and node availability for embeddings. Exits non-zero if any check fails.
 */
export async function doctor() {
  const env = process.env;
  const checks = checkEnv(env);

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!unset(url) && !unset(key)) {
    const sb = createClient(url!, key!, { auth: { persistSession: false } });
    try {
      const { error } = await sb.from('documents').select('id').limit(1);
      checks.push(
        error
          ? { name: 'documents 테이블', status: 'fail', detail: error.message, fix: 'supabase/migrations/*.sql을 순서대로 적용' }
          : { name: 'documents 테이블', status: 'ok', detail: '쿼리 성공' },
      );
    } catch (e) {
      checks.push({ name: 'Supabase 연결', status: 'fail', detail: (e as Error).message, fix: 'SUPABASE_URL/키 확인' });
    }
    try {
      const { data, error } = await sb.storage.listBuckets();
      if (error) {
        checks.push({ name: 'Storage 버킷', status: 'fail', detail: error.message });
      } else {
        const names = new Set((data ?? []).map((b) => b.name));
        for (const b of ['public', 'private']) {
          checks.push(
            names.has(b)
              ? { name: `버킷 '${b}'`, status: 'ok', detail: '존재' }
              : { name: `버킷 '${b}'`, status: 'fail', detail: '없음', fix: `Supabase Storage에 '${b}' 버킷 생성 (마이그레이션 0001)` },
          );
        }
      }
    } catch (e) {
      checks.push({ name: 'Storage 버킷', status: 'fail', detail: (e as Error).message });
    }
  }

  checks.push(await checkNode());

  console.log(formatChecks(checks));
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  console.log(`\n${failed ? `✗ ${failed}개 실패` : '✓ 모든 필수 항목 통과'}${warned ? `, ! ${warned}개 경고` : ''}`);
  if (failed > 0) process.exit(1);
}
