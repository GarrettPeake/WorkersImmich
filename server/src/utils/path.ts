/**
 * Workers-compatible path utilities replacing Node.js `path` module.
 * These work with forward-slash paths (R2 keys, URLs).
 */

export function basename(path: string): string {
  // Strip trailing slashes (like Node.js path.basename)
  const trimmed = path.replace(/\/+$/, '');
  if (!trimmed) return '';
  const parts = trimmed.split('/');
  return parts[parts.length - 1] || '';
}

export function extname(path: string): string {
  const base = basename(path);
  const dotIndex = base.lastIndexOf('.');
  return dotIndex > 0 ? base.slice(dotIndex) : '';
}

export function dirname(path: string): string {
  // Strip trailing slashes before finding parent
  const trimmed = path.replace(/\/+$/, '');
  if (!trimmed) return '/';
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash < 0) return '.';
  if (lastSlash === 0) return '/';
  return trimmed.slice(0, lastSlash);
}

export function join(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/');
}

export function parse(path: string): { dir: string; base: string; name: string; ext: string } {
  const dir = dirname(path);
  const base = basename(path);
  const ext = extname(path);
  const name = ext ? base.slice(0, -ext.length) : base;
  return { dir, base, name, ext };
}

export function resolve(...parts: string[]): string {
  // Simple resolve for Workers - just joins and normalizes
  return join(...parts);
}
