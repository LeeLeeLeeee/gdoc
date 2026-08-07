import { normalizeFolderPath, splitPath } from './folderRules';

export interface DeletePlan {
  /** Document ids to delete, in listing order. */
  docs: string[];
  /** Folder paths to delete, deepest-first, with the target folder itself last. */
  folders: string[];
  counts: { docs: number; folders: number };
}

/**
 * Work out everything a recursive folder delete must remove.
 *
 * Pure: callers supply the current documents and folders and perform the I/O.
 * Prefix matching always appends a slash so `a/b` never swallows `a/bc`.
 */
export function planFolderDelete(
  folderPath: string,
  docs: { id: string; path: string }[],
  folders: { path: string }[],
): DeletePlan {
  const target = normalizeFolderPath(folderPath);
  const prefix = `${target}/`;

  const docIds = docs.filter((doc) => doc.path.startsWith(prefix)).map((doc) => doc.id);

  const descendants = folders
    .map((folder) => folder.path)
    .filter((path) => path.startsWith(prefix))
    .sort((a, b) => splitPath(b).length - splitPath(a).length);

  return {
    docs: docIds,
    folders: [...descendants, target],
    counts: { docs: docIds.length, folders: descendants.length + 1 },
  };
}
