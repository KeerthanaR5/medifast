// One-off script to test quick-register endpoint
const crypto = require('crypto');

async function run() {
  const ts = Date.now();
  const phone = (Math.floor(6000000000 + Math.random() * 3999999999)).toString();
  const payload = {
    fullName: `Test Patient ${ts}`,
    email: `patient_${ts}@example.com`,
    password: 'secret123',
    phone,
    userType: 'patient'
  };

  const res = await fetch('http://localhost:5000/api/auth/quick-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text);
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
