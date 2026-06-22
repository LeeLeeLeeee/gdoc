import { useEffect } from 'react';
import {
  FileTree as PierreFileTree,
  useFileTree,
  useFileTreeSelection,
} from '@pierre/trees/react';
import type { DocSummary } from '../../shared/buildTree';

// Dark-theme overrides for @pierre/trees (renders in a shadow root; CSS custom
// properties inherit through the boundary). Keeps the beta lib isolated here (D2).
const TREE_THEME: React.CSSProperties = {
  height: '100%',
  background: 'transparent',
  // documented @pierre/trees override hooks
  ['--trees-fg-override' as string]: 'var(--text-default)',
  ['--trees-selected-bg-override' as string]: 'var(--brand-soft)',
  ['--trees-border-color-override' as string]: 'transparent',
  ['--trees-theme-bg' as string]: 'transparent',
  ['--trees-theme-fg' as string]: 'var(--text-default)',
};

/** Wrapper isolating @pierre/trees. `docs` arrives already filtered + sorted. */
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
    search: false, // our own meta + name filters drive the doc set
    initialExpansion: 'open',
    flattenEmptyDirectories: true,
  });

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

  return <PierreFileTree model={model} style={TREE_THEME} />;
}
