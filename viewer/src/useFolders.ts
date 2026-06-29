import { useCallback, useEffect, useState } from 'react';
import type { FolderSummary } from '../../shared/buildTree';
import { sb } from './supabase';

type FolderRow = {
  path: string;
  name: string;
  parent_path: string | null;
  created_at: string;
  updated_at: string;
};

function toFolderSummary(row: FolderRow): FolderSummary {
  return {
    path: row.path,
    name: row.name,
    parentPath: row.parent_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useFolders(ownerUid: string | null, enabled = true) {
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!enabled || !ownerUid) {
      setFolders([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    sb.from('document_folders')
      .select('path,name,parent_path,created_at,updated_at')
      .eq('owner_uid', ownerUid)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setFolders([]);
        } else {
          setFolders(((data ?? []) as FolderRow[]).map(toFolderSummary));
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, ownerUid, reload]);

  const refetch = useCallback(() => setReload((value) => value + 1), []);
  return { folders, loading, error, refetch };
}
