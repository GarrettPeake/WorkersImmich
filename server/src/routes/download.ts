/**
 * Download routes -- Hono sub-app for download/archive operations.
 *
 * Mounts on `/api/download` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// POST /api/download/info -- Get download info (sizes, chunking)
app.post(
  '/info',
  authMiddleware({ permission: Permission.AssetDownload }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.download.getDownloadInfo(auth, body);
    return c.json(result);
  },
);

// POST /api/download/archive -- Download ZIP archive
app.post(
  '/archive',
  authMiddleware({ permission: Permission.AssetDownload }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const response = await services.download.downloadArchive(auth, body);
    return response;
  },
);

export default app;
