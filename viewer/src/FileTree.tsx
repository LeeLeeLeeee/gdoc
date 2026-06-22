import { useMemo } from 'react';
import { buildTree, flattenTree, type DocSummary } from '../../shared/buildTree';
import { TreeView } from './TreeView';

/**
 * Custom folder tree styled to the Alloy design. Replaced @pierre/trees (whose
 * own styling clashed with the design and didn't honor our sort). The D2 wrapper
 * boundary made this swap a one-file change. `docs` arrives filtered + sorted;
 * buildTree({ sort: false }) preserves that order so the sort control works.
 */
export function FileTree({
  docs,
  selectedPath,
  loadingPath,
  onSelect,
}: {
  docs: DocSummary[];
  selectedPath?: string;
  loadingPath?: string;
  onSelect: (doc: DocSummary) => void;
}) {
  const tree = useMemo(() => flattenTree(buildTree(docs, { sort: false })), [docs]);
  return <TreeView nodes={tree} selectedPath={selectedPath} loadingPath={loadingPath} onSelect={onSelect} />;
}
