/**
 * System config routes -- Hono sub-app for system configuration.
 *
 * Mounts on `/api/system-config` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/system-config -- Get config
app.get(
  '/',
  authMiddleware({ admin: true, permission: Permission.SystemConfigRead }),
  async (c) => {
    const services = c.get('services');
    const result = await services.systemConfig.getSystemConfig();
    return c.json(result);
  },
);

// GET /api/system-config/defaults -- Get defaults
app.get(
  '/defaults',
  authMiddleware({ admin: true, permission: Permission.SystemConfigRead }),
  async (c) => {
    const services = c.get('services');
    const result = services.systemConfig.getDefaults();
    return c.json(result);
  },
);

// PUT /api/system-config -- Update config
app.put(
  '/',
  authMiddleware({ admin: true, permission: Permission.SystemConfigUpdate }),
  async (c) => {
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.systemConfig.updateSystemConfig(body);
    return c.json(result);
  },
);

export default app;
