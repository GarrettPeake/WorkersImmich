/**
 * Search routes -- Hono sub-app for metadata-only search.
 *
 * Mounts on `/api/search` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<AppEnv>();

// POST /api/search/metadata -- Search assets by metadata
app.post(
  '/metadata',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.search.searchMetadata(auth, body);
    return c.json(result);
  },
);

// POST /api/search/statistics -- Search statistics
app.post(
  '/statistics',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.search.getStatistics(auth);
    return c.json(result);
  },
);

// POST /api/search/random -- Random search
app.post(
  '/random',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json().catch(() => ({}));
    const result = await services.search.getRandom(auth, body);
    return c.json(result);
  },
);

// POST /api/search/large-assets -- Find large assets
app.post(
  '/large-assets',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json().catch(() => ({}));
    const result = await services.search.getLargeAssets(auth, body);
    return c.json(result);
  },
);

// GET /api/search/suggestions -- Search suggestions
app.get(
  '/suggestions',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const type = c.req.query('type') || '';
    const query = c.req.query('query');
    const result = await services.search.getSuggestions(auth, { type, query });
    return c.json(result);
  },
);

export default app;
