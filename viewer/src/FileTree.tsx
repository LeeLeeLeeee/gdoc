import { useMemo } from 'react';
import { buildTree, flattenTree, type DocSummary, type FolderSummary } from '../../shared/buildTree';
import { TreeView } from './TreeView';

/**
 * Custom folder tree styled to the Alloy design. Replaced @pierre/trees (whose
 * own styling clashed with the design and didn't honor our sort). The D2 wrapper
 * boundary made this swap a one-file change. `docs` arrives filtered + sorted;
 * buildTree({ sort: false }) preserves that order so the sort control works.
 */
export function FileTree({
  docs,
  folders = [],
  selectedPath,
  loadingPath,
  movingDocId,
  movingTargetPath,
  now,
  onSelect,
  canManage,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onRenameFile,
  onEditFile,
  onMoveDocToFolder,
}: {
  docs: DocSummary[];
  folders?: FolderSummary[];
  selectedPath?: string;
  loadingPath?: string;
  movingDocId?: string;
  movingTargetPath?: string;
  now: number;
  onSelect: (doc: DocSummary) => void;
  canManage?: boolean;
  onCreateFolder?: (parentPath: string | null) => void;
  onRenameFolder?: (path: string, currentName: string) => void;
  onDeleteFolder?: (path: string) => void;
  onRenameFile?: (doc: DocSummary) => void;
  onEditFile?: (doc: DocSummary) => void;
  onMoveDocToFolder?: (doc: DocSummary, folderPath: string) => void;
}) {
  const tree = useMemo(() => flattenTree(buildTree(docs, { sort: false, folders })), [docs, folders]);
  return (
    <TreeView
      nodes={tree}
      selectedPath={selectedPath}
      loadingPath={loadingPath}
      movingDocId={movingDocId}
      movingTargetPath={movingTargetPath}
      now={now}
      onSelect={onSelect}
      canManage={canManage}
      onCreateFolder={onCreateFolder}
      onRenameFolder={onRenameFolder}
      onDeleteFolder={onDeleteFolder}
      onRenameFile={onRenameFile}
      onEditFile={onEditFile}
      onMoveDocToFolder={onMoveDocToFolder}
    />
  );
}
