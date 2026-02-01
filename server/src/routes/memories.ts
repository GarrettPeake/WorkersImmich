/**
 * Memory routes -- Hono sub-app for memory CRUD.
 *
 * Mounts on `/api/memories` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/memories -- Search memories
app.get(
  '/',
  authMiddleware({ permission: Permission.MemoryRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const dto = {
      for: c.req.query('for'),
      sortOrder: c.req.query('sortOrder'),
    };
    const result = await services.memory.search(auth, dto);
    return c.json(result);
  },
);

// POST /api/memories -- Create memory
app.post(
  '/',
  authMiddleware({ permission: Permission.MemoryCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.memory.create(auth, body);
    return c.json(result);
  },
);

// GET /api/memories/statistics -- Memory statistics
app.get(
  '/statistics',
  authMiddleware({ permission: Permission.MemoryStatistics }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const dto = {
      for: c.req.query('for'),
      sortOrder: c.req.query('sortOrder'),
    };
    const result = await services.memory.statistics(auth, dto);
    return c.json(result);
  },
);

// GET /api/memories/:id -- Get memory
app.get(
  '/:id',
  authMiddleware({ permission: Permission.MemoryRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.memory.get(auth, id);
    return c.json(result);
  },
);

// PUT /api/memories/:id -- Update memory
app.put(
  '/:id',
  authMiddleware({ permission: Permission.MemoryUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.memory.update(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/memories/:id -- Delete memory
app.delete(
  '/:id',
  authMiddleware({ permission: Permission.MemoryDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.memory.remove(auth, id);
    return c.body(null, 204);
  },
);

// PUT /api/memories/:id/assets -- Add assets to memory
app.put(
  '/:id/assets',
  authMiddleware({ permission: Permission.MemoryAssetCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.memory.addAssets(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/memories/:id/assets -- Remove assets from memory
app.delete(
  '/:id/assets',
  authMiddleware({ permission: Permission.MemoryAssetDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.memory.removeAssets(auth, id, body);
    return c.json(result);
  },
);

export default app;
