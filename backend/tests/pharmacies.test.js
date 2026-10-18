const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(120000);

process.env.NODE_ENV = 'test';

// Disable rate limiting during tests.
jest.mock('express-rate-limit', () => {
  return () => (req, res, next) => next();
});

// Mock Overpass so tests never call the real external API.
jest.mock('../services/overpassService', () => ({
  queryPharmacies: jest.fn(),
  queryNearbyCached: jest.fn()
}));

const {
  queryPharmacies,
  queryNearbyCached
} = require('../services/overpassService');

const app = require('../server');

const Pharmacy = require('../models/Pharmacy');
const Medicine = require('../models/Medicine');
const User = require('../models/User');
const Stock = require('../models/Stock');

let mongoServer;

const TEST_LAT = 12.9716;
const TEST_LON = 77.5946;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Create indexes required by pharmacy geospatial queries
  await Pharmacy.createIndexes();
  await Stock.createIndexes();
  await Medicine.createIndexes();
  await User.createIndexes();
});

afterEach(async () => {
  await Promise.all([
    Pharmacy.deleteMany({}),
    Medicine.deleteMany({}),
    Stock.deleteMany({}),
    User.deleteMany({})
  ]);

  jest.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

async function createUser(overrides = {}) {
  return User.create({
    fullName: 'Pharmacy Owner',
    email: `owner${Date.now()}@example.com`,
    password: 'Test@1234',
    phone: '9876543210',
    role: 'pharmacy',
    userType: 'pharmacy',
    ...overrides
  });
}

async function loginUser(user) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: user.email,
      password: 'Test@1234'
    });

  expect(response.statusCode).toBe(200);

  return response.body.accessToken || response.body.token;
}

async function createPharmacy(overrides = {}) {
  return Pharmacy.create({
    name: 'Test Medical Pharmacy',
    licenseNumber: `KA-${Date.now()}-12345`,
    addressNormalized: 'MG Road Bengaluru Karnataka India',
    address: {
      street: 'MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      zipCode: '560001',
      country: 'India',
      coordinates: [TEST_LON, TEST_LAT]
    },
    location: {
      type: 'Point',
      coordinates: [TEST_LON, TEST_LAT]
    },
    contact_info: {
      phone: '9876543210'
    },
    verified: 'auto',
    ...overrides
  });
}

async function createMedicine(overrides = {}) {
  return Medicine.create({
    name: 'Paracetamol',
    generic_name: 'Paracetamol',
    category: 'Pain Relief',
    ...overrides
  });
}

describe('Pharmacy API', () => {

  // ---------------------------------------------------------
  // PHARMACY DETAIL
  // ---------------------------------------------------------

  describe('GET /api/pharmacies/:id/detail', () => {

    test('should return pharmacy details', async () => {
      const pharmacy = await createPharmacy();

      const response = await request(app)
        .get(`/api/pharmacies/${pharmacy._id}/detail`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.data.pharmacy).toBeDefined();
      expect(response.body.data.pharmacy._id.toString())
        .toBe(pharmacy._id.toString());

      expect(response.body.data.pharmacy.name)
        .toBe('Test Medical Pharmacy');
    });

    test('should return 400 for invalid pharmacy id', async () => {
      const response = await request(app)
        .get('/api/pharmacies/123/detail');

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid pharmacy id');
    });

    test('should return 404 when pharmacy does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/pharmacies/${fakeId}/detail`);

      expect(response.statusCode).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Pharmacy not found');
    });

    test('should calculate distance when latitude and longitude are supplied', async () => {
      const pharmacy = await createPharmacy();

      const response = await request(app)
        .get(`/api/pharmacies/${pharmacy._id}/detail`)
        .query({
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect(response.statusCode).toBe(200);

      expect(response.body.data.pharmacy.distance_m)
        .toBeCloseTo(0, 0);
    });

  });


  // ---------------------------------------------------------
  // NEARBY
  // ---------------------------------------------------------

  describe('GET /api/pharmacies/nearby', () => {

    test('should return 400 when coordinates are missing', async () => {
      const response = await request(app)
        .get('/api/pharmacies/nearby');

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message)
        .toContain('lat and lon are required');
    });

    test('should return nearby pharmacies from Overpass', async () => {
      queryPharmacies.mockResolvedValue([
        {
          pharmacy_name: 'External Pharmacy',
          coordinates: {
            lat: TEST_LAT,
            lon: TEST_LON
          },
          address: 'MG Road',
          opening_hours: '09:00-18:00',
          osm_type: 'node',
          osm_id: '12345'
        }
      ]);

      const response = await request(app)
        .get('/api/pharmacies/nearby')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON,
          radius: 3000
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.data).toHaveLength(1);

      expect(queryPharmacies).toHaveBeenCalledWith(
        TEST_LAT,
        TEST_LON,
        3000
      );
    });

    test('should return 502 when Overpass fails', async () => {
      queryPharmacies.mockRejectedValue(
        new Error('Overpass unavailable')
      );

      const response = await request(app)
        .get('/api/pharmacies/nearby')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect(response.statusCode).toBe(502);
      expect(response.body.success).toBe(false);
      expect(response.body.message)
        .toBe('Failed to query Overpass API');
    });

  });


  // ---------------------------------------------------------
  // SEARCH EXTERNAL
  // ---------------------------------------------------------

  describe('GET /api/pharmacies/search-external', () => {

    test('should return 400 when coordinates are missing', async () => {
      const response = await request(app)
        .get('/api/pharmacies/search-external');

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should return external pharmacies', async () => {
      queryPharmacies.mockResolvedValue([
        {
          pharmacy_name: 'External Pharmacy',
          coordinates: {
            lat: TEST_LAT + 0.001,
            lon: TEST_LON + 0.001
          },
          address: 'Bengaluru',
          opening_hours: '09:00-18:00',
          osm_type: 'node',
          osm_id: '999'
        }
      ]);

      const response = await request(app)
        .get('/api/pharmacies/search-external')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON,
          radius: 3000
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].verified).toBe(false);
      expect(response.body.data[0].source).toBe('overpass');
    });

    test('should support demo stock injection', async () => {
      queryPharmacies.mockResolvedValue([
        {
          pharmacy_name: 'External Pharmacy',
          coordinates: {
            lat: TEST_LAT + 0.001,
            lon: TEST_LON + 0.001
          },
          address: 'Bengaluru',
          osm_type: 'node',
          osm_id: '999'
        }
      ]);

      const response = await request(app)
        .get('/api/pharmacies/search-external')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON,
          radius: 3000,
          demo: '1'
        });

      expect(response.statusCode).toBe(200);

      expect(response.body.data[0].stock).toBeDefined();
      expect(response.body.data[0].stock.demo).toBe(true);
    });

  });


  // ---------------------------------------------------------
  // UNIFIED SEARCH
  // ---------------------------------------------------------

  describe('GET /api/pharmacies/search-unified', () => {

    test('should require coordinates', async () => {
      const response = await request(app)
        .get('/api/pharmacies/search-unified')
        .query({
          medicine: 'Paracetamol'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should require medicine query', async () => {
      const response = await request(app)
        .get('/api/pharmacies/search-unified')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message)
        .toBe('medicine query is required');
    });

    test('should return empty results when medicine does not exist', async () => {
      const response = await request(app)
        .get('/api/pharmacies/search-unified')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON,
          medicine: 'MedicineThatDoesNotExist'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.results).toEqual([]);
    });

    test('should return verified pharmacy with stock', async () => {
      const medicine = await createMedicine();

      const pharmacy = await createPharmacy();

      await Stock.create({
        pharmacy: pharmacy._id,
        medicine: medicine._id,
        medicineName: medicine.name,
        quantity: 25,
        unit: 'tabs',
        unitPrice: 5,
        lastUpdated: new Date()
      });

      queryPharmacies.mockResolvedValue([]);

const response = await request(app)
        .get('/api/pharmacies/search-unified')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON,
          medicine: 'Paracetamol'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.results.length).toBe(1);

      const result = response.body.results[0];

      expect(result.name).toBe('Test Medical Pharmacy');
      expect(result.verified).toBe(true);
      expect(result.stock).toBeDefined();
      expect(result.stock.quantity).toBe(25);
    });
        test('should return verified pharmacies when Overpass fails', async () => {
      const medicine = await createMedicine();
      const pharmacy = await createPharmacy();

      await Stock.create({
        pharmacy: pharmacy._id,
        medicine: medicine._id,
        medicineName: medicine.name,
        quantity: 25,
        unit: 'tabs',
        unitPrice: 5,
        lastUpdated: new Date()
      });

      // Simulate an external Overpass API outage
      queryPharmacies.mockRejectedValueOnce(
        new Error('Overpass API unavailable')
      );

      const response = await request(app)
        .get('/api/pharmacies/search-unified')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON,
          medicine: 'Paracetamol'
        });

      expect(queryPharmacies).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.results).toHaveLength(1);

      const result = response.body.results[0];

      expect(result.name).toBe('Test Medical Pharmacy');
      expect(result.verified).toBe(true);
      expect(result.stock.quantity).toBe(25);
    });
  });
  // ---------------------------------------------------------
  // NORMAL SEARCH
  // ---------------------------------------------------------

  describe('GET /api/pharmacies/search', () => {

    test('should require coordinates', async () => {
      const response = await request(app)
        .get('/api/pharmacies/search')
        .query({
          medicine: 'Paracetamol'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should require medicine query', async () => {
      const response = await request(app)
        .get('/api/pharmacies/search')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message)
        .toBe('medicine query is required');
    });

    test('should return empty pharmacy results when medicine does not exist', async () => {
      queryNearbyCached.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/pharmacies/search')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON,
          medicine: 'UnknownMedicine'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.notice)
        .toContain('No matching medicine found');

      expect(response.body.results).toEqual([]);
    });

    test('should find pharmacy with medicine stock', async () => {
      const medicine = await createMedicine();

      const pharmacy = await createPharmacy();

      await Stock.create({
        pharmacy: pharmacy._id,
        medicine: medicine._id,
        medicineName: medicine.name,
        quantity: 15,
        unit: 'tabs',
        unitPrice: 4,
        lastUpdated: new Date()
      });

      queryNearbyCached.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/pharmacies/search')
        .query({
          lat: TEST_LAT,
          lon: TEST_LON,
          medicine: 'Paracetamol'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.results.length).toBe(1);

      const result = response.body.results[0];

      expect(result.name).toBe('Test Medical Pharmacy');
      expect(result.verified).toBe(true);
      expect(result.stock).toBeDefined();
      expect(result.stock.qty).toBe(15);
    });

  });


  // ---------------------------------------------------------
  // PHARMACY REGISTRATION AUTHORIZATION
  // ---------------------------------------------------------

  describe('POST /api/pharmacies/register', () => {

    test('should reject unauthenticated registration', async () => {
      const response = await request(app)
        .post('/api/pharmacies/register')
        .send({
          name: 'New Pharmacy',
          licenseNumber: 'KA-PH-123456',
          address: 'MG Road',
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect([401, 403]).toContain(response.statusCode);
    });

    test('should reject customer registration', async () => {
      const customer = await createUser({
        email: `customer${Date.now()}@example.com`,
        role: 'customer',
        userType: 'patient'
      });

      const token = await loginUser(customer);

      const response = await request(app)
        .post('/api/pharmacies/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Pharmacy',
          licenseNumber: 'KA-12345-67890',
          address: 'MG Road',
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect(response.statusCode).toBe(403);
    });

    test('should reject registration when required address is missing', async () => {
      const owner = await createUser();

      const token = await loginUser(owner);

      const response = await request(app)
        .post('/api/pharmacies/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Pharmacy',
          licenseNumber: 'KA-PH-123456',
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should reject invalid coordinates', async () => {
      const owner = await createUser();

      const token = await loginUser(owner);

      const response = await request(app)
        .post('/api/pharmacies/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Pharmacy',
          licenseNumber: 'KA-PH-123456',
          address: 'MG Road',
          lat: 'invalid',
          lon: TEST_LON
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.message)
        .toContain('Valid lat/lon');
    });

    test('should reject missing license number', async () => {
      const owner = await createUser();

      const token = await loginUser(owner);

      const response = await request(app)
        .post('/api/pharmacies/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Pharmacy',
          address: 'MG Road',
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.message)
        .toBe('licenseNumber is required');
    });

    test('should reject invalid license number format', async () => {
      const owner = await createUser();

      const token = await loginUser(owner);

      const response = await request(app)
        .post('/api/pharmacies/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Pharmacy',
          licenseNumber: 'INVALID',
          address: 'MG Road',
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.message)
        .toBe('Invalid licenseNumber format');
    });

    test('should register pharmacy when Overpass returns no matches', async () => {
      queryPharmacies.mockResolvedValue([]);

      const owner = await createUser();

      const token = await loginUser(owner);

      const response = await request(app)
        .post('/api/pharmacies/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Medical Pharmacy',
          licenseNumber: 'KA-PH-123456',
          address: 'MG Road',
          lat: TEST_LAT,
          lon: TEST_LON,
          contact: '9876543210'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.pharmacyId).toBeDefined();
      expect(response.body.data.verified).toBe('unverified');

      const saved = await Pharmacy.findById(
        response.body.data.pharmacyId
      );

      expect(saved).not.toBeNull();
      expect(saved.name).toBe('New Medical Pharmacy');
      expect(saved.owner.toString()).toBe(owner._id.toString());
      expect(saved.verified).toBe('unverified');
    });

    test('should automatically verify when Overpass match is strong', async () => {
      queryPharmacies.mockResolvedValue([
        {
          pharmacy_name: 'Apollo Pharmacy',
          coordinates: {
            lat: TEST_LAT,
            lon: TEST_LON
          },
          osm_id: 'osm-123'
        }
      ]);

      const owner = await createUser();

      const token = await loginUser(owner);

      const response = await request(app)
        .post('/api/pharmacies/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Apollo Pharmacy',
          licenseNumber: 'KA-PH-123456',
          address: 'MG Road',
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.verified).toBe('auto');

      expect(response.body.data.matchCandidate).toBeDefined();
      expect(response.body.data.matchCandidate.osm_id)
        .toBe('osm-123');
    });

    test('should prevent duplicate pharmacy for the same owner', async () => {
      queryPharmacies.mockResolvedValue([]);

      const owner = await createUser();

      const token = await loginUser(owner);

      const first = await request(app)
        .post('/api/pharmacies/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'First Pharmacy',
          licenseNumber: 'KA-PH-111111',
          address: 'MG Road',
          lat: TEST_LAT,
          lon: TEST_LON
        });

      expect(first.statusCode).toBe(201);

      const second = await request(app)
        .post('/api/pharmacies/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Second Pharmacy',
          licenseNumber: 'KA-PH-222222',
          address: 'Brigade Road',
          lat: TEST_LAT + 0.01,
          lon: TEST_LON + 0.01
        });

      expect(second.statusCode).toBe(409);
      expect(second.body.message)
        .toContain('already have a registered pharmacy');
    });

  });

});