import { execFile } from 'node:child_process';

/** Run a local engine, returning stdout (or null if the binary is absent / fails). */
export function runEngine(engine: 'codex' | 'claude', prompt: string): Promise<string | null> {
  const args = engine === 'codex' ? ['exec', prompt, '-s', 'read-only'] : ['-p', prompt];
  return new Promise((resolve) => {
    execFile(engine, args, { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

export function extractJson(s: string): unknown {
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j < 0) return null;
  try {
    return JSON.parse(s.slice(i, j + 1));
  } catch {
    return null;
  }
}
