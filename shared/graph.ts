import { z } from 'zod';
import type { DocSummary } from './buildTree';

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  category: string;
  tags: string[];
  cluster: string;
}
export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  kind: 'tag' | 'category';
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: { id: string; label: string }[];
}

/** zod schema so an LLM-produced graph (gdoc analyze --engine codex|claude) can be validated. */
export const graphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: z.string(),
      category: z.string(),
      tags: z.array(z.string()),
      cluster: z.string(),
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      weight: z.number(),
      kind: z.enum(['tag', 'category']),
    }),
  ),
  clusters: z.array(z.object({ id: z.string(), label: z.string() })),
});

/**
 * Deterministic tag-based graph: one node per doc, an edge between any two docs
 * that share ≥1 tag (weight = shared-tag count), clusters by category. This is the
 * reliable core; an LLM pass can enrich it (semantic edges, cluster names).
 */
export function buildGraph(docs: DocSummary[]): Graph {
  const nodes: GraphNode[] = docs.map((d) => ({
    id: d.id,
    label: d.title,
    type: d.type,
    category: d.category,
    tags: d.tags,
    cluster: d.category,
  }));

  const edges: GraphEdge[] = [];
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const shared = docs[i].tags.filter((t) => docs[j].tags.includes(t));
      if (shared.length > 0) {
        edges.push({ source: docs[i].id, target: docs[j].id, weight: shared.length, kind: 'tag' });
      }
    }
  }

  const cats = [...new Set(docs.map((d) => d.category))];
  return { nodes, edges, clusters: cats.map((c) => ({ id: c, label: c })) };
}
