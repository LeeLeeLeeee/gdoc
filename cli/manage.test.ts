import { describe, expect, it } from 'vitest';
import { moveFilePath, renameFilePath } from './manage';

describe('manage path helpers', () => {
  it('renames only the file leaf', () => {
    expect(renameFilePath('a/b/file', 'renamed')).toBe('a/b/renamed');
  });

  it('moves file into target folder preserving leaf', () => {
    expect(moveFilePath('a/b/file', 'x/y')).toBe('x/y/file');
  });
});
