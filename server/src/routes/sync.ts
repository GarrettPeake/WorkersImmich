/**
 * Sync routes -- Hono sub-app for sync protocol.
 *
 * Mounts on `/api/sync` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// POST /api/sync/full-sync -- Legacy full sync (deprecated but functional)
app.post(
  '/full-sync',
  authMiddleware({ permission: Permission.TimelineRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.sync.getFullSync(auth, body);
    return c.json(result);
  },
);

// POST /api/sync/delta-sync -- Legacy delta sync (deprecated but functional)
app.post(
  '/delta-sync',
  authMiddleware({ permission: Permission.TimelineRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.sync.getDeltaSync(auth, body);
    return c.json(result);
  },
);

// POST /api/sync/stream -- JSON Lines streaming sync
app.post(
  '/stream',
  authMiddleware({ permission: Permission.SyncStream }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const response = await services.sync.stream(auth, body);
    return response;
  },
);

// GET /api/sync/ack -- Get checkpoints
app.get(
  '/ack',
  authMiddleware({ permission: Permission.SyncCheckpointRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.sync.getAcks(auth);
    return c.json(result);
  },
);

// POST /api/sync/ack -- Set checkpoints
app.post(
  '/ack',
  authMiddleware({ permission: Permission.SyncCheckpointUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    await services.sync.setAcks(auth, body);
    return c.body(null, 204);
  },
);

// DELETE /api/sync/ack -- Delete checkpoints
app.delete(
  '/ack',
  authMiddleware({ permission: Permission.SyncCheckpointDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json().catch(() => ({}));
    await services.sync.deleteAcks(auth, body);
    return c.body(null, 204);
  },
);

export default app;
