import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { SearchIndex } from '../../shared/searchIndex';
import { sb } from './supabase';

/**
 * Load the content search index (doc id → plain text) from the private bucket.
 * Owner-only, like the graph. Stays null until loaded, or when absent/errored —
 * callers fall back to title-only search, so a missing index degrades gracefully.
 */
export function useSearchIndex(session: Session | null, enabled = true) {
  const [index, setIndex] = useState<SearchIndex | null>(null);

  useEffect(() => {
    if (!enabled || !session) {
      setIndex(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await sb.storage
        .from('private')
        .createSignedUrl('graph/search-index.json', 60);
      if (cancelled || error) return;
      const res = await fetch(data.signedUrl);
      const json = (await res.json()) as SearchIndex;
      if (!cancelled) setIndex(json);
    })().catch(() => {
      /* no index yet (run `gdoc analyze`) — fall back to title-only search */
    });
    return () => {
      cancelled = true;
    };
  }, [session, enabled]);

  return { index };
}
