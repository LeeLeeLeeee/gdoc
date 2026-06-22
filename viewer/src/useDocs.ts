import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { DocSummary } from '../../shared/buildTree';

/**
 * Fetch document metadata. RLS returns public docs for anon, all docs for the
 * signed-in owner. Re-fetches whenever the auth state (`authKey`) changes.
 */
export function useDocs(authKey: string | null) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    sb.from('documents')
      .select('id,title,type,path,visibility,bucket,storage_key,tags,category')
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
            })),
          );
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authKey]);

  return { docs, loading, error };
}
