import { describe, expect, it } from 'vitest';
import { buildShareUrl, isSharePath, shareTokenFromPath } from './shareLinks';

describe('shareLinks', () => {
  it('detects and extracts share tokens from viewer paths', () => {
    expect(isSharePath('/share/abc-123')).toBe(true);
    expect(shareTokenFromPath('/share/abc-123')).toBe('abc-123');
    expect(shareTokenFromPath('/share/abc-123/')).toBe('abc-123');
    expect(isSharePath('/docs/abc-123')).toBe(false);
    expect(shareTokenFromPath('/docs/abc-123')).toBeNull();
  });

  it('builds absolute share URLs without duplicating slashes', () => {
    expect(buildShareUrl('https://example.com/', 'tok_1')).toBe('https://example.com/share/tok_1');
    expect(buildShareUrl('https://example.com/app', 'tok_1')).toBe('https://example.com/app/share/tok_1');
  });
});
