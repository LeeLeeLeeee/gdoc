import { describe, expect, it } from 'vitest';
import { childPath, fileLeaf, folderPathOf, normalizeFolderPath, renamePathPrefix } from './folderRules';

describe('folderRules', () => {
  it('normalizes slashes and trims segments', () => {
    expect(normalizeFolderPath(' playground / tech-notes / effect ')).toBe('playground/tech-notes/effect');
  });

  it('rejects empty paths', () => {
    expect(() => normalizeFolderPath(' / / ')).toThrow('Folder path cannot be empty');
  });

  it('joins parent and child folder names', () => {
    expect(childPath('playground/tech-notes', 'effect')).toBe('playground/tech-notes/effect');
    expect(childPath(null, 'root')).toBe('root');
  });

  it('gets file leaf and parent folder', () => {
    expect(fileLeaf('a/b/c')).toBe('c');
    expect(folderPathOf('a/b/c')).toBe('a/b');
    expect(folderPathOf('c')).toBe('');
  });

  it('renames path prefixes without touching sibling prefixes', () => {
    expect(renamePathPrefix('a/b/file', 'a/b', 'a/c')).toBe('a/c/file');
    expect(renamePathPrefix('a/bb/file', 'a/b', 'a/c')).toBe('a/bb/file');
  });
});
