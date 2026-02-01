import { describe, it, expect, beforeAll } from 'vitest';
import { request, authRequest, setupDatabase, createTestAdmin } from './helpers';

describe('Users', () => {
  beforeAll(async () => {
    await setupDatabase();
  });

  // -------------------------------------------------------------------------
  // Get Current User
  // -------------------------------------------------------------------------
  describe('GET /api/users/me', () => {
    it('should return the current user', async () => {
      const { token } = await createTestAdmin();
      const res = await authRequest('/api/users/me', token);

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('email');
      expect(body.email).toBe('admin@test.com');
      expect(body).toHaveProperty('name');
      expect(body.name).toBe('Test Admin');
      expect(body).toHaveProperty('isAdmin');
      expect(body.isAdmin).toBe(true);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request('/api/users/me');

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Update Current User
  // -------------------------------------------------------------------------
  describe('PUT /api/users/me', () => {
    it('should update the current user name', async () => {
      const { token } = await createTestAdmin();
      const res = await authRequest('/api/users/me', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Admin Name',
        }),
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty('name');
      expect(body.name).toBe('Updated Admin Name');

      // Verify the update persisted
      const verifyRes = await authRequest('/api/users/me', token);
      const verifyBody = (await verifyRes.json()) as any;
      expect(verifyBody.name).toBe('Updated Admin Name');
    });
  });

  // -------------------------------------------------------------------------
  // User Preferences
  // -------------------------------------------------------------------------
  describe('GET /api/users/me/preferences', () => {
    it('should return user preferences with all required fields', async () => {
      const { token } = await createTestAdmin();
      const res = await authRequest('/api/users/me/preferences', token);

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(typeof body).toBe('object');
      expect(body).not.toBeNull();

      // Verify all required top-level sections exist
      expect(body).toHaveProperty('albums');
      expect(body).toHaveProperty('folders');
      expect(body).toHaveProperty('memories');
      expect(body).toHaveProperty('people');
      expect(body).toHaveProperty('ratings');
      expect(body).toHaveProperty('sharedLinks');
      expect(body).toHaveProperty('tags');
      expect(body).toHaveProperty('emailNotifications');
      expect(body).toHaveProperty('download');
      expect(body).toHaveProperty('purchase');
      expect(body).toHaveProperty('cast');

      // Verify people section has the fields the frontend accesses
      expect(body.people).toHaveProperty('enabled');
      expect(body.people).toHaveProperty('sidebarWeb');
      expect(typeof body.people.enabled).toBe('boolean');
      expect(typeof body.people.sidebarWeb).toBe('boolean');

      // Verify folders section
      expect(body.folders).toHaveProperty('enabled');
      expect(body.folders).toHaveProperty('sidebarWeb');

      // Verify sharedLinks section
      expect(body.sharedLinks).toHaveProperty('enabled');
      expect(body.sharedLinks).toHaveProperty('sidebarWeb');

      // Verify tags section
      expect(body.tags).toHaveProperty('enabled');
      expect(body.tags).toHaveProperty('sidebarWeb');

      // Verify memories section
      expect(body.memories).toHaveProperty('enabled');
      expect(body.memories).toHaveProperty('duration');
    });
  });

  describe('PUT /api/users/me/preferences', () => {
    it('should update user preferences', async () => {
      const { token } = await createTestAdmin();
      const res = await authRequest('/api/users/me/preferences', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memories: { enabled: false },
        }),
      });

      // Should succeed (200)
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(typeof body).toBe('object');
    });
  });

  // -------------------------------------------------------------------------
  // Frontend parallel calls (getMyUser + getMyPreferences + getAboutInfo)
  // -------------------------------------------------------------------------
  describe('Frontend post-login parallel calls', () => {
    it('should succeed for all three calls the frontend makes after login', async () => {
      const { token } = await createTestAdmin();

      // The frontend does Promise.all([getMyUser(), getMyPreferences(), getAboutInfo()])
      // If ANY of these fails, preferences stays undefined and $preferences.people crashes
      const [userRes, prefsRes, aboutRes] = await Promise.all([
        authRequest('/api/users/me', token),
        authRequest('/api/users/me/preferences', token),
        authRequest('/api/server/about', token),
      ]);

      // All three must return 200
      expect(userRes.status).toBe(200);
      expect(prefsRes.status).toBe(200);
      expect(aboutRes.status).toBe(200);

      // Verify preferences has the people section the frontend accesses
      const prefs = (await prefsRes.json()) as any;
      expect(prefs).toHaveProperty('people');
      expect(prefs.people).toHaveProperty('enabled');
      expect(typeof prefs.people.enabled).toBe('boolean');

      // Verify about has version
      const about = (await aboutRes.json()) as any;
      expect(about).toHaveProperty('version');

      // Verify user has required fields
      const user = (await userRes.json()) as any;
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
    });
  });

  // -------------------------------------------------------------------------
  // List Users (regular user endpoint)
  // -------------------------------------------------------------------------
  describe('GET /api/users', () => {
    it('should return list of users', async () => {
      const { token } = await createTestAdmin();
      const res = await authRequest('/api/users', token);

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      // First user should be the admin
      const admin = body.find((u: any) => u.email === 'admin@test.com');
      expect(admin).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Admin: Create User
  // -------------------------------------------------------------------------
  describe('POST /api/admin/users', () => {
    it('should create a new user as admin', async () => {
      const { token } = await createTestAdmin();

      const res = await authRequest('/api/admin/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@test.com',
          password: 'userpass123',
          name: 'New User',
        }),
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('email');
      expect(body.email).toBe('newuser@test.com');
      expect(body.name).toBe('New User');
    });

    it('should reject creating duplicate email', async () => {
      const { token } = await createTestAdmin();

      // Create user first
      await authRequest('/api/admin/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@test.com',
          password: 'anotherpass',
          name: 'First User',
        }),
      });

      // Try to create duplicate
      const res = await authRequest('/api/admin/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@test.com',
          password: 'anotherpass',
          name: 'Duplicate User',
        }),
      });

      // Should fail with conflict or bad request
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // -------------------------------------------------------------------------
  // Admin: List Users
  // -------------------------------------------------------------------------
  describe('GET /api/admin/users', () => {
    it('should list all users as admin', async () => {
      const { token } = await createTestAdmin();

      // Create another user so we have at least 2
      await authRequest('/api/admin/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@test.com',
          password: 'userpass123',
          name: 'New User',
        }),
      });

      const res = await authRequest('/api/admin/users', token);

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(2); // admin + newly created user
    });

    it('should reject non-admin access', async () => {
      const { token } = await createTestAdmin();

      // Create a non-admin user
      await authRequest('/api/admin/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@test.com',
          password: 'userpass123',
          name: 'New User',
        }),
      });

      // Login as the non-admin user
      const loginRes = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@test.com',
          password: 'userpass123',
        }),
      });

      if (loginRes.status === 200) {
        const { accessToken } = (await loginRes.json()) as any;

        const res = await authRequest('/api/admin/users', accessToken);

        // Non-admin should be forbidden
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Admin: Get User by ID
  // -------------------------------------------------------------------------
  describe('GET /api/admin/users/:id', () => {
    it('should get a user by ID as admin', async () => {
      const { token } = await createTestAdmin();

      // First get the list to find a user ID
      const listRes = await authRequest('/api/admin/users', token);
      const users = (await listRes.json()) as any[];

      if (users.length > 0) {
        const targetId = users[0].id;
        const res = await authRequest(`/api/admin/users/${targetId}`, token);

        expect(res.status).toBe(200);

        const body = (await res.json()) as any;
        expect(body).toHaveProperty('id');
        expect(body.id).toBe(targetId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Get User by ID (regular endpoint)
  // -------------------------------------------------------------------------
  describe('GET /api/users/:id', () => {
    it('should get a user by ID', async () => {
      const { token } = await createTestAdmin();

      // Get user list first
      const listRes = await authRequest('/api/users', token);
      const users = (await listRes.json()) as any[];

      if (users.length > 0) {
        const targetId = users[0].id;
        const res = await authRequest(`/api/users/${targetId}`, token);

        expect(res.status).toBe(200);

        const body = (await res.json()) as any;
        expect(body).toHaveProperty('id');
        expect(body.id).toBe(targetId);
      }
    });
  });
});
