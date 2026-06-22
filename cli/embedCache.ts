/** Sidecar embedding cache (stored at private/graph/embeddings.json). One vector per
 *  doc, tagged with the content_hash it was computed from — so a re-run only embeds
 *  docs whose content changed. */
export interface EmbedCache {
  model: string;
  dim: number;
  docs: Record<string, { hash: string; vector: number[] }>;
}

export interface DocRef {
  id: string;
  contentHash: string;
}

export interface EmbedPlan {
  reuse: Record<string, number[]>; // docId -> cached vector (hash still matches)
  toEmbed: string[]; // docIds whose content changed or are new
  removed: string[]; // cached docIds no longer present
  changed: boolean; // anything to (re)embed or remove?
}

export function emptyCache(model: string, dim: number): EmbedCache {
  return { model, dim, docs: {} };
}

/**
 * Decide, per doc, whether its cached embedding can be reused. A cache built by a
 * different model is discarded wholesale (every doc re-embeds).
 */
export function planEmbeddings(docs: DocRef[], cache: EmbedCache, model: string): EmbedPlan {
  const usable = cache.model === model ? cache.docs : {};
  const reuse: Record<string, number[]> = {};
  const toEmbed: string[] = [];
  for (const d of docs) {
    const hit = usable[d.id];
    if (hit && hit.hash === d.contentHash) reuse[d.id] = hit.vector;
    else toEmbed.push(d.id);
  }
  const present = new Set(docs.map((d) => d.id));
  const removed = Object.keys(usable).filter((id) => !present.has(id));
  return { reuse, toEmbed, removed, changed: toEmbed.length > 0 || removed.length > 0 };
}
