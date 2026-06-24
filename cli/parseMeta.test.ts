import { describe, it, expect } from 'vitest';
import { parseMeta } from './parseMeta';

const metaBlock = (json: string) =>
  `<!doctype html><html><head>
   <script type="application/json" id="gdoc-meta">${json}</script>
   </head><body>hi</body></html>`;

const validJson = JSON.stringify({
  type: 'tech-note',
  title: 'React Query 캐싱',
  category: 'frontend',
  createdAt: '2026-06-22T12:00:00Z',
  path: 'playground/tech-notes/react-query',
});

describe('parseMeta', () => {
  it('extracts and validates a valid gdoc-meta block', () => {
    const result = parseMeta(metaBlock(validJson));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.meta.title).toBe('React Query 캐싱');
      expect(result.meta.visibility).toBe('private'); // schema default
    }
  });

  it('skips when there is no gdoc-meta block', () => {
    const result = parseMeta('<html><head></head><body>no meta</body></html>');
    expect(result).toEqual({ status: 'skip', reason: 'no-meta-block' });
  });

  it('skips when the block contains malformed JSON, with a reason detail', () => {
    const result = parseMeta(metaBlock('{ not: valid json, }'));
    expect(result.status).toBe('skip');
    if (result.status === 'skip') {
      expect(result.reason).toBe('invalid-json');
      expect(result.detail).toBeTruthy();
    }
  });

  it('throws when JSON is valid but a required field is missing', () => {
    const noTitle = JSON.stringify({
      type: 'tech-note',
      category: 'frontend',
      createdAt: '2026-06-22T12:00:00Z',
    });
    expect(() => parseMeta(metaBlock(noTitle))).toThrow();
  });

  it('ignores unrelated script tags', () => {
    const html = `<html><head>
      <script type="application/json" id="something-else">{"x":1}</script>
      <script type="application/json" id="gdoc-meta">${validJson}</script>
      </head></html>`;
    const result = parseMeta(html);
    expect(result.status).toBe('ok');
  });
});
