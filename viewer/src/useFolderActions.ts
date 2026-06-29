import { useCallback, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { DocSummary, FolderSummary } from '../../shared/buildTree';
import { supabaseUrl } from './supabase';
import { toDocSummary } from './useUpdateDocMeta';

type FolderRow = {
  path: string;
  name: string;
  parent_path?: string | null;
  parentPath?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

function toFolderSummary(row: FolderRow): FolderSummary {
  return {
    path: row.path,
    name: row.name,
    parentPath: row.parent_path ?? row.parentPath ?? null,
    createdAt: row.created_at ?? row.createdAt ?? '',
    updatedAt: row.updated_at ?? row.updatedAt ?? '',
  };
}

export function useFolderActions(session: Session | null) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invoke = useCallback(
    async <T,>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown): Promise<T> => {
      if (!session) throw new Error('로그인이 필요합니다.');
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/admin-docs/${path}`, {
          method,
          headers: {
            authorization: `Bearer ${session.access_token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? '폴더 작업에 실패했습니다.');
        return data as T;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [session],
  );

  const createFolder = useCallback(
    async (parentPath: string | null, name: string) => {
      const data = await invoke<{ folder: FolderRow }>('folders', 'POST', { parentPath, name });
      return toFolderSummary(data.folder);
    },
    [invoke],
  );

  const renameFolder = useCallback(
    async (oldPath: string, newName: string) => {
      const data = await invoke<{ folder: FolderRow; movedDocuments?: Parameters<typeof toDocSummary>[0][]; warnings: string[] }>('folders/rename', 'PATCH', {
        oldPath,
        newName,
      });
      return {
        folder: toFolderSummary(data.folder),
        movedDocuments: (data.movedDocuments ?? []).map(toDocSummary),
        warnings: data.warnings,
      };
    },
    [invoke],
  );

  const deleteFolder = useCallback(
    async (path: string) => {
      await invoke<{ warnings: string[] }>('folders', 'DELETE', { path });
    },
    [invoke],
  );

  const moveDocToFolder = useCallback(
    async (docId: string, targetFolderPath: string): Promise<DocSummary> => {
      const data = await invoke<{ document: Parameters<typeof toDocSummary>[0] }>(
        `docs/${encodeURIComponent(docId)}/move`,
        'PATCH',
        { targetFolderPath },
      );
      return toDocSummary(data.document);
    },
    [invoke],
  );

  return { createFolder, renameFolder, deleteFolder, moveDocToFolder, saving, error };
}
