import { describe, it, expect } from 'vitest';
import { unknownFlags } from './args';

describe('unknownFlags', () => {
  it('returns empty when there are no flags', () => {
    expect(unknownFlags(['upload', 'docs'], ['--auto-path'])).toEqual([]);
  });

  it('returns empty when every flag is allowed', () => {
    expect(unknownFlags(['docs', '--auto-path', '--dry-run'], ['--auto-path', '--dry-run'])).toEqual([]);
  });

  it('flags an unknown flag (typo) instead of ignoring it', () => {
    expect(unknownFlags(['docs', '--dr-run'], ['--auto-path', '--dry-run'])).toEqual(['--dr-run']);
  });

  it('returns only the unknown flags, never positionals', () => {
    expect(unknownFlags(['upload', 'docs', '--auto-path', '--nope'], ['--auto-path'])).toEqual(['--nope']);
  });
});
