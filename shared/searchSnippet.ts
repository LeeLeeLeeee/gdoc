/**
 * Find `query` inside a document's plain text (case-insensitive) and return a short
 * snippet around the first match, with `…` where the text is trimmed. Returns null
 * when the query is empty/whitespace or not found. Whitespace is collapsed so the
 * snippet renders on one line. Used by the viewer's content search (E3).
 */
export function contentSnippet(
  text: string,
  query: string,
  opts: { radius?: number } = {},
): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return null;

  const radius = opts.radius ?? 40;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);

  const core = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${core}${end < text.length ? '…' : ''}`;
}

/**
 * Relevance score for ranking search results (0 = no match). A title hit dominates
 * (so title matches rank first), then content matches add by occurrence count, with a
 * small bonus for an earlier first match. Case-insensitive; `text` may be empty.
 */
export function searchScore(title: string, text: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  let score = 0;
  const t = title.toLowerCase();
  if (t.includes(q)) score += t === q ? 1100 : 1000;

  const lower = text.toLowerCase();
  let count = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) count++;
  if (count > 0) {
    score += count;
    score += Math.max(0, 1 - lower.indexOf(q) / Math.max(1, lower.length)); // earlier = slightly higher
  }
  return score;
}
