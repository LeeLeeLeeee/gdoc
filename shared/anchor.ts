export interface TextAnchor {
  exact: string;
  prefix: string;
  suffix: string;
  textPos: number;
}

export function extractAnchor(fullText: string, start: number, end: number, ctx = 32): TextAnchor {
  return {
    exact: fullText.slice(start, end),
    prefix: fullText.slice(Math.max(0, start - ctx), start),
    suffix: fullText.slice(end, end + ctx),
    textPos: start,
  };
}

/** All start indices of `needle` in `haystack`. */
function allIndexes(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return out;
}

export function locateAnchor(fullText: string, anchor: TextAnchor): { start: number; end: number } | null {
  const candidates = allIndexes(fullText, anchor.exact);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { start: candidates[0], end: candidates[0] + anchor.exact.length };
  }
  // score by prefix/suffix agreement, then proximity to textPos.
  let best = -1;
  let bestScore = -Infinity;
  for (const start of candidates) {
    const before = fullText.slice(Math.max(0, start - anchor.prefix.length), start);
    const after = fullText.slice(start + anchor.exact.length, start + anchor.exact.length + anchor.suffix.length);
    let score = 0;
    if (anchor.prefix && before.endsWith(anchor.prefix)) score += 2;
    if (anchor.suffix && after.startsWith(anchor.suffix)) score += 2;
    score -= Math.abs(start - anchor.textPos) / (fullText.length || 1); // tiebreak by closeness
    if (score > bestScore) {
      bestScore = score;
      best = start;
    }
  }
  return { start: best, end: best + anchor.exact.length };
}
