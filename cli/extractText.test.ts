import { describe, it, expect } from 'vitest';
import { extractText } from './extractText';

const meta = { title: 'React use()', tags: ['react', 'suspense'], category: 'frontend' };

describe('extractText', () => {
  it('strips script/style and tags, keeps visible text', () => {
    const html = `<html><head><style>.x{color:red}</style><script>var a=1<2;</script></head>
      <body><h1>Title</h1><p>Hello&nbsp;world &amp; more</p></body></html>`;
    const t = extractText(html, meta);
    expect(t).not.toMatch(/color:red|var a=/);
    expect(t).toContain('Hello world & more');
    expect(t).toContain('Title');
  });

  it('prefixes title, category and tags', () => {
    const t = extractText('<p>body</p>', meta);
    expect(t.startsWith('React use() · frontend · react suspense')).toBe(true);
  });

  it('truncates to maxChars', () => {
    const t = extractText('<p>' + 'x'.repeat(9000) + '</p>', meta, 200);
    expect(t.length).toBeLessThanOrEqual(200);
  });
});
