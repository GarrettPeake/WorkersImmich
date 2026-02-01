/**
 * Server routes -- Hono sub-app for server info endpoints.
 *
 * Mounts on `/api/server` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/server/about -- Server about info
app.get(
  '/about',
  authMiddleware({ permission: Permission.ServerAbout }),
  async (c) => {
    const services = c.get('services');
    const result = await services.server.getAboutInfo();
    return c.json(result);
  },
);

// GET /api/server/apk-links -- APK download links
app.get(
  '/apk-links',
  authMiddleware({ permission: Permission.ServerApkLinks }),
  async (c) => {
    const services = c.get('services');
    const result = services.server.getApkLinks();
    return c.json(result);
  },
);

// GET /api/server/storage -- Server storage info
app.get(
  '/storage',
  authMiddleware({ permission: Permission.ServerStorage }),
  async (c) => {
    const services = c.get('services');
    const result = await services.server.getStorage();
    return c.json(result);
  },
);

// GET /api/server/ping -- Ping
app.get(
  '/ping',
  async (c) => {
    const services = c.get('services');
    const result = services.server.ping();
    return c.json(result);
  },
);

// GET /api/server/version -- Server version
app.get(
  '/version',
  async (c) => {
    const services = c.get('services');
    const result = services.server.getVersion();
    return c.json(result);
  },
);

// GET /api/server/version-history -- Version history
app.get(
  '/version-history',
  async (c) => {
    const services = c.get('services');
    const result = await services.server.getVersionHistory();
    return c.json(result);
  },
);

// GET /api/server/features -- Server features
app.get(
  '/features',
  async (c) => {
    const services = c.get('services');
    const result = await services.server.getFeatures();
    return c.json(result);
  },
);

// GET /api/server/theme -- Server theme
app.get(
  '/theme',
  async (c) => {
    const services = c.get('services');
    const result = await services.server.getTheme();
    return c.json(result);
  },
);

// GET /api/server/config -- Server config
app.get(
  '/config',
  async (c) => {
    const services = c.get('services');
    const result = await services.server.getSystemConfig();
    return c.json(result);
  },
);

// GET /api/server/statistics -- Server statistics (admin)
app.get(
  '/statistics',
  authMiddleware({ permission: Permission.ServerStatistics, admin: true }),
  async (c) => {
    const services = c.get('services');
    const result = await services.server.getStatistics();
    return c.json(result);
  },
);

// GET /api/server/media-types -- Supported media types
app.get(
  '/media-types',
  async (c) => {
    const services = c.get('services');
    const result = services.server.getSupportedMediaTypes();
    return c.json(result);
  },
);

// GET /api/server/license -- Get server license (admin)
app.get(
  '/license',
  authMiddleware({ permission: Permission.ServerLicenseRead, admin: true }),
  async (c) => {
    const services = c.get('services');
    const result = await services.server.getLicense();
    return c.json(result);
  },
);

// PUT /api/server/license -- Set server license (admin)
app.put(
  '/license',
  authMiddleware({ permission: Permission.ServerLicenseUpdate, admin: true }),
  async (c) => {
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.server.setLicense(body);
    return c.json(result);
  },
);

// DELETE /api/server/license -- Delete server license (admin)
app.delete(
  '/license',
  authMiddleware({ permission: Permission.ServerLicenseDelete, admin: true }),
  async (c) => {
    const services = c.get('services');
    await services.server.deleteLicense();
    return c.body(null, 204);
  },
);

// GET /api/server/version-check -- Version check status
app.get(
  '/version-check',
  authMiddleware({ permission: Permission.ServerVersionCheck }),
  async (c) => {
    const services = c.get('services');
    const result = await services.server.getVersionCheck();
    return c.json(result);
  },
);

export default app;
