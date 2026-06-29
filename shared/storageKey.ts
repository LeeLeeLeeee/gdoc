export function storageKeyAsciiBase(id: string): string {
  const ascii = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (ascii || 'doc').slice(0, 80);
}

export function storageKeyFromIdHash(id: string, idHashHex: string): string {
  return `${storageKeyAsciiBase(id)}-${idHashHex.slice(0, 10)}.html`;
}
