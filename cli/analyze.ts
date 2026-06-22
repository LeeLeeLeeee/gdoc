import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { buildGraph, graphSchema, type Graph } from '../shared/graph';
import type { DocSummary } from '../shared/buildTree';

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchDocs(sb: ReturnType<typeof client>): Promise<DocSummary[]> {
  const { data, error } = await sb
    .from('documents')
    .select('id,title,type,path,visibility,bucket,storage_key,tags,category,created_at,updated_at');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, title: r.title, type: r.type, path: r.path,
    visibility: r.visibility, bucket: r.bucket, storageKey: r.storage_key,
    tags: r.tags ?? [], category: r.category, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

/** Run a local engine, returning stdout (or null if the binary is absent / fails). */
function runEngine(engine: 'codex' | 'claude', prompt: string): Promise<string | null> {
  const args = engine === 'codex' ? ['exec', prompt, '-s', 'read-only'] : ['-p', prompt];
  return new Promise((resolve) => {
    execFile(engine, args, { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

function extractJson(s: string): unknown {
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j < 0) return null;
  try {
    return JSON.parse(s.slice(i, j + 1));
  } catch {
    return null;
  }
}

/** Best-effort LLM enrichment (cluster names + semantic edges). Falls back to the deterministic graph. */
async function enrich(graph: Graph, docs: DocSummary[]): Promise<{ graph: Graph; engine: string }> {
  const docList = docs.map((d) => ({ id: d.id, title: d.title, type: d.type, category: d.category, tags: d.tags }));
  const prompt = [
    'You build a knowledge graph from personal documents. Use ONLY the metadata below (titles, tags, category).',
    'Improve the given deterministic tag-graph: add meaningful semantic edges between related docs and give clusters human-friendly Korean labels.',
    'Return STRICT JSON ONLY, matching exactly this shape: {"nodes":[{"id","label","type","category","tags":[],"cluster"}],"edges":[{"source","target","weight":number,"kind":"tag"|"category"}],"clusters":[{"id","label"}]}.',
    'Every edge source/target MUST be an existing node id. No prose, JSON only.',
    `DOCS: ${JSON.stringify(docList)}`,
    `BASE_GRAPH: ${JSON.stringify(graph)}`,
  ].join('\n\n');

  for (const engine of ['codex', 'claude'] as const) {
    const out = await runEngine(engine, prompt);
    if (!out) continue;
    const parsed = graphSchema.safeParse(extractJson(out));
    if (parsed.success && parsed.data.nodes.length === graph.nodes.length) {
      return { graph: parsed.data, engine };
    }
  }
  return { graph, engine: 'deterministic' };
}

/** `gdoc analyze` — build the knowledge graph from all docs and store it (owner-only, private bucket). */
export async function analyze() {
  const sb = client();
  const docs = await fetchDocs(sb);
  if (docs.length === 0) {
    console.error('No documents to analyze.');
    process.exit(1);
  }

  const base = buildGraph(docs);
  const { graph, engine } = await enrich(base, docs);

  const body = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
  const { error } = await sb.storage.from('private').upload('graph/graph.json', body, {
    contentType: 'application/json; charset=utf-8',
    upsert: true,
  });
  if (error) throw error;

  console.log(
    `✓ graph.json → private/graph/graph.json — ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.clusters.length} clusters (engine: ${engine})`,
  );
}
