import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { graphSchema, type Graph } from '../../shared/graph';
import { sb } from './supabase';

export function useGraph(session: Session | null) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setGraph(null);
      setLoading(false);
      setMsg(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMsg(null);
    setGraph(null);

    (async () => {
      const { data, error } = await sb.storage.from('private').createSignedUrl('graph/graph.json', 60);
      if (cancelled) return;
      if (error) {
        setMsg('그래프가 아직 없습니다. 터미널에서 `bun run gdoc analyze`를 실행하세요.');
        setLoading(false);
        return;
      }

      const res = await fetch(data.signedUrl);
      const parsed = graphSchema.safeParse(await res.json());
      if (cancelled) return;
      if (!parsed.success) {
        setMsg('그래프 형식 오류');
        setLoading(false);
        return;
      }

      setGraph(parsed.data);
      setLoading(false);
    })().catch(() => {
      if (cancelled) return;
      setMsg('그래프를 불러오지 못했습니다.');
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return { graph, loading, msg };
}
