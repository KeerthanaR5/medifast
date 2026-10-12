const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', '..'); // project root

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

const units = ['tabs','caps','ml','bottle','pack','unit','pairs','strips'];

const exactMedicines = [
  'Paracetamol 500mg,100,tabs,5.50',
  'Ibuprofen 400mg,50,tabs,8.00',
  'Amoxicillin 500mg,25,caps,12.00',
  'Azithromycin 500mg,30,tabs,15.00',
  'Cetirizine 10mg,75,tabs,3.50',
  'Levocetirizine 5mg,60,tabs,6.00',
  'Pantoprazole 40mg,40,caps,18.00',
  'Omeprazole 20mg,45,caps,14.00',
  'Metformin 500mg,80,tabs,4.50',
  'Glibenclamide 5mg,35,tabs,7.50',
  'Amlodipine 5mg,55,tabs,9.00',
  'Losartan 50mg,40,tabs,11.00',
  'Atorvastatin 10mg,45,tabs,22.00',
  'Rosuvastatin 10mg,30,tabs,28.00',
  'Salbutamol Inhaler,20,units,85.00',
  'Budesonide Inhaler,15,units,120.00',
  'Doxycycline 100mg,50,caps,8.50',
  'Ciprofloxacin 500mg,35,tabs,6.00',
  'Loperamide 2mg,90,tabs,2.50',
  'ORS Pack,200,packs,15.00',
  'Vitamin C 500mg,120,tabs,3.00',
  'Vitamin D3 1000 IU,80,caps,12.00',
  'Calcium + D3,60,tabs,25.00',
  'Folic Acid 5mg,100,tabs,4.00',
  'Iron Tablets,70,tabs,8.50',
  'Domperidone 10mg,45,tabs,5.50',
  'Diclofenac 50mg,60,tabs,4.50',
  'Ranitidine 150mg,80,tabs,3.00',
  'Cough Syrup,25,bottles,45.00',
  'Antiseptic Cream,30,tubes,25.00',
  'Bandages,100,packs,12.00',
  'Surgical Gloves,50,pairs,8.00',
  'Face Masks,200,units,2.50',
  'Thermometer,10,units,35.00',
  'Blood Pressure Monitor,5,units,450.00',
  'Glucometer Strips,500,strips,0.80',
  'Insulin Injection,20,vials,180.00',
  'Eye Drops,40,bottles,22.00',
  'Ear Drops,25,bottles,18.00',
  'Multivitamin Tablets,90,tabs,12.00',
  'Protein Powder,15,tins,250.00',
  'Whey Protein,20,tins,180.00',
  'Electrolyte Powder,60,packs,8.00',
  'Antacid Tablets,120,tabs,2.00',
  'Laxative Tablets,85,tabs,4.50',
  'Sleeping Pills,40,tabs,6.00',
  'Pain Relief Gel,35,tubes,35.00',
  'Antifungal Cream,45,tubes,28.00',
  'Moisturizing Cream,50,tubes,40.00',
  'Sunscreen Lotion,30,bottles,65.00',
  'Hand Sanitizer,80,bottles,15.00',
  'Disinfectant Spray,60,bottles,25.00'
];

function generateExact(rows, outFile) {
  const header = 'medicineName,quantity,unit,unitPrice\n';
  let out = header;
  for (let i = 1; i <= rows; i++) {
    const idx = (i - 1) % exactMedicines.length;
    out += exactMedicines[idx] + '\n';
  }
  fs.writeFileSync(outFile, out, 'utf8');
  console.log('Wrote', outFile);
}

const rows = 5000;
for (let i = 0; i < 3; i++) {
  const outFile = path.join(outDir, `bulk_stocks_${i+1}.csv`);
  generateExact(rows, outFile);
}
