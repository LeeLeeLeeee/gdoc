import { describe, it, expect } from 'vitest';
import { extractAnchor, locateAnchor } from './anchor';

const TEXT = 'The quick brown fox jumps over the lazy dog and the quick cat.';

describe('extractAnchor', () => {
  it('captures exact text plus surrounding context', () => {
    const start = TEXT.indexOf('brown fox');
    const a = extractAnchor(TEXT, start, start + 'brown fox'.length, 5);
    expect(a.exact).toBe('brown fox');
    expect(a.prefix).toBe('uick ');
    expect(a.suffix).toBe(' jump');
    expect(a.textPos).toBe(start);
  });
});

describe('locateAnchor', () => {
  it('relocates a unique match', () => {
    const start = TEXT.indexOf('lazy dog');
    const a = extractAnchor(TEXT, start, start + 'lazy dog'.length);
    expect(locateAnchor(TEXT, a)).toEqual({ start, end: start + 'lazy dog'.length });
  });

  it('disambiguates repeated exact text via prefix/suffix', () => {
    // "quick" appears twice; prefix/suffix should pick the second.
    const second = TEXT.lastIndexOf('quick');
    const a = extractAnchor(TEXT, second, second + 'quick'.length, 6);
    expect(locateAnchor(TEXT, a)).toEqual({ start: second, end: second + 'quick'.length });
  });

  it('returns null when the exact text is gone (orphaned)', () => {
    const a = extractAnchor(TEXT, 0, 3);
    expect(locateAnchor('completely different content', a)).toBeNull();
  });

  it('falls back to nearest occurrence using textPos when context shifted', () => {
    const start = TEXT.indexOf('the lazy');
    const a = extractAnchor(TEXT, start, start + 3, 4); // exact "the"
    // "the" repeats; with prefix/suffix slightly changed, textPos breaks the tie.
    const moved = 'x' + TEXT; // shift everything by 1
    const hit = locateAnchor(moved, { ...a, textPos: a.textPos + 1 });
    expect(hit).not.toBeNull();
    expect(moved.slice(hit!.start, hit!.end)).toBe('the');
  });
});
