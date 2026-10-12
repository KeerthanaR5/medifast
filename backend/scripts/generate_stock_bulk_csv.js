const fs = require('fs');
const path = require('path');

const outPath = path.resolve(__dirname, '..', '..', 'sample_stock_bulk_upload_1000.csv');
const header = 'medicineName,quantity,unit,unitPrice\n';

const baseNames = [
  'Paracetamol 500mg', 'Ibuprofen 400mg', 'Amoxicillin 500mg', 'Azithromycin 500mg', 'Cetirizine 10mg',
  'Levocetirizine 5mg', 'Pantoprazole 40mg', 'Omeprazole 20mg', 'Metformin 500mg', 'Glibenclamide 5mg',
  'Amlodipine 5mg', 'Losartan 50mg', 'Atorvastatin 10mg', 'Rosuvastatin 10mg', 'Salbutamol Inhaler',
  'Budesonide Inhaler', 'Doxycycline 100mg', 'Ciprofloxacin 500mg', 'Loperamide 2mg', 'ORS Pack',
  'Vitamin C 500mg', 'Vitamin D3 1000 IU', 'Calcium + D3', 'Folic Acid 5mg', 'Iron Tablets',
  'Domperidone 10mg', 'Diclofenac 50mg', 'Ranitidine 150mg', 'Cough Syrup', 'Antiseptic Cream',
  'Bandages', 'Surgical Gloves', 'Face Masks', 'Thermometer', 'Blood Pressure Monitor',
  'Glucometer Strips', 'Insulin Injection', 'Eye Drops', 'Ear Drops', 'Multivitamin Tablets',
  'Protein Powder', 'Whey Protein', 'Electrolyte Powder', 'Antacid Tablets', 'Laxative Tablets',
  'Sleeping Pills', 'Pain Relief Gel', 'Antifungal Cream', 'Moisturizing Cream', 'Sunscreen Lotion',
  'Hand Sanitizer', 'Disinfectant Spray'
];

const units = ['tabs','caps','ml','bottle','pack','unit'];

function genRow(i) {
  const base = baseNames[i % baseNames.length];
  const name = `${base} - lot ${Math.floor(i/baseNames.length)+1}`;
  const quantity = ((i * 13) % 200) + 1; // 1..200
  const unit = units[i % units.length];
  // price with two decimals between 1.00 and 500.99
  const priceWhole = ((i * 37) % 500) + 1;
  const priceCents = (i % 100) / 100;
  const unitPrice = (priceWhole + priceCents).toFixed(2);
  return `${name.replace(/,/g,'')} ,${quantity},${unit},${unitPrice}`;
}

let out = header;
for (let i=1;i<=1000;i++) {
  out += genRow(i) + '\n';
}

fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', outPath);
