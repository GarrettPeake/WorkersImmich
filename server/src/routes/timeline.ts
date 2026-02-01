/**
 * Timeline routes -- Hono sub-app for timeline queries.
 *
 * Mounts on `/api/timeline` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/timeline/buckets -- Get time buckets
app.get(
  '/buckets',
  authMiddleware({ permission: Permission.TimelineRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const query = c.req.query();
    // Parse boolean query params
    const dto = {
      ...query,
      isFavorite: query.isFavorite === 'true' ? true : query.isFavorite === 'false' ? false : undefined,
      isTrashed: query.isTrashed === 'true' ? true : undefined,
      withStacked: query.withStacked === 'true' ? true : undefined,
      withPartners: query.withPartners === 'true' ? true : undefined,
      withCoordinates: query.withCoordinates === 'true' ? true : undefined,
    };
    const result = await services.timeline.getTimeBuckets(auth, dto as any);
    return c.json(result);
  },
);

// GET /api/timeline/bucket -- Get time bucket contents
app.get(
  '/bucket',
  authMiddleware({ permission: Permission.TimelineRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const query = c.req.query();
    const dto = {
      ...query,
      isFavorite: query.isFavorite === 'true' ? true : query.isFavorite === 'false' ? false : undefined,
      isTrashed: query.isTrashed === 'true' ? true : undefined,
      withStacked: query.withStacked === 'true' ? true : undefined,
      withPartners: query.withPartners === 'true' ? true : undefined,
      withCoordinates: query.withCoordinates === 'true' ? true : undefined,
    };
    const result = await services.timeline.getTimeBucket(auth, dto as any);
    return c.json(result);
  },
);

export default app;
