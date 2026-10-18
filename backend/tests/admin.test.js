
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(120000);
process.env.NODE_ENV = 'test';

jest.mock('express-rate-limit', () => {
  return () => (req, res, next) => next();
});

jest.mock('../services/overpassService', () => ({
  queryPharmacies: jest.fn(),
  queryNearbyCached: jest.fn(),
  getElementById: jest.fn()
}));

jest.mock('../services/notificationService', () => ({
  sendApproved: jest.fn().mockResolvedValue(undefined),
  sendRejected: jest.fn().mockResolvedValue(undefined)
}));

const app = require('../server');
const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');

let mongoServer;
let adminToken;
let customerToken;
let pharmacyId;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const admin = await User.create({
    fullName: 'Test Administrator',
    email: 'testadmin@example.com',
    password: 'Test@1234',
    phone: '9876543210',
    role: 'admin',
    userType: 'admin'
  });

  const customer = await User.create({
    fullName: 'Test Customer',
    email: 'testcustomer@example.com',
    password: 'Test@1234',
    phone: '9876543211',
    role: 'customer',
    userType: 'patient'
  });

  adminToken = jwt.sign(
    { id: admin._id.toString() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

  customerToken = jwt.sign(
    { id: customer._id.toString() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );
});

beforeEach(async () => {
  await Pharmacy.deleteMany({});

  const pharmacy = await Pharmacy.create({
    name: 'Test Admin Pharmacy',
    licenseNumber: 'KA-TEST-12345',
    addressNormalized: 'MG Road Bengaluru',
    location: {
      type: 'Point',
      coordinates: [77.5946, 12.9716]
    },
    verified: 'unverified'
  });

  pharmacyId = pharmacy._id.toString();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe('Admin pharmacy approval security', () => {
  const approvalUrl = () =>
    `/api/admin/pharmacies/${pharmacyId}/approve`;

  test('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .patch(approvalUrl())
      .send({});

    expect(res.statusCode).toBe(401);
  });

  test('rejects non-admin users', async () => {
    const res = await request(app)
      .patch(approvalUrl())
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});

    expect(res.statusCode).toBe(403);
  });

  test('rejects approval without confirmation', async () => {
    const res = await request(app)
      .patch(approvalUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        verificationNote: 'License and ownership independently checked.'
      });

    expect(res.statusCode).toBe(400);

    const pharmacy = await Pharmacy.findById(pharmacyId);
    expect(pharmacy.verified).toBe('unverified');
  });

  test('rejects approval without verification note', async () => {
    const res = await request(app)
      .patch(approvalUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ verificationConfirmed: true });

    expect(res.statusCode).toBe(400);

    const pharmacy = await Pharmacy.findById(pharmacyId);
    expect(pharmacy.verified).toBe('unverified');
  });

  test('rejects insufficient verification note', async () => {
    const res = await request(app)
      .patch(approvalUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        verificationConfirmed: true,
        verificationNote: 'Checked'
      });

    expect(res.statusCode).toBe(400);
  });

  test('approves with confirmation and records audit note', async () => {
    const note =
      'License and ownership independently checked against records.';

    const res = await request(app)
      .patch(approvalUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        verificationConfirmed: true,
        verificationNote: note
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const pharmacy = await Pharmacy.findById(pharmacyId);

    expect(pharmacy.verified).toBe('manual');

    const approvalEntry = pharmacy.auditTrail.find(
      entry => entry.action === 'approve'
    );

    expect(approvalEntry).toBeDefined();
    expect(approvalEntry.note).toContain(note);
  });
});
