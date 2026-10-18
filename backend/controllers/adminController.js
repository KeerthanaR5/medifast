const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');
const { queryPharmacies, getElementById } = require('../services/overpassService');
const { sendApproved, sendRejected } = require('../services/notificationService');

async function notifyApproved(ph) {
  if (!ph?.owner) return;
  const user = await User.findById(ph.owner).lean();
  await sendApproved(user, ph);
}
async function notifyRejected(ph) {
  if (!ph?.owner) return;
  const user = await User.findById(ph.owner).lean();
  await sendRejected(user, ph, ph.reviewNote);
}

const SCORE_THRESHOLD = 0.7;

// GET /api/admin/pharmacies/pending
// List unverified or low-scored auto matches
async function listPending(req, res) {
  try {
    const items = await Pharmacy.find({
      $or: [
        { verified: 'unverified' },
        { verified: 'auto', autoMatchScore: { $lt: SCORE_THRESHOLD } },
      ]
    }).select({
      name: 1,
      addressNormalized: 1,
      verified: 1,
      autoMatchScore: 1,
      externalId: 1,
      owner: 1,
      location: 1,
      createdAt: 1,
    }).lean();

    res.json({ success: true, count: items.length, data: items });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list pending pharmacies' });
  }
}

// Helper to compute best candidate on demand
function normalizeName(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function jaroWinkler(a, b) {
  if (!a || !b) return 0; a=a.toLowerCase(); b=b.toLowerCase(); const m=Math.floor(Math.max(a.length,b.length)/2)-1; let matches=0, trans=0; const am=new Array(a.length).fill(false), bm=new Array(b.length).fill(false); for (let i=0;i<a.length;i++){ const s=Math.max(0,i-m), e=Math.min(i+m+1,b.length); for (let j=s;j<e;j++){ if(!bm[j]&&a[i]===b[j]){am[i]=bm[j]=true;matches++;break;}}} if(!matches) return 0; let k=0; for(let i=0;i<a.length;i++){ if(am[i]){ while(!bm[k])k++; if(a[i]!==b[k]) trans++; k++; }} trans/=2; const j=(matches/a.length + matches/b.length + (matches-trans)/matches)/3; let p=0; for(; p<Math.min(4,a.length,b.length)&&a[p]===b[p]; p++); return j + p*0.1*(1-j); }
function proximityScore(m){ if(m==null) return 0; if(m<=20) return 1; if(m<=50) return 0.9; if(m<=100) return 0.7; if(m<=200) return 0.5; return 0; }

async function computeBestCandidate(ph) {
  if (!ph?.location?.coordinates || ph.location.coordinates.length !== 2) return null;
  const [lon, lat] = ph.location.coordinates;
  const candidates = await queryPharmacies(lat, lon, 100);
  const nameN = normalizeName(ph.name);
  let best = null;
  for (const c of candidates) {
    const cName = normalizeName(c.pharmacy_name||'');
    const nameSim = jaroWinkler(nameN, cName);
    let dist=null; if (c.coordinates?.lat!=null && c.coordinates?.lon!=null){
      const R=6371000, toRad=(v)=>(v*Math.PI)/180; const dLat=toRad(c.coordinates.lat-lat), dLon=toRad(c.coordinates.lon-lon);
      const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat))*Math.cos(toRad(c.coordinates.lat))*Math.sin(dLon/2)**2; dist=2*R*Math.asin(Math.sqrt(a));
    }
    const score = 0.6*proximityScore(dist) + 0.4*nameSim;
    if (!best || score>best.score) best={ candidate:c, score, distance:dist };
  }
  return best;
}

// GET /api/admin/pharmacies/:id
async function getPharmacyDetail(req, res) {
  try {
    const ph = await Pharmacy.findById(req.params.id).lean();
    if (!ph) return res.status(404).json({ success:false, message:'Not found' });

    let candidate = null;
let candidateLookupUnavailable = false;

try {
  if (ph.externalId) {
    candidate = await getElementById(ph.externalId);
  } else {
    const best = await computeBestCandidate(ph);

    candidate = best
      ? {
          ...best.candidate,
          score: best.score,
          distance_m:
            best.distance != null
              ? Math.round(best.distance)
              : null
        }
      : null;
  }
} catch (error) {
  console.warn(
    'External pharmacy lookup unavailable:',
    error.message
  );

  candidate = null;
  candidateLookupUnavailable = true;
}

    res.json({ success:true, data: { pharmacy: ph, candidate, candidateLookupUnavailable } });
  } catch (e) {
    res.status(500).json({ success:false, message:'Failed to get pharmacy detail' });
  }
}

// PUT /api/admin/pharmacies/:id/approve
async function approvePharmacy(req, res) {
  try {
    const ph = await Pharmacy.findById(req.params.id);
    if (!ph) return res.status(404).json({ success:false, message:'Not found' });
    const { externalId } = req.body || {};
    ph.verified = 'manual';
    if (externalId) ph.externalId = String(externalId);
    // Audit entry
    ph.auditTrail = ph.auditTrail || [];
    ph.auditTrail.push({ action: 'approve', admin: req.user?.id || null, note: externalId ? `externalId=${externalId}` : undefined });
    try {
      await ph.save();
    } catch (e) {
      if (e && e.code === 11000 && e.keyPattern && e.keyPattern.externalId) {
        return res.status(409).json({ success:false, message: 'ExternalId already linked to another pharmacy' });
      }
      throw e;
    }

    // Send notification without affecting the saved approval
try {
  await notifyApproved(ph);
} catch (notificationError) {
  console.error(
    'Pharmacy approved, but owner notification failed:',
    notificationError
  );
}

res.json({
  success: true,
  data: {
    pharmacyId: ph._id,
    verified: ph.verified
  }
});
    } catch (e) {
    console.error('Failed to approve pharmacy:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to approve pharmacy'
    });
  }
}

// PUT /api/admin/pharmacies/:id/reject

async function rejectPharmacy(req, res) {
  try {
    const ph = await Pharmacy.findById(req.params.id);
    if (!ph) return res.status(404).json({ success:false, message:'Not found' });
    const { reviewNote } = req.body || {};
    ph.verified = 'rejected';
    ph.reviewNote = reviewNote || ph.reviewNote;
    // Audit entry
    ph.auditTrail = ph.auditTrail || [];
    ph.auditTrail.push({ action: 'reject', admin: req.user?.id || null, note: reviewNote });
    await ph.save();

// Notification failure must not change the saved rejection result
try {
  await notifyRejected(ph);
} catch (notificationError) {
  console.error(
    'Pharmacy rejected, but owner notification failed:',
    notificationError
  );
}

res.json({
  success: true,
  data: {
    pharmacyId: ph._id,
    verified: ph.verified
  }
});
  } catch (e) {
    res.status(500).json({ success:false, message:'Failed to reject pharmacy' });
  }
}

module.exports = { listPending, getPharmacyDetail, approvePharmacy, rejectPharmacy };
// GET /api/admin/pharmacies/:id/audit
async function getAudit(req, res) {
  try {
    const ph = await Pharmacy.findById(req.params.id).select({ auditTrail: 1, name: 1 }).lean();
    if (!ph) return res.status(404).json({ success:false, message:'Not found' });
    res.json({ success:true, data: ph.auditTrail || [] });
  } catch (e) {
    res.status(500).json({ success:false, message:'Failed to get audit trail' });
  }
}

module.exports.getAudit = getAudit;
