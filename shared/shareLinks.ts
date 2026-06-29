export function shareTokenFromPath(path: string): string | null {
  const match = path.match(/^\/share\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function isSharePath(path: string): boolean {
  return shareTokenFromPath(path) !== null;
}

export function buildShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/share/${encodeURIComponent(token)}`;
}
