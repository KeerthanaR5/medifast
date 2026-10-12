const request = require('supertest');

process.env.NODE_ENV = 'test';

const app = require('../server');

describe('MediFast Backend API', () => {
  describe('GET /api/status', () => {
    test('should return the backend online status', async () => {
      const response = await request(app)
        .get('/api/status');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('online');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /unknown-route', () => {
    test('should return 404 for an unknown route', async () => {
      const response = await request(app)
        .get('/api/unknown-route');

      expect(response.statusCode).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Route');
    });
  });

  describe('Request ID', () => {
    test('should include X-Request-ID header', async () => {
      const response = await request(app)
        .get('/api/status');

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).not.toBe('');
    });
  });
});