/**
 * File serving utilities for R2 objects.
 *
 * Uses standard Web API Response objects (no Express, no node:fs, no node:stream).
 * Compatible with Hono's context and Cloudflare Workers runtime.
 */

import type { Context } from 'hono';

/**
 * Serve an R2 object as an HTTP response with proper headers.
 */
export function serveR2Object(
  c: Context,
  object: R2ObjectBody,
  options?: {
    filename?: string;
    inline?: boolean;
    cacheControl?: string;
  },
): Response {
  const headers = new Headers();

  // Write R2 object HTTP metadata (content-type, etc.)
  object.writeHttpMetadata(headers);

  // ETag
  headers.set('ETag', object.httpEtag);

  // Cache control
  if (options?.cacheControl) {
    headers.set('Cache-Control', options.cacheControl);
  }

  // Content disposition
  if (options?.filename) {
    const disposition = options.inline ? 'inline' : 'attachment';
    headers.set('Content-Disposition', `${disposition}; filename="${options.filename}"`);
  }

  // Content length
  headers.set('Content-Length', object.size.toString());

  return new Response(object.body, { headers });
}

/**
 * Serve an R2 object with Range header support (for video streaming).
 */
export function serveR2ObjectWithRange(
  c: Context,
  object: R2ObjectBody,
  totalSize: number,
): Response {
  const rangeHeader = c.req.header('Range');

  if (!rangeHeader) {
    return serveR2Object(c, object, {
      cacheControl: 'private, max-age=86400',
    });
  }

  // Parse Range header
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    return new Response('Invalid Range', { status: 416 });
  }

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
  headers.set('Content-Length', (end - start + 1).toString());
  headers.set('Accept-Ranges', 'bytes');

  return new Response(object.body, {
    status: 206,
    headers,
  });
}

/**
 * Check if an R2 object exists and handle conditional requests (If-None-Match).
 * Returns a 304 Not Modified response if the ETag matches, or null otherwise.
 */
export function handleConditionalRequest(c: Context, etag: string): Response | null {
  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304 });
  }
  return null;
}
