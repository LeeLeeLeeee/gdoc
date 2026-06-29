import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';

/** Run a local engine, returning stdout (or null if the binary is absent / fails). */
export function runEngine(engine: 'codex' | 'claude', prompt: string, timeoutMs = 120_000): Promise<string | null> {
  // The prompt goes via STDIN, not argv: on Windows these CLIs are .cmd shims run
  // through cmd.exe, which splits an argv containing newlines — mangling multi-line
  // prompts. Both `codex exec` and `claude -p` read the prompt from stdin.
  // timeoutMs: short for tiny prompts (auto-path); document edits need much longer.
  const args = engine === 'codex' ? ['exec', '-s', 'read-only', '--skip-git-repo-check'] : ['-p'];
  return new Promise((resolve) => {
    // Run in a neutral cwd: codex `exec` is agentic and would otherwise explore the
    // current repo and answer about it instead of the self-contained prompt.
    const cp = execFile(engine, args, { cwd: tmpdir(), maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
    cp.stdin?.end(prompt + '\n');
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
