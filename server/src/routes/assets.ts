/**
 * Asset routes — Hono sub-app combining AssetController and AssetMediaController.
 *
 * Mounts on `/api/assets` in the main app.
 * All routes use the auth middleware and validate request data with Zod schemas.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';
import { AssetMediaSize } from '../dtos/asset-media.dto';
import type { AssetMediaRedirectResponse } from '../services/asset-media.service';

const app = new Hono<AppEnv>();

// ============================================================================
// Asset Media routes (upload, download, thumbnail, video, checks)
// ============================================================================

// POST /api/assets — Upload asset (multipart)
app.post(
  '/',
  authMiddleware({ permission: Permission.AssetUpload, sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');

    // Parse multipart form data
    const body = await c.req.parseBody({ all: true });

    // Get the asset file
    const assetData = body['assetData'];
    if (!assetData || !(assetData instanceof File)) {
      return c.json({ message: 'Missing assetData file' }, 400);
    }

    const fileData = await assetData.arrayBuffer();
    const originalName = assetData.name;

    // Get optional sidecar file
    let sidecarData: ArrayBuffer | undefined;
    let sidecarName: string | undefined;
    const sidecarFile = body['sidecarData'];
    if (sidecarFile instanceof File) {
      sidecarData = await sidecarFile.arrayBuffer();
      sidecarName = sidecarFile.name;
    }

    // Parse DTO fields from form data
    const dto = {
      deviceAssetId: String(body['deviceAssetId'] || ''),
      deviceId: String(body['deviceId'] || ''),
      fileCreatedAt: body['fileCreatedAt'] ? new Date(String(body['fileCreatedAt'])) : new Date(),
      fileModifiedAt: body['fileModifiedAt'] ? new Date(String(body['fileModifiedAt'])) : new Date(),
      duration: body['duration'] ? String(body['duration']) : undefined,
      filename: body['filename'] ? String(body['filename']) : undefined,
      isFavorite: body['isFavorite'] === 'true' || body['isFavorite'] === true,
      visibility: body['visibility'] ? String(body['visibility']) : undefined,
      livePhotoVideoId: body['livePhotoVideoId'] ? String(body['livePhotoVideoId']) : undefined,
      metadata: undefined as Array<{ key: string; value: Record<string, unknown> }> | undefined,
    };

    // Parse metadata if provided
    if (body['metadata']) {
      try {
        const raw = typeof body['metadata'] === 'string' ? JSON.parse(body['metadata']) : body['metadata'];
        dto.metadata = Array.isArray(raw) ? raw : [raw];
      } catch {
        // Ignore invalid metadata
      }
    }

    // Check for pre-upload duplicate via checksum header
    const checksumHeader = c.req.header('x-immich-checksum');
    if (checksumHeader) {
      const duplicate = await services.assetMedia.getUploadAssetIdByChecksum(auth, checksumHeader);
      if (duplicate) {
        return c.json(duplicate, 200);
      }
    }

    const result = await services.assetMedia.uploadAsset(
      auth,
      dto as any,
      fileData,
      originalName,
      sidecarData,
      sidecarName,
    );

    const status = result.status === 'duplicate' ? 200 : 201;
    return c.json(result, status as any);
  },
);

// POST /api/assets/exist — Check existing assets
app.post(
  '/exist',
  authMiddleware({ permission: Permission.AssetUpload }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.assetMedia.checkExistingAssets(auth, body);
    return c.json(result);
  },
);

// POST /api/assets/bulk-upload-check — Bulk upload check
app.post(
  '/bulk-upload-check',
  authMiddleware({ permission: Permission.AssetUpload }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.assetMedia.bulkUploadCheck(auth, body);
    return c.json(result);
  },
);

// GET /api/assets/:id/original — Download original
app.get(
  '/:id/original',
  authMiddleware({ permission: Permission.AssetDownload, sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const edited = c.req.query('edited');
    const dto = { edited: edited === 'true' ? true : undefined };

    const result = await services.assetMedia.downloadOriginal(auth, id, dto);

    if (!result.body) {
      return c.json({ message: 'File not found' }, 404);
    }

    // Consume the R2 ReadableStream into an ArrayBuffer so the R2 object body
    // is fully read within this handler.  This prevents R2 storage state from
    // leaking across Cloudflare Workers vitest isolated-storage boundaries.
    const bodyBuffer = await new Response(result.body).arrayBuffer();

    c.header('Content-Type', result.contentType);
    c.header('Content-Disposition', `attachment; filename="${result.fileName}"`);
    c.header('Content-Length', String(bodyBuffer.byteLength));
    c.header('Cache-Control', 'private, max-age=86400, immutable');

    return new Response(bodyBuffer, {
      headers: c.res.headers,
    });
  },
);

// PUT /api/assets/:id/original — Replace asset
app.put(
  '/:id/original',
  authMiddleware({ permission: Permission.AssetReplace, sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');

    const body = await c.req.parseBody({ all: true });
    const assetData = body['assetData'];
    if (!assetData || !(assetData instanceof File)) {
      return c.json({ message: 'Missing assetData file' }, 400);
    }

    const fileData = await assetData.arrayBuffer();
    const originalName = assetData.name;

    const dto = {
      deviceAssetId: String(body['deviceAssetId'] || ''),
      deviceId: String(body['deviceId'] || ''),
      fileCreatedAt: body['fileCreatedAt'] ? new Date(String(body['fileCreatedAt'])) : new Date(),
      fileModifiedAt: body['fileModifiedAt'] ? new Date(String(body['fileModifiedAt'])) : new Date(),
      duration: body['duration'] ? String(body['duration']) : undefined,
    };

    const result = await services.assetMedia.replaceAsset(auth, id, dto as any, fileData, originalName);

    const status = result.status === 'duplicate' ? 200 : 200;
    return c.json(result, status as any);
  },
);

// GET /api/assets/:id/thumbnail — View thumbnail
app.get(
  '/:id/thumbnail',
  authMiddleware({ permission: Permission.AssetView, sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const size = c.req.query('size') as AssetMediaSize | undefined;
    const edited = c.req.query('edited');

    const dto = {
      size,
      edited: edited === 'true' ? true : undefined,
    };

    const result = await services.assetMedia.viewThumbnail(auth, id, dto);

    // Check if it's a redirect response
    if ('targetSize' in result) {
      const redirectResult = result as AssetMediaRedirectResponse;
      const [reqPath, reqSearch] = c.req.url.split('?');
      const redirSearchParams = new URLSearchParams(reqSearch || '');

      if (redirectResult.targetSize === 'original') {
        redirSearchParams.delete('size');
        return c.redirect(`${c.req.path.replace(/\/thumbnail$/, '/original')}?${redirSearchParams.toString()}`);
      }

      if (Object.values(AssetMediaSize).includes(redirectResult.targetSize as AssetMediaSize)) {
        redirSearchParams.set('size', redirectResult.targetSize as string);
        return c.redirect(`${c.req.path}?${redirSearchParams.toString()}`);
      }

      return c.json({ message: 'Invalid target size' }, 500);
    }

    // File response
    if (!result.body) {
      return c.json({ message: 'File not found' }, 404);
    }

    c.header('Content-Type', result.contentType);
    c.header('Content-Length', String(result.size));
    c.header('Cache-Control', 'private, max-age=86400, immutable');

    return new Response(result.body, {
      headers: c.res.headers,
    });
  },
);

// GET /api/assets/:id/video/playback — Stream video
app.get(
  '/:id/video/playback',
  authMiddleware({ permission: Permission.AssetView, sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');

    const result = await services.assetMedia.playbackVideo(auth, id);

    if (!result.body) {
      return c.json({ message: 'File not found' }, 404);
    }

    // Handle Range requests for video seeking
    const range = c.req.header('range');
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = Number.parseInt(match[1], 10);
        const end = match[2] ? Number.parseInt(match[2], 10) : result.size - 1;
        const contentLength = end - start + 1;

        // For R2, we need to re-fetch with range
        // R2ObjectBody supports range reads via the get() options
        const bucket = c.get('ctx').bucket;
        const rangeObject = await bucket.get(result.path, {
          range: { offset: start, length: contentLength },
        });

        if (!rangeObject) {
          return c.json({ message: 'Range not satisfiable' }, 416);
        }

        return new Response((rangeObject as R2ObjectBody).body, {
          status: 206,
          headers: {
            'Content-Type': result.contentType,
            'Content-Range': `bytes ${start}-${end}/${result.size}`,
            'Content-Length': String(contentLength),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=86400, immutable',
          },
        });
      }
    }

    c.header('Content-Type', result.contentType);
    c.header('Content-Length', String(result.size));
    c.header('Accept-Ranges', 'bytes');
    c.header('Cache-Control', 'private, max-age=86400, immutable');

    return new Response(result.body, {
      headers: c.res.headers,
    });
  },
);

// ============================================================================
// Asset CRUD routes
// ============================================================================

// GET /api/assets/random
app.get(
  '/random',
  authMiddleware({ permission: Permission.AssetRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const count = c.req.query('count');
    const result = await services.asset.getRandom(auth, count ? Number.parseInt(count, 10) : 1);
    return c.json(result);
  },
);

// GET /api/assets/device/:deviceId
app.get(
  '/device/:deviceId',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const deviceId = c.req.param('deviceId');
    const result = await services.asset.getUserAssetsByDeviceId(auth, deviceId);
    return c.json(result);
  },
);

// GET /api/assets/statistics
app.get(
  '/statistics',
  authMiddleware({ permission: Permission.AssetStatistics }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const visibility = c.req.query('visibility');
    const isFavorite = c.req.query('isFavorite');
    const isTrashed = c.req.query('isTrashed');

    const dto = {
      visibility: visibility || undefined,
      isFavorite: isFavorite === 'true' ? true : isFavorite === 'false' ? false : undefined,
      isTrashed: isTrashed === 'true' ? true : isTrashed === 'false' ? false : undefined,
    };

    const result = await services.asset.getStatistics(auth, dto);
    return c.json(result);
  },
);

// POST /api/assets/jobs — Run asset jobs (stub)
app.post(
  '/jobs',
  authMiddleware({ permission: Permission.AssetUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    await services.asset.run(auth, body);
    return c.body(null, 204);
  },
);

// PUT /api/assets — Bulk update
app.put(
  '/',
  authMiddleware({ permission: Permission.AssetUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    await services.asset.updateAll(auth, body);
    return c.body(null, 204);
  },
);

// DELETE /api/assets — Bulk delete
app.delete(
  '/',
  authMiddleware({ permission: Permission.AssetDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    await services.asset.deleteAll(auth, body);
    return c.body(null, 204);
  },
);

// PUT /api/assets/copy — Copy asset
app.put(
  '/copy',
  authMiddleware({ permission: Permission.AssetCopy }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    await services.asset.copy(auth, body);
    return c.body(null, 204);
  },
);

// PUT /api/assets/metadata — Bulk upsert metadata
app.put(
  '/metadata',
  authMiddleware({ permission: Permission.AssetUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.asset.upsertBulkMetadata(auth, body);
    return c.json(result);
  },
);

// DELETE /api/assets/metadata — Bulk delete metadata
app.delete(
  '/metadata',
  authMiddleware({ permission: Permission.AssetUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    await services.asset.deleteBulkMetadata(auth, body);
    return c.body(null, 204);
  },
);

// GET /api/assets/:id — Get asset info
app.get(
  '/:id',
  authMiddleware({ permission: Permission.AssetRead, sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.asset.get(auth, id);
    return c.json(result);
  },
);

// PUT /api/assets/:id — Update asset
app.put(
  '/:id',
  authMiddleware({ permission: Permission.AssetUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.asset.update(auth, id, body);
    return c.json(result);
  },
);

// GET /api/assets/:id/metadata — Get asset metadata
app.get(
  '/:id/metadata',
  authMiddleware({ permission: Permission.AssetRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.asset.getMetadata(auth, id);
    return c.json(result);
  },
);

// PUT /api/assets/:id/metadata — Update asset metadata
app.put(
  '/:id/metadata',
  authMiddleware({ permission: Permission.AssetUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.asset.upsertMetadata(auth, id, body);
    return c.json(result);
  },
);

// GET /api/assets/:id/metadata/:key — Get metadata by key
app.get(
  '/:id/metadata/:key',
  authMiddleware({ permission: Permission.AssetRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const key = c.req.param('key');
    const result = await services.asset.getMetadataByKey(auth, id, key);
    return c.json(result);
  },
);

// DELETE /api/assets/:id/metadata/:key — Delete metadata by key
app.delete(
  '/:id/metadata/:key',
  authMiddleware({ permission: Permission.AssetUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const key = c.req.param('key');
    await services.asset.deleteMetadataByKey(auth, id, key);
    return c.body(null, 204);
  },
);

// GET /api/assets/:id/edits — Get edits
app.get(
  '/:id/edits',
  authMiddleware({ permission: Permission.AssetEditGet }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.asset.getAssetEdits(auth, id);
    return c.json(result);
  },
);

// PUT /api/assets/:id/edits — Create/replace edits
app.put(
  '/:id/edits',
  authMiddleware({ permission: Permission.AssetEditCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.asset.editAsset(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/assets/:id/edits — Remove edits
app.delete(
  '/:id/edits',
  authMiddleware({ permission: Permission.AssetEditDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.asset.removeAssetEdits(auth, id);
    return c.body(null, 204);
  },
);

export default app;
