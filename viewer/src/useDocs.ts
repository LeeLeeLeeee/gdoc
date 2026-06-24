import { useCallback, useEffect, useState } from 'react';
import { sb } from './supabase';
import type { DocSummary } from '../../shared/buildTree';

/**
 * Fetch document metadata. RLS returns public docs for anon, all docs for the
 * signed-in owner. Re-fetches whenever the auth state (`authKey`) changes.
 */
export function useDocs(authKey: string | null, enabled = true) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    sb.from('documents')
      .select('id,title,type,path,visibility,bucket,storage_key,tags,category,created_at,updated_at')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
        } else {
          setDocs(
            (data ?? []).map((r) => ({
              id: r.id,
              title: r.title,
              type: r.type,
              path: r.path,
              visibility: r.visibility,
              bucket: r.bucket,
              storageKey: r.storage_key,
              tags: r.tags ?? [],
              category: r.category,
              createdAt: r.created_at,
              updatedAt: r.updated_at,
            })),
          );
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authKey, enabled, reload]);

  const refetch = useCallback(() => {
    setReload((value) => value + 1);
  }, []);

  return { docs, loading, error, refetch };
}
