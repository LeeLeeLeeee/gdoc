import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';

export interface Highlight {
  id: string;
  doc_id: string;
  exact: string;
  prefix: string | null;
  suffix: string | null;
  text_pos: number | null;
  note: string | null;
  keywords: string[];
}

export type NewHighlight = Omit<Highlight, 'id'>;

export function useHighlights(docId: string | null, session: Session | null) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  const reload = useCallback(async () => {
    if (!docId || !session) { setHighlights([]); return; }
    const { data, error } = await sb
      .from('highlights').select('*').eq('doc_id', docId).order('created_at');
    if (!error && data) setHighlights(data as Highlight[]);
  }, [docId, session]);

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback(async (input: NewHighlight) => {
    if (!session) return null;
    const row = { ...input, owner_uid: session.user.id };
    const { data, error } = await sb.from('highlights').insert(row).select().single();
    if (error) throw new Error(error.message);
    setHighlights((h) => [...h, data as Highlight]);
    return data as Highlight;
  }, [session]);

  const update = useCallback(async (id: string, patch: Partial<Pick<Highlight, 'note' | 'keywords'>>) => {
    const { data, error } = await sb
      .from('highlights').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw new Error(error.message);
    setHighlights((h) => h.map((x) => (x.id === id ? (data as Highlight) : x)));
    return data as Highlight;
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await sb.from('highlights').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setHighlights((h) => h.filter((x) => x.id !== id));
  }, []);

  return { highlights, create, update, remove, reload };
}

/** All of the owner's highlights across every document (for the "모아보기" view). */
export function useAllHighlights(session: Session | null) {
  const [all, setAll] = useState<Highlight[]>([]);

  const reloadAll = useCallback(async () => {
    if (!session) { setAll([]); return; }
    const { data, error } = await sb
      .from('highlights').select('*').order('doc_id').order('created_at');
    if (!error && data) setAll(data as Highlight[]);
  }, [session]);

  useEffect(() => { reloadAll(); }, [reloadAll]);

  return { all, reloadAll };
}
