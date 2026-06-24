import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force';
import { select } from 'd3-selection';
import 'd3-transition'; // augments d3-selection's Selection with .transition() (used in resetView)
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import type { Session } from '@supabase/supabase-js';
import type { Graph } from '../../shared/graph';
import type { DocSummary } from '../../shared/buildTree';
import { useGraph } from './useGraph';

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
  const { graph, loading, msg } = useGraph(session);
  const [layout, setLayout] = useState<{ nodes: PNode[]; links: PLink[] } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const plotRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

  // wheel-zoom + drag-pan via d3-zoom (transform applied to the inner <g>)
  useEffect(() => {
    if (!svgRef.current || !plotRef.current || !layout?.nodes.length) return;
    const plot = select(plotRef.current);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (e) => plot.attr('transform', e.transform.toString()));
    zoomRef.current = z;
    const svg = select(svgRef.current);
    svg.call(z);
    return () => {
      svg.on('.zoom', null);
    };
  }, [layout?.nodes.length]);

  const resetView = () => {
    if (svgRef.current && zoomRef.current) {
      select(svgRef.current).transition().duration(250).call(zoomRef.current.transform, zoomIdentity);
    }
  };

  useEffect(() => {
    if (!graph) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    setLayout(null);
    const frame = requestAnimationFrame(() => {
      const ns = graph.nodes.map((n) => ({ ...n })) as PNode[];
      const ls = graph.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })) as unknown as PLink[];
      const sim = forceSimulation<PNode>(ns)
        .force('link', forceLink<PNode, PLink>(ls).id((n) => n.id).distance(96))
        .force('charge', forceManyBody<PNode>().strength(-280))
        .force('center', forceCenter<PNode>(W / 2, H / 2))
        .force('collide', forceCollide<PNode>(28))
        .stop();
      for (let i = 0; i < 320; i++) sim.tick();
      if (!cancelled) setLayout({ nodes: [...ns], links: [...ls] });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [graph]);

  if (!session) return <div className="center muted" style={{ textAlign: 'center', padding: 24 }}>로그인하면 지식 그래프를 볼 수 있어요</div>;
  if (msg) return <div className="center muted" style={{ textAlign: 'center', padding: 24 }}>{msg}</div>;
  if (loading || !graph || !layout?.nodes.length)
    return (
      <div className="pane-center">
        <div className="empty">
          <div className="spinner" />
          <div className="sub">그래프 구성 중…</div>
        </div>
      </div>
    );

  const { nodes, links } = layout;
  const clusters = [...new Set(graph.nodes.map((n) => n.cluster))];
  const color = (c: string) => PALETTE[Math.max(0, clusters.indexOf(c)) % PALETTE.length];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', cursor: 'grab', display: 'block' }}>
        <g ref={plotRef}>
          {links.map((l, i) => (
            <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
              stroke="rgba(255,255,255,.14)" strokeWidth={Math.min(l.weight, 4)} />
          ))}
          {nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: 'pointer' }}
              onClick={() => { const d = docById.get(n.id); if (d) onSelect(d); }}>
              <circle r={11} fill={color(n.cluster)} stroke="rgba(255,255,255,.3)" strokeWidth={1.5} />
              <text x={15} y={4} fontSize={12} fill="#c3c9db">{n.label}</text>
            </g>
          ))}
        </g>
      </svg>
      <div className="graph-hint">스크롤: 확대/축소 · 드래그: 이동</div>
      <button className="btn btn-ghost btn-pill-sm graph-reset" onClick={resetView}>초기화</button>
    </div>
  );
}
