/*
  Seed script (hardened)
  - Inserts ~30 common medicines
  - Creates one admin and one demo pharmacy owner
  - Seeds exactly one demo-owned pharmacy with licenseNumber and geo indexes
  - Seeds some stock for the demo pharmacy
*/

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load backend/.env
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn(`⚠️  backend/.env not found at ${envPath}. Using process env.`);
}

const { User, Pharmacy, Medicine, Stock } = require('../models');

const MEDICINES = [
  { name: 'Paracetamol 500mg', generic_name: 'Paracetamol', category: 'Analgesic' },
  { name: 'Ibuprofen 400mg', generic_name: 'Ibuprofen', category: 'NSAID' },
  { name: 'Amoxicillin 500mg', generic_name: 'Amoxicillin', category: 'Antibiotic' },
  { name: 'Azithromycin 500mg', generic_name: 'Azithromycin', category: 'Antibiotic' },
  { name: 'Cetirizine 10mg', generic_name: 'Cetirizine', category: 'Antihistamine' },
  { name: 'Levocetirizine 5mg', generic_name: 'Levocetirizine', category: 'Antihistamine' },
  { name: 'Pantoprazole 40mg', generic_name: 'Pantoprazole', category: 'Antacid' },
  { name: 'Omeprazole 20mg', generic_name: 'Omeprazole', category: 'Antacid' },
  { name: 'Metformin 500mg', generic_name: 'Metformin', category: 'Antidiabetic' },
  { name: 'Glibenclamide 5mg', generic_name: 'Glibenclamide', category: 'Antidiabetic' },
  { name: 'Amlodipine 5mg', generic_name: 'Amlodipine', category: 'Antihypertensive' },
  { name: 'Losartan 50mg', generic_name: 'Losartan', category: 'Antihypertensive' },
  { name: 'Atorvastatin 10mg', generic_name: 'Atorvastatin', category: 'Lipid-lowering' },
  { name: 'Rosuvastatin 10mg', generic_name: 'Rosuvastatin', category: 'Lipid-lowering' },
  { name: 'Salbutamol Inhaler', generic_name: 'Salbutamol', category: 'Respiratory' },
  { name: 'Budesonide Inhaler', generic_name: 'Budesonide', category: 'Respiratory' },
  { name: 'Doxycycline 100mg', generic_name: 'Doxycycline', category: 'Antibiotic' },
  { name: 'Ciprofloxacin 500mg', generic_name: 'Ciprofloxacin', category: 'Antibiotic' },
  { name: 'Loperamide 2mg', generic_name: 'Loperamide', category: 'Antidiarrheal' },
  { name: 'ORS Pack', generic_name: 'Oral Rehydration Salts', category: 'Electrolyte' },
  { name: 'Vitamin C 500mg', generic_name: 'Ascorbic Acid', category: 'Supplement' },
  { name: 'Vitamin D3 1000 IU', generic_name: 'Cholecalciferol', category: 'Supplement' },
  { name: 'Calcium + D3', generic_name: 'Calcium + Vitamin D3', category: 'Supplement' },
  { name: 'Folic Acid 5mg', generic_name: 'Folic Acid', category: 'Supplement' },
  { name: 'Iron Tablets', generic_name: 'Ferrous Sulfate', category: 'Supplement' },
  { name: 'Domperidone 10mg', generic_name: 'Domperidone', category: 'Antiemetic' },
  { name: 'Ondansetron 4mg', generic_name: 'Ondansetron', category: 'Antiemetic' },
  { name: 'Amoxicillin + Clavulanate', generic_name: 'Amoxicillin + Clavulanate', category: 'Antibiotic' },
  { name: 'Clarithromycin 500mg', generic_name: 'Clarithromycin', category: 'Antibiotic' },
  { name: 'Lisinopril 10mg', generic_name: 'Lisinopril', category: 'Antihypertensive' }
];

const DEMO_PHARMACY = { name: 'Demo Care Pharmacy', city: 'Bengaluru', coords: [77.5946, 12.9716] };

async function main() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set in backend/.env');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 10 });
    console.log('✅ Connected');

    // Seed medicines
    console.log('💊 Seeding medicines...');
    const medOps = MEDICINES.map(m => ({ updateOne: { filter: { name: m.name, generic_name: m.generic_name }, update: { $setOnInsert: m }, upsert: true } }));
    await Medicine.bulkWrite(medOps);
    const medicines = await Medicine.find({}).lean();
    console.log(`✅ Medicines upserted: ${medicines.length}`);

    // Create admin and pharmacy owner users
    console.log('👤 Seeding users (admin + owner)...');
    const [admin, owner] = await Promise.all([
      User.findOneAndUpdate(
        { email: 'admin@medifast.local' },
        { $setOnInsert: { fullName: 'Admin', email: 'admin@medifast.local', password: 'Admin@1234', phone: '9000000001', role: 'admin', userType: 'admin' } },
        { upsert: true, new: true }
      ),
      User.findOneAndUpdate(
        { email: 'owner@medifast.local' },
        { $setOnInsert: { fullName: 'Demo Owner', email: 'owner@medifast.local', password: 'Owner@1234', phone: '9000000002', role: 'pharmacy', userType: 'pharmacy', pharmacyDetails: { licenseNumber: 'DL-DEM0-1234', pharmacyName: DEMO_PHARMACY.name } } },
        { upsert: true, new: true }
      )
    ]);

    // Seed exactly one demo-owned pharmacy
    console.log('🏥 Seeding demo-owned pharmacy...');
    const demoPh = await Pharmacy.findOneAndUpdate(
      { name: DEMO_PHARMACY.name },
      {
        $setOnInsert: {
          name: DEMO_PHARMACY.name,
          owner: owner._id,
          licenseNumber: 'DL-DEM0-1234',
          verified: 'manual',
          address: {
            street: 'Main Road',
            city: DEMO_PHARMACY.city,
            state: DEMO_PHARMACY.city,
            country: 'India',
            coordinates: DEMO_PHARMACY.coords
          },
          addressNormalized: `${DEMO_PHARMACY.name}, ${DEMO_PHARMACY.city}, India`,
          location: { type: 'Point', coordinates: DEMO_PHARMACY.coords },
          contact_info: { phone: '+91-9000000000', email: 'demo.pharmacy@example.com' }
        }
      },
      { upsert: true, new: true }
    ).lean();
    console.log('✅ Demo pharmacy upserted:', demoPh.name);

    // Seed some stock for the demo pharmacy
    console.log('📦 Seeding stock for demo pharmacy...');
    const selection = [...medicines].sort(() => 0.5 - Math.random()).slice(0, 10);
    const stockOps = selection.map(m => ({
      updateOne: {
        filter: { pharmacy: demoPh._id, medicine: m._id },
        update: { $set: { quantity: Math.floor(Math.random() * 51), unitPrice: 100 + Math.floor(Math.random() * 400), unit: 'unit', lastUpdated: new Date() } },
        upsert: true
      }
    }));
    if (stockOps.length) await Stock.bulkWrite(stockOps);
    const stockCount = await Stock.countDocuments({ pharmacy: demoPh._id });
    console.log(`✅ Stock records for demo pharmacy: ${stockCount}`);

    // Ensure indexes (idempotent)
    console.log('🧭 Ensuring indexes...');
    await Pharmacy.collection.createIndex({ location: '2dsphere' });
    await Stock.collection.createIndex({ pharmacy: 1, medicine: 1 }, { unique: true });

    console.log('🎉 Seeding completed');
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

main();
