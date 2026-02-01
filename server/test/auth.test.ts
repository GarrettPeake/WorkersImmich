import { describe, it, expect, beforeAll } from 'vitest';
import { request, authRequest, setupDatabase } from './helpers';

describe('Auth', () => {
  beforeAll(async () => {
    await setupDatabase();
  });

  // Helper to create admin in the current test's isolated storage
  async function signUpAdmin(
    email = 'admin@test.com',
    password = 'password123',
    name = 'Test Admin',
  ) {
    return request('/api/auth/admin-sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
  }

  async function login(email = 'admin@test.com', password = 'password123') {
    return request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  }

  // -------------------------------------------------------------------------
  // Admin Sign-Up
  // -------------------------------------------------------------------------
  describe('POST /api/auth/admin-sign-up', () => {
    it('should create the first admin user', async () => {
      const res = await signUpAdmin();

      expect(res.status).toBe(201);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('email');
      expect(body.email).toBe('admin@test.com');
      expect(body.name).toBe('Test Admin');
      expect(body.isAdmin).toBe(true);
    });

    it('should reject second admin sign-up', async () => {
      // Create the first admin within this test's isolated storage
      const first = await signUpAdmin();
      expect(first.status).toBe(201);

      // Now the second signup should fail
      const res = await signUpAdmin('admin2@test.com', 'password123', 'Second Admin');

      // Should fail because an admin already exists
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------
  describe('POST /api/auth/login', () => {
    it('should return an access token with valid credentials', async () => {
      // Set up admin in this test's isolated storage
      await signUpAdmin();

      const res = await login();

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty('accessToken');
      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken.length).toBeGreaterThan(0);
    });

    it('should return 401 with invalid password', async () => {
      await signUpAdmin();

      const res = await login('admin@test.com', 'wrongpassword');

      expect(res.status).toBe(401);
    });

    it('should return 401 with non-existent email', async () => {
      await signUpAdmin();

      const res = await login('nobody@test.com', 'password123');

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Token Validation
  // -------------------------------------------------------------------------
  describe('POST /api/auth/validateToken', () => {
    it('should validate a valid token', async () => {
      await signUpAdmin();
      const loginRes = await login();
      const { accessToken } = (await loginRes.json()) as any;

      const res = await authRequest('/api/auth/validateToken', accessToken, {
        method: 'POST',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty('authStatus');
      expect(body.authStatus).toBe(true);
    });

    it('should reject an invalid token', async () => {
      const res = await authRequest('/api/auth/validateToken', 'invalid-token-here', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Change Password
  // -------------------------------------------------------------------------
  describe('POST /api/auth/change-password', () => {
    it('should change the password successfully', async () => {
      await signUpAdmin();
      const loginRes = await login();
      const { accessToken } = (await loginRes.json()) as any;

      // Change password
      const res = await authRequest('/api/auth/change-password', accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: 'password123',
          newPassword: 'newpassword456',
        }),
      });

      expect(res.status).toBe(200);

      // Verify old password no longer works
      const oldLoginRes = await login('admin@test.com', 'password123');
      expect(oldLoginRes.status).toBe(401);

      // Verify new password works
      const newLoginRes = await login('admin@test.com', 'newpassword456');
      expect(newLoginRes.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------
  describe('POST /api/auth/logout', () => {
    it('should logout and invalidate the token', async () => {
      await signUpAdmin();
      const loginRes = await login();
      const { accessToken } = (await loginRes.json()) as any;

      // Logout
      const logoutRes = await authRequest('/api/auth/logout', accessToken, {
        method: 'POST',
      });

      expect(logoutRes.status).toBe(200);

      const body = (await logoutRes.json()) as any;
      expect(body).toHaveProperty('successful');
      expect(body.successful).toBe(true);

      // Verify token is now invalid
      const validateRes = await authRequest('/api/auth/validateToken', accessToken, {
        method: 'POST',
      });

      expect(validateRes.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Unauthenticated access
  // -------------------------------------------------------------------------
  describe('Unauthenticated access', () => {
    it('should reject unauthenticated requests to protected endpoints', async () => {
      const res = await request('/api/auth/validateToken', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
    });
  });
});
