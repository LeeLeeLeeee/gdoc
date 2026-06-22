import type { Bucket } from './schema';

/** The subset of a `documents` row the viewer needs to render + open a doc. */
export interface DocSummary {
  id: string;
  title: string;
  type: string;
  path: string; // resolved folder path, slash-delimited; last segment = the doc itself
  visibility: Bucket;
  bucket: Bucket;
  storageKey: string;
  tags: string[];
  category: string;
}

export type TreeNode =
  | { kind: 'folder'; name: string; path: string; children: TreeNode[] }
  | { kind: 'file'; name: string; path: string; doc: DocSummary };

type FolderNode = Extract<TreeNode, { kind: 'folder' }>;

/**
 * Flat doc list → nested folder tree. Each doc's `path` is split on '/'; all but
 * the last segment are folders, the last is the file leaf. Pure + deterministic
 * (folders before files, each sorted alphabetically) so the viewer + tests agree.
 */
export function buildTree(docs: DocSummary[]): TreeNode[] {
  const roots: TreeNode[] = [];

  for (const doc of docs) {
    const segments = doc.path.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    const fileName = segments[segments.length - 1];
    const folderSegments = segments.slice(0, -1);

    let children = roots;
    let accPath = '';
    for (const seg of folderSegments) {
      accPath = accPath ? `${accPath}/${seg}` : seg;
      let folder = children.find(
        (n): n is FolderNode => n.kind === 'folder' && n.name === seg,
      );
      if (!folder) {
        folder = { kind: 'folder', name: seg, path: accPath, children: [] };
        children.push(folder);
      }
      children = folder.children;
    }

    children.push({ kind: 'file', name: fileName, path: doc.path, doc });
  }

  return sortNodes(roots);
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  for (const node of nodes) {
    if (node.kind === 'folder') sortNodes(node.children);
  }
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}
