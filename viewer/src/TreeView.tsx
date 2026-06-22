import { useState } from 'react';
import type { TreeNode, DocSummary } from '../../shared/buildTree';
import { Folder, File, Chevron, ChevronRight, Lock } from './icons';

type Props = { nodes: TreeNode[]; selectedPath?: string; onSelect: (doc: DocSummary) => void };

export function TreeView({ nodes, selectedPath, onSelect }: Props) {
  return (
    <div>
      {nodes.map((n) => (
        <TreeRow key={n.path} node={n} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath?: string;
  onSelect: (doc: DocSummary) => void;
}) {
  const [open, setOpen] = useState(true);
  const indent = 8 + depth * 14;

  if (node.kind === 'folder') {
    return (
      <>
        <div className="tnode tfolder" style={{ paddingLeft: indent }} onClick={() => setOpen((o) => !o)}>
          {open ? <Chevron size={12} /> : <ChevronRight size={12} />}
          <Folder size={15} color="var(--text-faint)" />
          <span className="tname">{node.name}</span>
        </div>
        {open &&
          node.children.map((c) => (
            <TreeRow key={c.path} node={c} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
      </>
    );
  }

  const sel = node.path === selectedPath;
  return (
    <div
      className={`tnode tfile${sel ? ' sel' : ''}`}
      style={{ paddingLeft: indent + 19 }}
      onClick={() => onSelect(node.doc)}
    >
      <File size={14} color={sel ? 'var(--blue-300)' : 'var(--text-faint)'} />
      <span className="tname">{node.name}</span>
      {node.doc.visibility === 'private' && <Lock size={11} color="var(--amber-500)" />}
      {sel && <span className="dot" />}
    </div>
  );
}
