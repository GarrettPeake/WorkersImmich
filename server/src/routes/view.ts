/**
 * View routes -- Hono sub-app for folder/path browsing.
 *
 * Mounts on `/api/view` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/view/folder/unique-paths -- List unique folder paths
app.get(
  '/folder/unique-paths',
  authMiddleware({ permission: Permission.FolderRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.view.getUniqueOriginalPaths(auth);
    return c.json(result);
  },
);

// GET /api/view/folder -- Get assets in a folder
app.get(
  '/folder',
  authMiddleware({ permission: Permission.FolderRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const path = c.req.query('path') || '';
    const result = await services.view.getAssetsByOriginalPath(auth, path);
    return c.json(result);
  },
);

export default app;
