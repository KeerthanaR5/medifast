// Signup payload validators
// Provides middleware to validate pharmacy registration payloads

// Permissive-but-realistic license pattern (e.g., DL-XXXX-1234, KA-PH-123456, etc.)
const LICENSE_REGEX = /^[A-Z]{2}[- ]?[A-Z]{0,3}[- ]?\d{3,8}$/;

function validatePharmacyRegistration(req, res, next) {
  try {
    const { fullName, email, password, phone, pharmacyDetails, address, role } = req.body || {};

    // Basic user fields (some also validated in controller)
    if (!fullName || !email || !password || !phone) {
      return res.status(400).json({ success: false, message: 'fullName, email, password, phone are required' });
    }

    // Pharmacy role required for this validator
    if (role !== 'pharmacy' && !pharmacyDetails) {
      return res.status(400).json({ success: false, message: 'pharmacyDetails required when registering a pharmacy' });
    }

    const details = pharmacyDetails || {};
    const lic = (details.licenseNumber || '').toString().trim().toUpperCase();
    if (!lic || !LICENSE_REGEX.test(lic)) {
      return res.status(400).json({ success: false, message: 'Invalid licenseNumber format' });
    }

    // Minimal address check (allow nested in pharmacyDetails.address or top-level address)
    const addr = details.address || address || {};
    const { city, state, country } = addr;
    if (!city || !state || !country) {
      return res.status(400).json({ success: false, message: 'address.city, address.state, address.country are required' });
    }

    // Optional coordinates check
    if (addr.coordinates) {
      if (!Array.isArray(addr.coordinates) || addr.coordinates.length !== 2 || addr.coordinates.some(n => typeof n !== 'number')) {
        return res.status(400).json({ success: false, message: 'address.coordinates must be [lon, lat] numbers' });
      }
    }

    next();
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Validation error' });
  }
}

module.exports = { validatePharmacyRegistration, LICENSE_REGEX };
