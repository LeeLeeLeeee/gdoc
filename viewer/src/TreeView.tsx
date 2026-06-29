import { useState, type KeyboardEvent } from 'react';
import type { TreeNode, DocSummary } from '../../shared/buildTree';
import { folderPathOf } from '../../shared/folderRules';
import { formatRelativeUpdatedAt } from './dateFormat';
import { Folder, File, Chevron, ChevronRight, Lock } from './icons';
import { TreeContextMenu, type TreeContextMenuAction } from './TreeContextMenu';

type MenuTarget =
  | { kind: 'empty' }
  | { kind: 'folder'; path: string; name: string }
  | { kind: 'file'; doc: DocSummary };

type Props = {
  nodes: TreeNode[];
  selectedPath?: string;
  loadingPath?: string;
  movingDocId?: string;
  movingTargetPath?: string;
  now: number;
  canManage?: boolean;
  onSelect: (doc: DocSummary) => void;
  onCreateFolder?: (parentPath: string | null) => void;
  onRenameFolder?: (path: string, currentName: string) => void;
  onDeleteFolder?: (path: string) => void;
  onRenameFile?: (doc: DocSummary) => void;
  onEditFile?: (doc: DocSummary) => void;
  onMoveDocToFolder?: (doc: DocSummary, folderPath: string) => void;
};

export function TreeView({
  nodes,
  selectedPath,
  loadingPath,
  movingDocId,
  movingTargetPath,
  now,
  canManage,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onRenameFile,
  onEditFile,
  onMoveDocToFolder,
}: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const [dragDoc, setDragDoc] = useState<DocSummary | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);

  const openMenu = (x: number, y: number, target: MenuTarget) => setMenu({ x, y, target });
  const closeMenu = () => setMenu(null);

  const handleAction = (action: TreeContextMenuAction) => {
    if (!menu) return;
    const { target } = menu;
    closeMenu();

    if (action === 'new-folder') {
      onCreateFolder?.(target.kind === 'folder' ? target.path : null);
    } else if (target.kind === 'folder' && action === 'rename-folder') {
      onRenameFolder?.(target.path, target.name);
    } else if (target.kind === 'folder' && action === 'delete-folder') {
      onDeleteFolder?.(target.path);
    } else if (target.kind === 'file' && action === 'rename-file') {
      onRenameFile?.(target.doc);
    } else if (target.kind === 'file' && action === 'edit-file') {
      onEditFile?.(target.doc);
    }
  };

  return (
    <div
      className="tree-surface"
      onContextMenu={(event) => {
        if (!canManage || event.target !== event.currentTarget) return;
        event.preventDefault();
        openMenu(event.clientX, event.clientY, { kind: 'empty' });
      }}
    >
      {nodes.map((n) => (
        <TreeRow
          key={n.path}
          node={n}
          depth={0}
          selectedPath={selectedPath}
          loadingPath={loadingPath}
          movingDocId={movingDocId}
          movingTargetPath={movingTargetPath}
          now={now}
          canManage={canManage}
          dragDoc={dragDoc}
          dropPath={dropPath}
          setDragDoc={setDragDoc}
          setDropPath={setDropPath}
          onSelect={onSelect}
          onOpenMenu={openMenu}
          onMoveDocToFolder={onMoveDocToFolder}
        />
      ))}
      {menu && (
        <TreeContextMenu
          x={menu.x}
          y={menu.y}
          target={menu.target.kind}
          onAction={handleAction}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  selectedPath,
  loadingPath,
  movingDocId,
  movingTargetPath,
  now,
  canManage,
  dragDoc,
  dropPath,
  setDragDoc,
  setDropPath,
  onSelect,
  onOpenMenu,
  onMoveDocToFolder,
}: {
  node: TreeNode;
  depth: number;
  selectedPath?: string;
  loadingPath?: string;
  movingDocId?: string;
  movingTargetPath?: string;
  now: number;
  canManage?: boolean;
  dragDoc: DocSummary | null;
  dropPath: string | null;
  setDragDoc: (doc: DocSummary | null) => void;
  setDropPath: (path: string | null) => void;
  onSelect: (doc: DocSummary) => void;
  onOpenMenu: (x: number, y: number, target: MenuTarget) => void;
  onMoveDocToFolder?: (doc: DocSummary, folderPath: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const indent = 8 + depth * 14;
  const isMenuKey = (event: KeyboardEvent) => event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
  const openKeyboardMenu = (event: KeyboardEvent, target: MenuTarget) => {
    if (!canManage || !isMenuKey(event)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenMenu(rect.left + 28, rect.top + Math.min(rect.height, 28), target);
  };

  if (node.kind === 'folder') {
    const canDrop = Boolean(dragDoc && folderPathOf(dragDoc.path) !== node.path);
    const isDropTarget = dropPath === node.path && canDrop;
    const isMovingTarget = movingTargetPath === node.path;
    return (
      <>
        <div
          className={`tnode tfolder${isDropTarget ? ' drop-target' : ''}${isMovingTarget ? ' moving-target' : ''}`}
          tabIndex={0}
          style={{ paddingLeft: indent }}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen((o) => !o);
              return;
            }
            openKeyboardMenu(event, { kind: 'folder', path: node.path, name: node.name });
          }}
          onContextMenu={(event) => {
            if (!canManage) return;
            event.preventDefault();
            onOpenMenu(event.clientX, event.clientY, { kind: 'folder', path: node.path, name: node.name });
          }}
          onDragOver={(event) => {
            if (!canDrop) return;
            event.preventDefault();
            setDropPath(node.path);
          }}
          onDragLeave={() => {
            if (dropPath === node.path) setDropPath(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDropPath(null);
            if (dragDoc && folderPathOf(dragDoc.path) !== node.path) {
              onMoveDocToFolder?.(dragDoc, node.path);
            }
          }}
        >
          {open ? <Chevron size={12} /> : <ChevronRight size={12} />}
          <Folder size={15} color="var(--text-faint)" />
          <span className="tname">{node.name}</span>
          {isMovingTarget && <span className="move-status">이동 중</span>}
        </div>
        {open &&
          node.children.map((c) => (
            <TreeRow
              key={c.path}
              node={c}
              depth={depth + 1}
              selectedPath={selectedPath}
              loadingPath={loadingPath}
              movingDocId={movingDocId}
              movingTargetPath={movingTargetPath}
              now={now}
              canManage={canManage}
              dragDoc={dragDoc}
              dropPath={dropPath}
              setDragDoc={setDragDoc}
              setDropPath={setDropPath}
              onSelect={onSelect}
              onOpenMenu={onOpenMenu}
              onMoveDocToFolder={onMoveDocToFolder}
            />
          ))}
      </>
    );
  }

  const sel = node.path === selectedPath;
  const loading = node.path === loadingPath;
  const moving = node.doc.id === movingDocId;
  return (
    <div
      className={`tnode tfile${sel ? ' sel' : ''}${loading || moving ? ' loading' : ''}${moving ? ' moving' : ''}`}
      draggable={!!canManage && !moving}
      tabIndex={0}
      style={{ paddingLeft: indent + 19 }}
      onDragStart={() => setDragDoc(node.doc)}
      onDragEnd={() => {
        setDragDoc(null);
        setDropPath(null);
      }}
      onContextMenu={(event) => {
        if (!canManage) return;
        event.preventDefault();
        onOpenMenu(event.clientX, event.clientY, { kind: 'file', doc: node.doc });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(node.doc);
          return;
        }
        openKeyboardMenu(event, { kind: 'file', doc: node.doc });
      }}
      onClick={() => onSelect(node.doc)}
    >
      <File size={14} color={sel ? 'var(--blue-300)' : 'var(--text-faint)'} />
      <span className="tname">{node.name}</span>
      {moving ? (
        <span className="move-status">이동 중</span>
      ) : (
        <span className="relative-time" title={`업데이트 ${node.doc.updatedAt}`}>
          {formatRelativeUpdatedAt(node.doc.updatedAt, now)}
        </span>
      )}
      {node.doc.visibility === 'private' && <Lock size={11} color="var(--amber-500)" />}
    </div>
  );
}
