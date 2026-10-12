/* One-off script to fix pharmacy licenseNumber index */
const mongoose = require('mongoose');
const path = require('path');

// Load env: prefer backend/config/.env, then fallback to backend/.env
require('dotenv').config({ path: path.join(__dirname, '..', 'config', '.env') });
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set in config/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.collection('users');

  try {
    const indexes = await col.indexes();
    const idx = indexes.find(i => i.name === 'pharmacyDetails.licenseNumber_1');
    if (idx) {
      console.log('Dropping existing index: pharmacyDetails.licenseNumber_1');
      await col.dropIndex('pharmacyDetails.licenseNumber_1');
    } else {
      console.log('No existing pharmacyDetails.licenseNumber_1 index to drop');
    }
  } catch (e) {
    console.warn('Warning while dropping index:', e.message);
  }

  // Create partial unique index
  console.log('Creating partial unique index on pharmacyDetails.licenseNumber');
  await col.createIndex(
    { 'pharmacyDetails.licenseNumber': 1 },
    { unique: true, partialFilterExpression: { 'pharmacyDetails.licenseNumber': { $exists: true } } }
  );

  console.log('Index fix complete.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Index fix failed:', err);
  process.exit(1);
});
