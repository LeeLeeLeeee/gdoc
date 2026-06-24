import { createClient } from '@supabase/supabase-js';
import { buildSemanticGraph } from '../shared/graph';
import type { DocSummary } from '../shared/buildTree';
import { extractText } from './extractText';
import { embedTexts, EMBED_MODEL, EMBED_DIM } from './embed';
import { planEmbeddings, emptyCache, type EmbedCache } from './embedCache';
import { mergeSearchIndex, type SearchIndex } from '../shared/searchIndex';

type Doc = DocSummary & { contentHash: string };

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}
type SB = ReturnType<typeof client>;

async function fetchDocs(sb: SB): Promise<Doc[]> {
  const { data, error } = await sb
    .from('documents')
    .select('id,title,type,path,visibility,bucket,storage_key,tags,category,created_at,updated_at,content_hash');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, title: r.title, type: r.type, path: r.path,
    visibility: r.visibility, bucket: r.bucket, storageKey: r.storage_key,
    tags: r.tags ?? [], category: r.category, createdAt: r.created_at, updatedAt: r.updated_at,
    contentHash: r.content_hash ?? '',
  }));
}

async function loadCache(sb: SB): Promise<EmbedCache> {
  const { data, error } = await sb.storage.from('private').download('graph/embeddings.json');
  if (error || !data) return emptyCache(EMBED_MODEL, EMBED_DIM);
  try {
    return JSON.parse(await data.text()) as EmbedCache;
  } catch {
    return emptyCache(EMBED_MODEL, EMBED_DIM);
  }
}

async function loadSearchIndex(sb: SB): Promise<SearchIndex> {
  const { data, error } = await sb.storage.from('private').download('graph/search-index.json');
  if (error || !data) return {};
  try {
    return JSON.parse(await data.text()) as SearchIndex;
  } catch {
    return {};
  }
}

/** Download a doc's HTML and reduce it to embedding text. */
async function docText(sb: SB, d: Doc): Promise<string> {
  const { data, error } = await sb.storage.from(d.bucket).download(d.storageKey);
  if (error || !data) throw new Error(`download ${d.bucket}/${d.storageKey}: ${error?.message ?? 'no data'}`);
  return extractText(await data.text(), { title: d.title, tags: d.tags, category: d.category });
}

async function putJson(sb: SB, path: string, body: string) {
  const blob = new Blob([body], { type: 'application/json; charset=utf-8' });
  const { error } = await sb.storage.from('private').upload(path, blob, {
    contentType: 'application/json; charset=utf-8',
    upsert: true,
  });
  if (error) throw error;
}

/**
 * `gdoc analyze` — build the knowledge graph from embeddings of each doc (semantic
 * similarity edges + clusters) and a content search index. Incremental: a doc is only
 * re-embedded when its content_hash changes; if nothing changed and the index is
 * complete, everything is left as-is.
 * Outputs (owner-only, private bucket): graph/graph.json, graph/embeddings.json cache,
 * graph/search-index.json (doc id → plain text, for viewer content search).
 */
export async function analyze() {
  const sb = client();
  const docs = await fetchDocs(sb);
  if (docs.length === 0) {
    console.error('No documents to analyze.');
    process.exit(1);
  }

  const cache = await loadCache(sb);
  const plan = planEmbeddings(docs.map((d) => ({ id: d.id, contentHash: d.contentHash })), cache, EMBED_MODEL);
  const searchIndex = await loadSearchIndex(sb);

  // Text to (re)fetch: docs being embedded (new/changed) + any not yet in the search
  // index (first-time backfill). Reused, already-indexed docs are skipped.
  const needTextIds = new Set<string>(plan.toEmbed);
  for (const d of docs) if (!(d.id in searchIndex)) needTextIds.add(d.id);
  const needText = docs.filter((d) => needTextIds.has(d.id));

  if (!plan.changed && needText.length === 0) {
    console.log(`변경된 문서 없음 — 그래프·검색 인덱스 유지 (문서 ${docs.length}개). 호출 생략.`);
    return;
  }

  const textById: Record<string, string> = {};
  await Promise.all(needText.map(async (d) => { textById[d.id] = await docText(sb, d); }));

  // Search index: refreshed incrementally (cheap; powers viewer content search).
  const fresh: Record<string, string> = {};
  for (const d of needText) fresh[d.id] = textById[d.id];
  const nextIndex = mergeSearchIndex(searchIndex, fresh, plan.removed);
  await putJson(sb, 'graph/search-index.json', JSON.stringify(nextIndex));

  // Embeddings + graph: only when content actually changed.
  if (plan.changed) {
    const toEmbed = docs.filter((d) => plan.toEmbed.includes(d.id));
    console.log(
      `임베딩 ${toEmbed.length}개 (재사용 ${Object.keys(plan.reuse).length}` +
        `${plan.removed.length ? `, 삭제 ${plan.removed.length}` : ''})…`,
    );
    const vectors = await embedTexts(toEmbed.map((d) => textById[d.id]));
    const vectorsById: Record<string, number[]> = { ...plan.reuse };
    toEmbed.forEach((d, i) => (vectorsById[d.id] = vectors[i]));

    const nextCache: EmbedCache = { model: EMBED_MODEL, dim: EMBED_DIM, docs: {} };
    for (const d of docs) nextCache.docs[d.id] = { hash: d.contentHash, vector: vectorsById[d.id] };
    await putJson(sb, 'graph/embeddings.json', JSON.stringify(nextCache));

    const graph = buildSemanticGraph(docs, vectorsById);
    await putJson(sb, 'graph/graph.json', JSON.stringify(graph, null, 2));
    console.log(
      `✓ graph.json — ${graph.nodes.length} nodes, ${graph.edges.length} edges, ` +
        `${graph.clusters.length} clusters (embeddings: ${EMBED_MODEL})`,
    );
  }

  console.log(`✓ search-index.json — ${Object.keys(nextIndex).length} docs`);
}
