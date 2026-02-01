import { Hono } from 'hono';
import type { AppEnv } from './hono';
import { createServiceContext } from './context';
import { createServices } from './services';
import { HttpException } from './utils/errors';
import assetRoutes from './routes/assets';
import albumRoutes from './routes/albums';
import activityRoutes from './routes/activities';
import tagRoutes from './routes/tags';
import stackRoutes from './routes/stacks';
import memoryRoutes from './routes/memories';
import partnerRoutes from './routes/partners';
import userRoutes from './routes/users';
import adminUserRoutes from './routes/admin/users';
import adminAuthRoutes from './routes/admin/auth';
import serverRoutes from './routes/server';
import sharedLinkRoutes from './routes/shared-links';
import trashRoutes from './routes/trash';
import downloadRoutes from './routes/download';
import timelineRoutes from './routes/timeline';
import searchRoutes from './routes/search';
import syncRoutes from './routes/sync';
import systemConfigRoutes from './routes/system-config';
import systemMetadataRoutes from './routes/system-metadata';
import apiKeyRoutes from './routes/api-keys';
import viewRoutes from './routes/view';
import authRoutes from './routes/auth';
import sessionRoutes from './routes/sessions';

const app = new Hono<AppEnv>();

// Global error handler
app.onError((err, c) => {
  // Handle typed HTTP exceptions (from utils/errors.ts)
  if (err instanceof HttpException) {
    return c.json({ message: err.message, statusCode: err.statusCode }, err.statusCode as any);
  }

  // Handle Hono HTTP exceptions
  if (err && typeof (err as any).status === 'number') {
    const status = (err as any).status;
    return c.json({ message: err.message, statusCode: status }, status);
  }

  // Handle service-level errors with statusCode property (e.g. ApiKeyError)
  if (err && typeof (err as any).statusCode === 'number') {
    const status = (err as any).statusCode;
    return c.json({ message: err.message, statusCode: status }, status);
  }

  console.error('Unhandled error:', err);
  return c.json({ message: 'Internal server error', statusCode: 500 }, 500);
});

// Request logging
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
});

// ---------------------------------------------------------------------------
// Service context middleware -- runs before all route handlers.
// Creates a ServiceContext + Services and stores them on the Hono context.
// ---------------------------------------------------------------------------
app.use('*', async (c, next) => {
  const ctx = createServiceContext(c.env);
  const services = createServices(ctx);
  c.set('ctx', ctx);
  c.set('services', services);
  await next();
});

// API routes
app.route('/api/activities', activityRoutes);
app.route('/api/albums', albumRoutes);
app.route('/api/api-keys', apiKeyRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/assets', assetRoutes);
app.route('/api/download', downloadRoutes);
app.route('/api/memories', memoryRoutes);
app.route('/api/partners', partnerRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/server', serverRoutes);
app.route('/api/sessions', sessionRoutes);
app.route('/api/shared-links', sharedLinkRoutes);
app.route('/api/stacks', stackRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/system-config', systemConfigRoutes);
app.route('/api/system-metadata', systemMetadataRoutes);
app.route('/api/tags', tagRoutes);
app.route('/api/timeline', timelineRoutes);
app.route('/api/trash', trashRoutes);
app.route('/api/users', userRoutes);
app.route('/api/view', viewRoutes);
app.route('/api/admin/auth', adminAuthRoutes);
app.route('/api/admin/users', adminUserRoutes);

// Non-API routes
app.get('/.well-known/immich', (c) => {
  return c.json({ api: { endpoint: '/api' } });
});

app.get('/custom.css', (c) => {
  // TODO: Load custom CSS from system config (CP-3)
  return c.body('', 200, { 'Content-Type': 'text/css' });
});

// Fallback to static assets
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
