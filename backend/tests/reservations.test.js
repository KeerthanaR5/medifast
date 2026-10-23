const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(120000);
process.env.NODE_ENV = 'test';

jest.mock('express-rate-limit', () => {
  return () => (req, res, next) => next();
});

jest.mock('../services/overpassService', () => ({
  queryPharmacies: jest.fn(),
  queryNearbyCached: jest.fn()
}));

const app = require('../server');
const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');
const Medicine = require('../models/Medicine');
const Stock = require('../models/Stock');
const Reservation = require('../models/Reservation');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

test('reservation test database is isolated', () => {
  expect(mongoose.connection.readyState).toBe(1);
  expect(mongoose.connection.name).toBe('test');
});

test('patient can reserve medicine and stock decreases', async () => {
  const patient = await User.create({
    fullName: 'Test Patient',
    email: 'reservation.patient@example.com',
    password: 'Test@1234',
    phone: '9876543211',
    role: 'customer'
  });

  const pharmacy = await Pharmacy.create({
    name: 'Automated Test Pharmacy',
    verified: 'manual',
    location: {
      type: 'Point',
      coordinates: [77.5946, 12.9716]
    }
  });

  const medicine = await Medicine.create({
    name: 'Paracetamol',
    generic_name: 'Paracetamol',
    category: 'Pain Relief'
  });

  const stock = await Stock.create({
    pharmacy: pharmacy._id,
    medicine: medicine._id,
    quantity: 100,
    unitPrice: 5.5
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({
      email: patient.email,
      password: 'Test@1234'
    });

  expect(login.statusCode).toBe(200);

  const token = login.body.data?.accessToken || login.body.accessToken || login.body.token;

  const response = await request(app)
    .post('/api/reservations')
    .set('Authorization', `Bearer ${token}`)
    .send({
      pharmacyId: pharmacy._id.toString(),
      medicineId: medicine._id.toString(),
      quantity: 2
    });

  expect(response.statusCode).toBe(201);
  expect(response.body.data.status).toBe('pending');

  const updatedStock = await Stock.findById(stock._id);
  expect(updatedStock.quantity).toBe(98);

  const reservation = await Reservation.findById(response.body.data.id);
  expect(reservation.user.toString()).toBe(patient._id.toString());
  expect(reservation.quantity).toBe(2);
});

test('pharmacy owner can confirm a pending reservation', async () => {
  const owner = await User.create({
    fullName: 'Test Pharmacy Owner',
    email: 'confirm.owner@example.com',
    password: 'Test@1234',
    phone: '9876543212',
    role: 'pharmacy'
  });

  const patient = await User.create({
    fullName: 'Confirmation Patient',
    email: 'confirm.patient@example.com',
    password: 'Test@1234',
    phone: '9876543213',
    role: 'customer'
  });

  const pharmacy = await Pharmacy.create({
    name: 'Confirmation Test Pharmacy',
    owner: owner._id,
    verified: 'manual',
    location: {
      type: 'Point',
      coordinates: [77.5946, 12.9716]
    }
  });

  const stock = await Stock.create({
    pharmacy: pharmacy._id,
    medicineName: 'Paracetamol 500mg',
    quantity: 50,
    unitPrice: 5.5
  });

  const reservation = await Reservation.create({
    user: patient._id,
    stock: stock._id,
    quantity: 2,
    status: 'pending',
    expiresAt: new Date(Date.now() + 120 * 60 * 1000)
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({
      email: owner.email,
      password: 'Test@1234'
    });

  expect(login.statusCode).toBe(200);

  const token = login.body.data?.accessToken ||
    login.body.accessToken || login.body.token;

  const response = await request(app)
    .patch(`/api/reservations/${reservation._id}/confirm`)
    .set('Authorization', `Bearer ${token}`);

  expect(response.statusCode).toBe(200);
  expect(response.body.data.status).toBe('confirmed');

  const updated = await Reservation.findById(reservation._id);
  expect(updated.status).toBe('confirmed');
});

test('pharmacy owner can mark a confirmed reservation as picked up', async () => {
  const owner = await User.create({
    fullName: 'Pickup Pharmacy Owner',
    email: 'pickup.owner@example.com',
    password: 'Test@1234',
    phone: '9876543214',
    role: 'pharmacy'
  });

  const patient = await User.create({
    fullName: 'Pickup Patient',
    email: 'pickup.patient@example.com',
    password: 'Test@1234',
    phone: '9876543215',
    role: 'customer'
  });

  const pharmacy = await Pharmacy.create({
    name: 'Pickup Test Pharmacy',
    owner: owner._id,
    verified: 'manual',
    location: {
      type: 'Point',
      coordinates: [77.5946, 12.9716]
    }
  });

  const stock = await Stock.create({
    pharmacy: pharmacy._id,
    medicineName: 'Paracetamol 500mg',
    quantity: 48,
    unitPrice: 5.5
  });

  const reservation = await Reservation.create({
    user: patient._id,
    stock: stock._id,
    quantity: 2,
    status: 'confirmed',
    expiresAt: new Date(Date.now() + 120 * 60 * 1000)
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({
      email: owner.email,
      password: 'Test@1234'
    });

  expect(login.statusCode).toBe(200);

  const token = login.body.data?.accessToken ||
    login.body.accessToken || login.body.token;

  const response = await request(app)
    .patch(`/api/reservations/${reservation._id}/pickup`)
    .set('Authorization', `Bearer ${token}`);

  expect(response.statusCode).toBe(200);
  expect(response.body.data.status).toBe('picked_up');

  const updated = await Reservation.findById(reservation._id);
  expect(updated.status).toBe('picked_up');
});

test('patient cannot confirm their own reservation', async () => {
  const patient = await User.create({
    fullName: 'Unauthorized Test Patient',
    email: 'unauthorized.patient@example.com',
    password: 'Test@1234',
    phone: '9876543216',
    role: 'customer'
  });

  const pharmacy = await Pharmacy.create({
    name: 'Authorization Test Pharmacy',
    verified: 'manual',
    location: {
      type: 'Point',
      coordinates: [77.5946, 12.9716]
    }
  });

  const stock = await Stock.create({
    pharmacy: pharmacy._id,
    medicineName: 'Paracetamol 500mg',
    quantity: 50,
    unitPrice: 5.5
  });

  const reservation = await Reservation.create({
    user: patient._id,
    stock: stock._id,
    quantity: 2,
    status: 'pending',
    expiresAt: new Date(Date.now() + 120 * 60 * 1000)
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({
      email: patient.email,
      password: 'Test@1234'
    });

  expect(login.statusCode).toBe(200);

  const token = login.body.data?.accessToken ||
    login.body.accessToken || login.body.token;

  const response = await request(app)
    .patch(`/api/reservations/${reservation._id}/confirm`)
    .set('Authorization', `Bearer ${token}`);

  expect(response.statusCode).toBe(403);

  const updated = await Reservation.findById(reservation._id);
  expect(updated.status).toBe('pending');
});

test('demo pharmacy cannot accept reservations or reduce stock', async () => {
  const patient = await User.create({
    fullName: 'Demo Restriction Patient',
    email: 'demo.restriction@example.com',
    password: 'Test@1234',
    phone: '9876543217',
    role: 'customer'
  });

  const pharmacy = await Pharmacy.create({
    name: 'Automated Demo Pharmacy',
    verified: 'demo',
    location: {
      type: 'Point',
      coordinates: [77.5946, 12.9716]
    }
  });

  const stock = await Stock.create({
    pharmacy: pharmacy._id,
    medicineName: 'Paracetamol 500mg',
    quantity: 100,
    unitPrice: 5.5
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({
      email: patient.email,
      password: 'Test@1234'
    });

  expect(login.statusCode).toBe(200);

  const token = login.body.data?.accessToken ||
    login.body.accessToken || login.body.token;

  const response = await request(app)
    .post('/api/reservations')
    .set('Authorization', `Bearer ${token}`)
    .send({
      pharmacyId: pharmacy._id.toString(),
      medicineName: 'Paracetamol 500mg',
      quantity: 2
    });

  expect(response.statusCode).toBe(403);

  const updatedStock = await Stock.findById(stock._id);
  expect(updatedStock.quantity).toBe(100);

  const reservationCount = await Reservation.countDocuments({
    user: patient._id
  });

  expect(reservationCount).toBe(0);
});
