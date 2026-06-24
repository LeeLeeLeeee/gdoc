import { describe, it, expect } from 'vitest';
import { checkEnv, formatChecks } from './doctor';

const validEnv = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sk_real_service_role',
  VITE_SUPABASE_URL: 'https://abc.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'real_anon_key',
  OWNER_UID: '00000000-0000-0000-0000-000000000000',
};

describe('checkEnv', () => {
  it('passes a fully-configured env with no failures or warnings', () => {
    const checks = checkEnv(validEnv);
    expect(checks.some((c) => c.status === 'fail')).toBe(false);
    expect(checks.some((c) => c.status === 'warn')).toBe(false);
  });

  it('fails when a required var is missing', () => {
    const checks = checkEnv({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: undefined });
    const c = checks.find((c) => c.name === 'SUPABASE_SERVICE_ROLE_KEY');
    expect(c?.status).toBe('fail');
    expect(c?.fix).toBeTruthy();
  });

  it('treats the .env.example placeholders as not configured', () => {
    const checks = checkEnv({ ...validEnv, SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co' });
    expect(checks.find((c) => c.name === 'SUPABASE_URL')?.status).toBe('fail');
  });

  it('warns (not fails) when OWNER_UID is empty', () => {
    const checks = checkEnv({ ...validEnv, OWNER_UID: '' });
    expect(checks.find((c) => c.name === 'OWNER_UID')?.status).toBe('warn');
  });
});

describe('formatChecks', () => {
  it('marks ok checks with ✓ and failures with ✗', () => {
    const out = formatChecks([
      { name: 'A', status: 'ok', detail: 'fine' },
      { name: 'B', status: 'fail', detail: 'broken', fix: 'do X' },
    ]);
    expect(out).toContain('✓');
    expect(out).toContain('✗');
    expect(out).toContain('A');
    expect(out).toContain('B');
  });

  it('includes the fix hint for failing checks', () => {
    const out = formatChecks([{ name: 'B', status: 'fail', detail: 'broken', fix: 'run migrations' }]);
    expect(out).toContain('run migrations');
  });
});
