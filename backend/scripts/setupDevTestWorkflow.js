/**
 * Safe Development-Only Demonstration Setup Script
 * Sets up isolated test accounts and a verified test pharmacy in `medifast_demo`.
 *
 * Safety Checks:
 * - Only runs if database name is 'medifast_demo' and NODE_ENV is not 'production'.
 * - Non-destructive (upsert-only, preserves existing demo records).
 */

const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

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

async function setup() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SAFETY ABORT: Demo setup cannot run in production');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in backend/.env');
  }

  const configuredDb = new URL(process.env.MONGODB_URI).pathname.slice(1);
  if (decodeURIComponent(configuredDb) !== 'medifast_demo') {
    throw new Error('SAFETY ABORT: Database URI must explicitly specify medifast_demo');
  }

  const requiredPasswords = ['DEMO_ADMIN_PASSWORD', 'DEMO_OWNER_PASSWORD', 'DEMO_PATIENT_PASSWORD'];
  for (const key of requiredPasswords) {
    if (!process.env[key] || process.env[key].length < 12) {
      throw new Error('SAFETY ABORT: ' + key + ' must contain at least 12 characters');
    }
  }

  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGODB_URI);

  const dbName = mongoose.connection.name;
  console.log(`Active database: ${dbName}`);

  if (dbName !== 'medifast_demo') {
    throw new Error(`SAFETY ABORT: Refusing to seed non-demo database: "${dbName}"`);
  }

  // 1. Upsert Medicines
  console.log('1. Upserting catalog medicines...');
  for (const m of MEDICINES) {
    await Medicine.findOneAndUpdate(
      { name: m.name },
      { $setOnInsert: m },
      { upsert: true, new: true }
    );
  }
  const allMeds = await Medicine.find({}).lean();
  console.log(`   Catalog medicines ready: ${allMeds.length}`);

  // Create medicine map for easy lookup
  const medMap = new Map();
  allMeds.forEach(m => {
    medMap.set(m.name.toLowerCase(), m._id);
    if (m.generic_name) medMap.set(m.generic_name.toLowerCase(), m._id);
  });

  // Existing stock records are intentionally left unchanged.

  // 3. Upsert test users
  console.log('3. Upserting test demonstration users...');
  async function upsertUser(email, phone, userData, plainPassword) {
    let u = await User.findOne({ email });
    if (u && String(u.phone) !== String(phone)) {
      throw new Error('SAFETY ABORT: Existing demo email has a different phone number');
    }
    if (!u && await User.exists({ phone })) {
      throw new Error('SAFETY ABORT: Demo phone number belongs to another account');
    }
    if (!u) {
      u = new User({
        email,
        phone,
        ...userData,
        password: plainPassword
      });
      await u.save();
    } else {
      if (u.role !== userData.role || u.userType !== userData.userType || u.fullName !== userData.fullName) {
        throw new Error('SAFETY ABORT: Existing demo account identity or role does not match expected values');
      }
      // Preserve all existing account details, including role and password.
    }
    return u;
  }

  const adminUser = await upsertUser('admin.test@medifast.com', '9000000011', {
    fullName: 'MediFast Administrator',
    role: 'admin',
    userType: 'admin',
    isActive: true
  }, process.env.DEMO_ADMIN_PASSWORD);

  const ownerUser = await upsertUser('owner.test@medifast.com', '9000000002', {
    fullName: 'Verified Pharmacy Owner',
    role: 'pharmacy',
    userType: 'pharmacy',
    isActive: true,
    pharmacyDetails: {
      licenseNumber: 'KA-MED-99999',
      pharmacyName: 'MediFast Verified Healthcare Pharmacy (Test)',
      verified: false
    }
  }, process.env.DEMO_OWNER_PASSWORD);

  const patientUser = await upsertUser('patient.test@medifast.com', '9000000003', {
    fullName: 'Test Patient Customer',
    role: 'customer',
    userType: 'patient',
    isActive: true
  }, process.env.DEMO_PATIENT_PASSWORD);

  console.log('   Users ready: admin.test@medifast.com, owner.test@medifast.com, patient.test@medifast.com');

  // 4. Upsert Verified Test Pharmacy
  // Positioned at JP Nagar (12.885000, 77.585000) ~350m from demo coords (12.882625, 77.583950)
  console.log('4. Upserting verified test pharmacy...');
  const verifiedCoords = [77.585000, 12.885000]; // [lon, lat]
  const existingDemoPh = await Pharmacy.findOne({ name: 'MediFast Verified Healthcare Pharmacy (Test)' });
  if (existingDemoPh && (String(existingDemoPh.owner) !== String(ownerUser._id) || existingDemoPh.verified !== 'demo')) {
    throw new Error('SAFETY ABORT: Existing pharmacy ownership or demo status does not match');
  }
  const verifiedPh = await Pharmacy.findOneAndUpdate(
    { name: 'MediFast Verified Healthcare Pharmacy (Test)' },
    {
      $setOnInsert: {
        owner: ownerUser._id,
        licenseNumber: 'KA-MED-99999',
        verified: 'demo',
        address: {
          street: '15th Cross, 2nd Phase, JP Nagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          zipCode: '560078',
          country: 'India',
          coordinates: verifiedCoords
        },
        addressNormalized: '15th Cross 2nd Phase JP Nagar Bengaluru Karnataka 560078 India',
        location: {
          type: 'Point',
          coordinates: verifiedCoords
        },
        contact_info: {
          phone: '+91-9876500001',
          email: 'verified.pharmacy@medifast.local',
          website: 'https://medifast.local'
        },
        opening_hours: {
          mon: '09:00-22:00',
          tue: '09:00-22:00',
          wed: '09:00-22:00',
          thu: '09:00-22:00',
          fri: '09:00-22:00',
          sat: '09:00-22:00',
          sun: '10:00-18:00'
        }
      }
    },
    { upsert: true, new: true }
  );
  console.log(`   Verified test pharmacy ready: ${verifiedPh.name} (_id: ${verifiedPh._id})`);

  // 5. Seed stock for verified test pharmacy
  console.log('5. Upserting stock inventory for verified test pharmacy...');
  const testStockItems = [
    { medName: 'Paracetamol 500mg', quantity: 100, unitPrice: 5.5, unit: 'tabs' },
    { medName: 'Ibuprofen 400mg', quantity: 50, unitPrice: 8.0, unit: 'tabs' },
    { medName: 'Amoxicillin 500mg', quantity: 30, unitPrice: 12.0, unit: 'caps' },
    { medName: 'Cetirizine 10mg', quantity: 75, unitPrice: 3.5, unit: 'tabs' },
    { medName: 'Pantoprazole 40mg', quantity: 40, unitPrice: 9.0, unit: 'tabs' }
  ];

  for (const item of testStockItems) {
    const medDoc = await Medicine.findOne({ name: item.medName });
    if (medDoc) {
      await Stock.findOneAndUpdate(
        { pharmacy: verifiedPh._id, medicine: medDoc._id },
        {
          $setOnInsert: {
            medicineName: item.medName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unit: item.unit,
            lastUpdated: new Date()
          }
        },
        { upsert: true, new: true }
      );
    }
  }
  console.log('   Stock inventory for verified test pharmacy upserted.');

  // 6. Summary check
  const totalPh = await Pharmacy.countDocuments();
  const totalMed = await Medicine.countDocuments();
  const totalStock = await Stock.countDocuments();
  console.log('--------------------------------------------------');
  console.log('✅ Setup Complete for medifast_demo:');
  console.log(`   Total Pharmacies: ${totalPh}`);
  console.log(`   Total Medicines:  ${totalMed}`);
  console.log(`   Total Stocks:     ${totalStock}`);
  console.log('   Test Accounts:');
  console.log('--------------------------------------------------');

  await mongoose.disconnect();
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
