import { useEffect, useState } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force';
import type { Session } from '@supabase/supabase-js';
import { graphSchema, type Graph } from '../../shared/graph';
import type { DocSummary } from '../../shared/buildTree';
import { sb } from './supabase';

const W = 820;
const H = 600;
const PALETTE = ['#1e6bff', '#2fd07a', '#ffb020', '#8b7cff', '#ff5a5f', '#6eadff'];

type PNode = Graph['nodes'][number] & { x: number; y: number };
type PLink = { source: PNode; target: PNode; weight: number };

/** Knowledge-graph view. Owner-only (graph.json lives in the private bucket). */
export function GraphView({
  session,
  docs,
  onSelect,
}: {
  session: Session | null;
  docs: DocSummary[];
  onSelect: (d: DocSummary) => void;
}) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [nodes, setNodes] = useState<PNode[]>([]);
  const [links, setLinks] = useState<PLink[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setMsg(null);
    setGraph(null);
    (async () => {
      const { data, error } = await sb.storage.from('private').createSignedUrl('graph/graph.json', 60);
      if (error) {
        setMsg('그래프가 아직 없습니다. 터미널에서 `bun run gdoc analyze`를 실행하세요.');
        return;
      }
      const res = await fetch(data.signedUrl);
      const parsed = graphSchema.safeParse(await res.json());
      if (!parsed.success) {
        setMsg('그래프 형식 오류');
        return;
      }
      if (!cancelled) setGraph(parsed.data);
    })().catch(() => setMsg('그래프를 불러오지 못했습니다.'));
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!graph) return;
    const ns = graph.nodes.map((n) => ({ ...n })) as PNode[];
    const ls = graph.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })) as unknown as PLink[];
    const sim = forceSimulation(ns as never)
      .force('link', forceLink(ls as never).id((n: never) => (n as PNode).id).distance(96))
      .force('charge', forceManyBody().strength(-280))
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide(28))
      .stop();
    for (let i = 0; i < 320; i++) sim.tick();
    setNodes([...ns]);
    setLinks([...ls]);
  }, [graph]);

  if (!session) return <div className="center muted" style={{ textAlign: 'center', padding: 24 }}>로그인하면 지식 그래프를 볼 수 있어요</div>;
  if (msg) return <div className="center muted" style={{ textAlign: 'center', padding: 24 }}>{msg}</div>;
  if (!graph || !nodes.length) return <div className="center muted" style={{ padding: 24 }}>그래프 구성 중…</div>;

  const clusters = [...new Set(graph.nodes.map((n) => n.cluster))];
  const color = (c: string) => PALETTE[Math.max(0, clusters.indexOf(c)) % PALETTE.length];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }}>
      {links.map((l, i) => (
        <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
          stroke="rgba(255,255,255,.14)" strokeWidth={Math.min(l.weight, 4)} />
      ))}
      {nodes.map((n) => (
        <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: 'pointer' }}
          onClick={() => { const d = docs.find((x) => x.id === n.id); if (d) onSelect(d); }}>
          <circle r={11} fill={color(n.cluster)} stroke="rgba(255,255,255,.3)" strokeWidth={1.5} />
          <text x={15} y={4} fontSize={12} fill="#c3c9db">{n.label}</text>
        </g>
      ))}
    </svg>
  );
}
