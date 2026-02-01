import { describe, it, expect, beforeAll } from 'vitest';
import { request, authRequest, setupDatabase, createTestAdmin } from './helpers';

describe('Server Info', () => {
  beforeAll(async () => {
    await setupDatabase();
  });

  // -------------------------------------------------------------------------
  // Ping
  // -------------------------------------------------------------------------
  describe('GET /api/server/ping', () => {
    it('should return pong', async () => {
      const res = await request('/api/server/ping');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body).toHaveProperty('res');
      expect(body.res).toBe('pong');
    });
  });

  // -------------------------------------------------------------------------
  // Version
  // -------------------------------------------------------------------------
  describe('GET /api/server/version', () => {
    it('should return version info', async () => {
      const res = await request('/api/server/version');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body).toHaveProperty('major');
      expect(body).toHaveProperty('minor');
      expect(body).toHaveProperty('patch');
      expect(typeof body.major).toBe('number');
      expect(typeof body.minor).toBe('number');
      expect(typeof body.patch).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // Features
  // -------------------------------------------------------------------------
  describe('GET /api/server/features', () => {
    it('should return feature flags', async () => {
      const res = await request('/api/server/features');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      // Feature flags should be an object with boolean values
      expect(typeof body).toBe('object');
      expect(body).not.toBeNull();
      // Check for common feature flag keys
      if ('smartSearch' in body) {
        expect(typeof body.smartSearch).toBe('boolean');
      }
      if ('trash' in body) {
        expect(typeof body.trash).toBe('boolean');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------
  describe('GET /api/server/config', () => {
    it('should return server config', async () => {
      const res = await request('/api/server/config');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(typeof body).toBe('object');
      expect(body).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Media Types
  // -------------------------------------------------------------------------
  describe('GET /api/server/media-types', () => {
    it('should return supported media types', async () => {
      const res = await request('/api/server/media-types');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(typeof body).toBe('object');
      expect(body).not.toBeNull();
      // Should have image and/or video arrays
      if ('image' in body) {
        expect(Array.isArray(body.image)).toBe(true);
      }
      if ('video' in body) {
        expect(Array.isArray(body.video)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Version History
  // -------------------------------------------------------------------------
  describe('GET /api/server/version-history', () => {
    it('should return version history array', async () => {
      const res = await request('/api/server/version-history');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      // Version history should be an array (possibly empty on first run)
      expect(Array.isArray(body)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Theme
  // -------------------------------------------------------------------------
  describe('GET /api/server/theme', () => {
    it('should return theme config', async () => {
      const res = await request('/api/server/theme');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(typeof body).toBe('object');
      expect(body).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // About (requires auth)
  // -------------------------------------------------------------------------
  describe('GET /api/server/about', () => {
    it('should return server about info', async () => {
      const { token } = await createTestAdmin();
      const res = await authRequest('/api/server/about', token);
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('versionUrl');
      expect(typeof body.version).toBe('string');
      expect(body.version).toMatch(/^v\d+\.\d+\.\d+$/);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request('/api/server/about');
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // .well-known/immich discovery
  // -------------------------------------------------------------------------
  describe('GET /.well-known/immich', () => {
    it('should return API endpoint discovery', async () => {
      const res = await request('/.well-known/immich');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body).toHaveProperty('api');
      expect(body.api).toHaveProperty('endpoint');
      expect(body.api.endpoint).toBe('/api');
    });
  });
});
