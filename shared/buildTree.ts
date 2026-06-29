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
  createdAt: string;
  updatedAt: string;
}

export interface FolderSummary {
  path: string;
  name: string;
  parentPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TreeNode =
  | { kind: 'folder'; name: string; path: string; explicit: boolean; children: TreeNode[] }
  | { kind: 'file'; name: string; path: string; doc: DocSummary };

type FolderNode = Extract<TreeNode, { kind: 'folder' }>;

function ensureFolder(children: TreeNode[], name: string, path: string, explicit: boolean): FolderNode {
  let folder = children.find((n): n is FolderNode => n.kind === 'folder' && n.name === name);
  if (!folder) {
    folder = { kind: 'folder', name, path, explicit, children: [] };
    children.push(folder);
  } else if (explicit) {
    folder.explicit = true;
  }
  return folder;
}

/**
 * Flat doc list → nested folder tree. Each doc's `path` is split on '/'; all but
 * the last segment are folders, the last is the file leaf. Pure + deterministic
 * (folders before files, each sorted alphabetically) so the viewer + tests agree.
 */
export function buildTree(docs: DocSummary[], opts: { sort?: boolean; folders?: FolderSummary[] } = {}): TreeNode[] {
  const roots: TreeNode[] = [];

  for (const folder of opts.folders ?? []) {
    const segments = folder.path.split('/').filter(Boolean);
    let children = roots;
    let accPath = '';
    for (const seg of segments) {
      accPath = accPath ? `${accPath}/${seg}` : seg;
      const node = ensureFolder(children, seg, accPath, accPath === folder.path);
      children = node.children;
    }
  }

  for (const doc of docs) {
    const segments = doc.path.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    const fileName = segments[segments.length - 1];
    const folderSegments = segments.slice(0, -1);

    let children = roots;
    let accPath = '';
    for (const seg of folderSegments) {
      accPath = accPath ? `${accPath}/${seg}` : seg;
      const folder = ensureFolder(children, seg, accPath, false);
      children = folder.children;
    }

    children.push({ kind: 'file', name: fileName, path: doc.path, doc });
  }

  // Default: sort folders-before-files alphabetically. Pass { sort: false } to
  // preserve insertion order (the viewer feeds a pre-sorted doc list).
  return opts.sort === false ? roots : sortNodes(roots);
}

/** Collapse single-child folder chains into one row: a → b → [files] becomes "a / b". */
export function flattenTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((n) => {
    if (n.kind !== 'folder') return n;
    let folder = n;
    let name = folder.name;
    while (
      !folder.explicit &&
      folder.children.length === 1 &&
      folder.children[0].kind === 'folder' &&
      !folder.children[0].explicit
    ) {
      folder = folder.children[0] as FolderNode;
      name += ` / ${folder.name}`;
    }
    return { kind: 'folder', name, path: folder.path, explicit: folder.explicit, children: flattenTree(folder.children) };
  });
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
