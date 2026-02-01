/**
 * Album routes -- Hono sub-app for album CRUD.
 *
 * Mounts on `/api/albums` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/albums -- List all albums
app.get(
  '/',
  authMiddleware({ permission: Permission.AlbumRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const assetId = c.req.query('assetId');
    const shared = c.req.query('shared');
    const dto = {
      assetId,
      shared: shared === 'true' ? true : shared === 'false' ? false : undefined,
    };
    const result = await services.album.getAll(auth, dto);
    return c.json(result);
  },
);

// POST /api/albums -- Create an album
app.post(
  '/',
  authMiddleware({ permission: Permission.AlbumCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.album.create(auth, body);
    return c.json(result);
  },
);

// GET /api/albums/statistics -- Album statistics
app.get(
  '/statistics',
  authMiddleware({ permission: Permission.AlbumStatistics }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.album.getStatistics(auth);
    return c.json(result);
  },
);

// GET /api/albums/:id -- Get album info
app.get(
  '/:id',
  authMiddleware({ permission: Permission.AlbumRead, sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const withoutAssets = c.req.query('withoutAssets');
    const dto = {
      withoutAssets: withoutAssets === 'true' ? true : undefined,
    };
    const result = await services.album.get(auth, id, dto);
    return c.json(result);
  },
);

// PATCH /api/albums/:id -- Update album
app.patch(
  '/:id',
  authMiddleware({ permission: Permission.AlbumUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.album.update(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/albums/:id -- Delete album
app.delete(
  '/:id',
  authMiddleware({ permission: Permission.AlbumDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.album.delete(auth, id);
    return c.body(null, 204);
  },
);

// PUT /api/albums/:id/assets -- Add assets to album
app.put(
  '/:id/assets',
  authMiddleware({ permission: Permission.AlbumAssetCreate, sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.album.addAssets(auth, id, body);
    return c.json(result);
  },
);

// PUT /api/albums/assets -- Add assets to multiple albums
app.put(
  '/assets',
  authMiddleware({ permission: Permission.AlbumAssetCreate, sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.album.addAssetsToAlbums(auth, body);
    return c.json(result);
  },
);

// DELETE /api/albums/:id/assets -- Remove assets from album
app.delete(
  '/:id/assets',
  authMiddleware({ permission: Permission.AlbumAssetDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.album.removeAssets(auth, id, body);
    return c.json(result);
  },
);

// PUT /api/albums/:id/users -- Add users to album
app.put(
  '/:id/users',
  authMiddleware({ permission: Permission.AlbumUserCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.album.addUsers(auth, id, body);
    return c.json(result);
  },
);

// PUT /api/albums/:id/user/:userId -- Update album user role
app.put(
  '/:id/user/:userId',
  authMiddleware({ permission: Permission.AlbumUserUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const userId = c.req.param('userId');
    const body = await c.req.json();
    await services.album.updateUser(auth, id, userId, body);
    return c.body(null, 204);
  },
);

// DELETE /api/albums/:id/user/:userId -- Remove user from album
app.delete(
  '/:id/user/:userId',
  authMiddleware({ permission: Permission.AlbumUserDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const userId = c.req.param('userId');
    await services.album.removeUser(auth, id, userId);
    return c.body(null, 204);
  },
);

export default app;
