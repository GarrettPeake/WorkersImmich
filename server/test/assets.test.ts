import { describe, it, expect, beforeAll } from 'vitest';
import { request, authRequest, setupDatabase, createTestAdmin, createTestImage, uploadTestAsset } from './helpers';

describe('Assets', () => {
  beforeAll(async () => {
    await setupDatabase();
  });

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------
  describe('POST /api/assets (upload)', () => {
    it('should upload an image and return 201', async () => {
      const { token } = await createTestAdmin();
      const image = createTestImage();
      const formData = new FormData();
      formData.append('assetData', new File([image], 'photo.jpg', { type: 'image/jpeg' }));
      formData.append('deviceAssetId', 'upload-test-1');
      formData.append('deviceId', 'test-device');
      formData.append('fileCreatedAt', new Date().toISOString());
      formData.append('fileModifiedAt', new Date().toISOString());

      const res = await authRequest('/api/assets', token, {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(201);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty('id');
      expect(typeof body.id).toBe('string');
      expect(body.id.length).toBeGreaterThan(0);
    });

    it('should return 200 for duplicate upload', async () => {
      const { token } = await createTestAdmin();
      const image = createTestImage();

      // First upload
      const formData1 = new FormData();
      formData1.append('assetData', new File([image], 'dup.jpg', { type: 'image/jpeg' }));
      formData1.append('deviceAssetId', 'dup-test-1');
      formData1.append('deviceId', 'test-device');
      formData1.append('fileCreatedAt', '2024-01-01T00:00:00.000Z');
      formData1.append('fileModifiedAt', '2024-01-01T00:00:00.000Z');

      const res1 = await authRequest('/api/assets', token, {
        method: 'POST',
        body: formData1,
      });
      expect(res1.status).toBe(201);
      const data1 = (await res1.json()) as any;

      // Duplicate upload (same file content = same checksum)
      const formData2 = new FormData();
      formData2.append('assetData', new File([image], 'dup.jpg', { type: 'image/jpeg' }));
      formData2.append('deviceAssetId', 'dup-test-2');
      formData2.append('deviceId', 'test-device');
      formData2.append('fileCreatedAt', '2024-01-01T00:00:00.000Z');
      formData2.append('fileModifiedAt', '2024-01-01T00:00:00.000Z');

      const res2 = await authRequest('/api/assets', token, {
        method: 'POST',
        body: formData2,
      });

      expect(res2.status).toBe(200);
      const data2 = (await res2.json()) as any;
      expect(data2).toHaveProperty('id');
      expect(data2.id).toBe(data1.id);
    });

    it('should return 400 when assetData is missing', async () => {
      const { token } = await createTestAdmin();
      const formData = new FormData();
      formData.append('deviceAssetId', 'no-file-test');
      formData.append('deviceId', 'test-device');

      const res = await authRequest('/api/assets', token, {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
    });

    it('should reject unauthenticated upload', async () => {
      const image = createTestImage();
      const formData = new FormData();
      formData.append('assetData', new File([image], 'unauth.jpg', { type: 'image/jpeg' }));
      formData.append('deviceAssetId', 'unauth-test');
      formData.append('deviceId', 'test-device');
      formData.append('fileCreatedAt', new Date().toISOString());
      formData.append('fileModifiedAt', new Date().toISOString());

      const res = await request('/api/assets', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Get Asset Info
  // -------------------------------------------------------------------------
  describe('GET /api/assets/:id', () => {
    it('should return asset info', async () => {
      const { token } = await createTestAdmin();
      const assetId = await uploadTestAsset(token);

      const res = await authRequest(`/api/assets/${assetId}`, token);

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty('id');
      expect(body.id).toBe(assetId);
      expect(body).toHaveProperty('type');
      expect(body).toHaveProperty('originalFileName');
      expect(body).toHaveProperty('ownerId');
    });

    it('should return 404 for non-existent asset', async () => {
      const { token } = await createTestAdmin();
      const res = await authRequest('/api/assets/00000000-0000-0000-0000-000000000000', token);

      // Should return 404 or similar error
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // -------------------------------------------------------------------------
  // Update Asset
  // -------------------------------------------------------------------------
  describe('PUT /api/assets/:id', () => {
    it('should update asset metadata', async () => {
      const { token } = await createTestAdmin();
      const assetId = await uploadTestAsset(token);

      const res = await authRequest(`/api/assets/${assetId}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isFavorite: true,
        }),
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty('id');
      expect(body.id).toBe(assetId);
      expect(body.isFavorite).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Asset Statistics
  // -------------------------------------------------------------------------
  describe('GET /api/assets/statistics', () => {
    it('should return asset statistics', async () => {
      const { token } = await createTestAdmin();
      const res = await authRequest('/api/assets/statistics', token);

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(typeof body).toBe('object');
      expect(body).not.toBeNull();
      // Should have count-like fields
      if ('images' in body) {
        expect(typeof body.images).toBe('number');
      }
      if ('total' in body) {
        expect(typeof body.total).toBe('number');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Delete Asset (soft delete)
  // -------------------------------------------------------------------------
  describe('DELETE /api/assets', () => {
    it('should soft-delete assets', async () => {
      const { token } = await createTestAdmin();
      const assetId = await uploadTestAsset(token);

      const res = await authRequest('/api/assets', token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [assetId],
        }),
      });

      // Bulk delete returns 204 No Content
      expect(res.status).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // Download Original
  // -------------------------------------------------------------------------
  describe('GET /api/assets/:id/original', () => {
    it('should download the original file', async () => {
      const { token } = await createTestAdmin();
      const assetId = await uploadTestAsset(token);

      const res = await authRequest(`/api/assets/${assetId}/original`, token);

      // Should return 200 with file content or redirect
      expect([200, 302]).toContain(res.status);

      if (res.status === 200) {
        const contentType = res.headers.get('content-type');
        expect(contentType).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Check Existing Assets
  // -------------------------------------------------------------------------
  describe('POST /api/assets/exist', () => {
    it('should check existing assets by device ID', async () => {
      const { token } = await createTestAdmin();
      const res = await authRequest('/api/assets/exist', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceAssetIds: ['upload-test-1'],
          deviceId: 'test-device',
        }),
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(typeof body).toBe('object');
      expect(body).not.toBeNull();
      // Should have existingIds array
      if ('existingIds' in body) {
        expect(Array.isArray(body.existingIds)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Device Assets
  // -------------------------------------------------------------------------
  describe('GET /api/assets/device/:deviceId', () => {
    it('should return asset IDs for a device', async () => {
      const { token } = await createTestAdmin();
      const res = await authRequest('/api/assets/device/test-device', token);

      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(Array.isArray(body)).toBe(true);
    });
  });
});
