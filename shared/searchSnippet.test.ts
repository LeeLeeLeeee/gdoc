import { describe, it, expect } from 'vitest';
import { contentSnippet } from './searchSnippet';

describe('contentSnippet', () => {
  it('returns null when the query is not found', () => {
    expect(contentSnippet('the quick brown fox', 'cat')).toBeNull();
  });

  it('returns null for an empty or whitespace-only query', () => {
    expect(contentSnippet('anything', '')).toBeNull();
    expect(contentSnippet('anything', '   ')).toBeNull();
  });

  it('matches case-insensitively and preserves original case in the snippet', () => {
    const s = contentSnippet('Learning React Query caching', 'react query');
    expect(s).toContain('React Query');
  });

  it('adds leading and trailing ellipsis when the match is in the middle', () => {
    const text = 'a'.repeat(100) + ' needle ' + 'b'.repeat(100);
    const s = contentSnippet(text, 'needle', { radius: 10 })!;
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s).toContain('needle');
  });

  it('omits the leading ellipsis when the match is at the start', () => {
    const s = contentSnippet('needle in the haystack here', 'needle', { radius: 10 })!;
    expect(s.startsWith('…')).toBe(false);
    expect(s.startsWith('needle')).toBe(true);
  });

  it('omits the trailing ellipsis when the match is at the end', () => {
    const s = contentSnippet('find the needle', 'needle', { radius: 10 })!;
    expect(s.endsWith('…')).toBe(false);
    expect(s.endsWith('needle')).toBe(true);
  });

  it('collapses whitespace and newlines into single spaces', () => {
    const s = contentSnippet('hello\n\n   world   needle', 'world')!;
    expect(s).not.toMatch(/\s{2,}/);
    expect(s).not.toContain('\n');
  });

  it('matches Korean content', () => {
    const s = contentSnippet('리액트 쿼리 캐싱 전략 정리', '캐싱')!;
    expect(s).toContain('캐싱');
  });

  it('bounds the snippet width by radius (character count)', () => {
    const text = 'x'.repeat(50) + 'needle' + 'y'.repeat(50);
    const s = contentSnippet(text, 'needle', { radius: 5 })!;
    const core = s.replace(/…/g, '');
    expect(core.length).toBeLessThanOrEqual(5 + 'needle'.length + 5);
  });
});
