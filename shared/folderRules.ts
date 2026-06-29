export function splitPath(path: string): string[] {
  return path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeFolderPath(path: string): string {
  const normalized = splitPath(path).join('/');
  if (!normalized) throw new Error('Folder path cannot be empty');
  return normalized;
}

export function childPath(parentPath: string | null, name: string): string {
  const child = normalizeFolderPath(name);
  return parentPath ? `${normalizeFolderPath(parentPath)}/${child}` : child;
}

export function fileLeaf(path: string): string {
  const parts = splitPath(path);
  if (parts.length === 0) throw new Error('Document path cannot be empty');
  return parts[parts.length - 1];
}

export function folderPathOf(docPath: string): string {
  const parts = splitPath(docPath);
  parts.pop();
  return parts.join('/');
}

export function renamePathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  const oldPath = normalizeFolderPath(oldPrefix);
  const nextPath = normalizeFolderPath(newPrefix);
  if (path === oldPath) return nextPath;
  if (path.startsWith(`${oldPath}/`)) return `${nextPath}${path.slice(oldPath.length)}`;
  return path;
}
