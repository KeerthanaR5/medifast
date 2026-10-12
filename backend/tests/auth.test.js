const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(120000);

process.env.NODE_ENV = 'test';

jest.mock('express-rate-limit', () => {
  return () => (req, res, next) => next();
});

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    verify: jest.fn((callback) => callback(null, true)),
    sendMail: jest.fn().mockResolvedValue({
      messageId: 'test-message-id'
    })
  }))
}));

const app = require('../server');
const User = require('../models/User');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();

  const mongoUri = mongoServer.getUri();

  await mongoose.connect(mongoUri);
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('MediFast Authentication API', () => {

  // --------------------------------------------------
  // REGISTER
  // --------------------------------------------------

  describe('POST /api/auth/register', () => {

    test('should reject registration when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test User'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });

    test('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test User',
          email: 'invalid-email',
          password: 'Password@123',
          phone: '9876543210'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('valid email');
    });

    test('should reject invalid phone number', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test User',
          email: 'test@example.com',
          password: 'Password@123',
          phone: '12345'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('10-digit');
    });

    test('should reject weak password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test User',
          email: 'test@example.com',
          password: 'password',
          phone: '9876543210'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Password');
      expect(response.body.errors).toBeDefined();
    });

    test('should successfully register a valid customer', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test Customer',
          email: 'customer@example.com',
          password: 'Password@123',
          phone: '9876543210'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');

      expect(response.body.user.email).toBe('customer@example.com');
      expect(response.body.user.fullName).toBe('Test Customer');
      expect(response.body.user.role).toBe('customer');

      // Password must not be returned
      expect(response.body.user.password).toBeUndefined();
    });

    test('should reject duplicate email', async () => {
      const user = new User({
        fullName: 'Existing User',
        email: 'existing@example.com',
        password: 'Password@123',
        phone: '9876543210'
      });

      await user.save();

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Another User',
          email: 'existing@example.com',
          password: 'Password@123',
          phone: '9876543211'
        });

      expect(response.statusCode).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('email');
    });

    test('should reject duplicate phone number', async () => {
      const user = new User({
        fullName: 'Existing User',
        email: 'existing@example.com',
        password: 'Password@123',
        phone: '9876543210'
      });

      await user.save();

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Another User',
          email: 'another@example.com',
          password: 'Password@123',
          phone: '9876543210'
        });

      expect(response.statusCode).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('phone');
    });
  });

  // --------------------------------------------------
  // LOGIN
  // --------------------------------------------------

  describe('POST /api/auth/login', () => {

    beforeEach(async () => {
      const user = new User({
        fullName: 'Login Test User',
        email: 'login@example.com',
        password: 'Password@123',
        phone: '9123456780'
      });

      await user.save();
    });

    test('should reject login when email or password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });

    test('should reject login for non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'doesnotexist@example.com',
          password: 'Password@123'
        });

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid email or password');
    });

    test('should reject incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword@123'
        });

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid email or password');
    });

    test('should successfully login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Password@123'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');

      expect(typeof response.body.token).toBe('string');

      expect(response.body.user.email).toBe('login@example.com');
      expect(response.body.user.role).toBe('customer');

      // Password must not be returned
      expect(response.body.user.password).toBeUndefined();

      // Refresh token should be HTTP-only cookie
      expect(response.headers['set-cookie']).toBeDefined();
    });

    test('should reject login for inactive account', async () => {
      await User.updateOne(
        { email: 'login@example.com' },
        { isActive: false }
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Password@123'
        });

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('deactivated');
    });
  });

  // --------------------------------------------------
  // PROFILE
  // --------------------------------------------------

  describe('GET /api/auth/profile', () => {

    test('should reject request without authentication token', async () => {
      const response = await request(app)
        .get('/api/auth/profile');

      expect(response.statusCode).toBe(401);
    });

    test('should return profile for authenticated user', async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Profile User',
          email: 'profile@example.com',
          password: 'Password@123',
          phone: '9988776655'
        });

      const token = registerResponse.body.token;

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe('profile@example.com');
    });
  });

  // --------------------------------------------------
  // TOKEN VALIDATION
  // --------------------------------------------------

  describe('POST /api/auth/validate-token', () => {

    test('should reject request without token', async () => {
      const response = await request(app)
        .post('/api/auth/validate-token');

      expect(response.statusCode).toBe(401);
    });

    test('should validate a valid access token', async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Token User',
          email: 'token@example.com',
          password: 'Password@123',
          phone: '9000011111'
        });

      const token = registerResponse.body.token;

      const response = await request(app)
        .post('/api/auth/validate-token')
        .set('Authorization', `Bearer ${token}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Token is valid');
      expect(response.body.user).toBeDefined();
    });
  });

  // --------------------------------------------------
  // VERIFY EMAIL PLACEHOLDER
  // --------------------------------------------------

  describe('Email verification endpoints', () => {

    test('verify-email should currently return 501', async () => {
      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({
          token: 'test-token'
        });

      expect(response.statusCode).toBe(501);
      expect(response.body.success).toBe(false);
    });

    test('resend-verification should currently return 501', async () => {
      const response = await request(app)
        .post('/api/auth/resend-verification')
        .send({
          email: 'test@example.com'
        });

      expect(response.statusCode).toBe(501);
      expect(response.body.success).toBe(false);
    });
  });

});