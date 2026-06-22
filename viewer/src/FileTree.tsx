import { useEffect } from 'react';
import {
  FileTree as PierreFileTree,
  useFileTree,
  useFileTreeSelection,
} from '@pierre/trees/react';
import type { DocSummary } from '../../shared/buildTree';

/**
 * Wrapper that isolates @pierre/trees (v1 beta) behind our own API.
 * Swapping the underlying tree lib later only touches this file (eng-review D2).
 */
export function FileTree({
  docs,
  onSelect,
}: {
  docs: DocSummary[];
  onSelect: (doc: DocSummary) => void;
}) {
  const paths = docs.map((d) => d.path);
  const pathKey = paths.join('\n');

  const { model } = useFileTree({
    paths,
    search: true,
    initialExpansion: 'open',
    flattenEmptyDirectories: true,
  });

  // Keep the tree in sync when the filtered doc set changes.
  useEffect(() => {
    model.resetPaths(paths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, pathKey]);

  const selected = useFileTreeSelection(model);
  useEffect(() => {
    const path = selected[0];
    if (!path) return;
    const doc = docs.find((d) => d.path === path);
    if (doc) onSelect(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return <PierreFileTree model={model} header={<strong>문서</strong>} style={{ height: '100%' }} />;
}
